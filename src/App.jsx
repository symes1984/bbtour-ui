import React, { useEffect, useMemo, useState } from "react";
import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Search, Filter, MapPin, Loader2, Film, Layers } from "lucide-react";

/**
 * Breaking Bad / Better Call Saul Tour UI
 * --------------------------------------
 * Updated to consume your Location schema:
 * {
 *   _id, name, series[], address, city, state, notes,
 *   scenes:[{ show, season, episodes[], description }],
 *   access: "public_business" | "private_residence" | ...,
 *   geolocation: { type: "Point", coordinates: [lng, lat] }
 * }
 *
 * API endpoint (unchanged from your OpenAPI wiring):
 *   GET /api/v1/locations?name&page&size
 * Client-side filters for: series, access
 */

// Fix default Leaflet icon
const DefaultIcon = new L.Icon({
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});
L.Marker.prototype.options.icon = DefaultIcon;

const toNumber = (v) => {
  const n = typeof v === "string" ? parseFloat(v) : v;
  return Number.isFinite(n) ? n : null;
};

const API_BASE = import.meta.env.VITE_API_BASE ?? ""; // e.g., http://localhost:8080

// Friendly label for access
const accessLabel = (a) =>
  ({
    public_business: "Public Business",
    private_residence: "Private Residence",
    private_business: "Private Business",
    public_area: "Public Area",
    restricted: "Restricted",
    private_complex: "Private Complex",
    public_land: "Public Land",
  }[a] ?? (a ? String(a) : "Unknown"));

// Flatten episodes list from scenes
const episodesFromScenes = (scenes) => {
  const set = new Set();
  (Array.isArray(scenes) ? scenes : []).forEach((s) => {
    (Array.isArray(s.episodes) ? s.episodes : []).forEach((e) => set.add(String(e)));
  });
  return Array.from(set);
};

// Map raw schema → UI shape
function mapLocation(raw) {
  const coords = Array.isArray(raw?.geolocation?.coordinates)
    ? raw.geolocation.coordinates
    : [null, null];
  const lng = toNumber(coords[0]);
  const lat = toNumber(coords[1]);
  return {
    id: raw._id ?? raw.id ?? Math.random().toString(36).slice(2),
    name: raw.name ?? "Untitled",
    series: Array.isArray(raw.series) ? raw.series : [],
    address: raw.address ?? "",
    city: raw.city ?? "",
    state: raw.state ?? "",
    notes: raw.notes ?? "",
    scenes: Array.isArray(raw.scenes) ? raw.scenes : [],
    access: raw.access ?? "",
    lat,
    lng,
    episodes: episodesFromScenes(raw.scenes),
  };
}

export default function BreakingBadTourUI() {
  // Server/query state
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const [size, setSize] = useState(20);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [pageData, setPageData] = useState({ content: [], totalPages: 0, page: 0, size: 20, totalElements: 0 });

  // Client-side filters (based on your schema)
  const [seriesFilter, setSeriesFilter] = useState(""); // "Breaking Bad" | "Better Call Saul" | ""
  const [accessFilter, setAccessFilter] = useState("");

  const params = useMemo(() => {
    const p = new URLSearchParams();
    if (query) p.set("name", query);
    p.set("page", String(page));
    p.set("size", String(size));
    return p.toString();
  }, [query, page, size]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`${API_BASE}/api/v1/locations?${params}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        if (cancelled) return;
        const content = Array.isArray(json?.content) ? json.content : Array.isArray(json) ? json : [];
        const normalized = {
          content,
          totalPages: typeof json?.totalPages === "number" ? json.totalPages : 1,
          page: typeof json?.page === "number" ? json.page : (typeof json?.number === "number" ? json.number : 0),
          size: typeof json?.size === "number" ? json.size : size,
          totalElements:
            typeof json?.totalElements === "number"
              ? json.totalElements
              : (Array.isArray(json?.content) ? json.content.length : Array.isArray(json) ? json.length : 0),
        };
        setPageData(normalized);
      } catch (e) {
        setError(e.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [params, size]);

  const locations = useMemo(() => pageData.content.map(mapLocation), [pageData]);

  // Apply client-side filters for series & access
  const visible = useMemo(() => {
    let arr = locations;
    if (seriesFilter) arr = arr.filter((l) => l.series?.includes(seriesFilter));
    if (accessFilter) arr = arr.filter((l) => l.access === accessFilter);
    return arr;
  }, [locations, seriesFilter, accessFilter]);

  // Map center from visible points, fallback to Albuquerque
  const mapCenter = useMemo(() => {
    const pts = visible.filter((l) => Number.isFinite(l.lat) && Number.isFinite(l.lng));
    if (!pts.length) return [35.0844, -106.6504];
    const avgLat = pts.reduce((s, p) => s + p.lat, 0) / pts.length;
    const avgLng = pts.reduce((s, p) => s + p.lng, 0) / pts.length;
    return [avgLat, avgLng];
  }, [visible]);

  const accessOptions = useMemo(() => {
    const set = new Set(visible.map((l) => l.access).filter(Boolean));
    return Array.from(set).sort();
  }, [visible]);

  const allSeries = useMemo(() => {
    const set = new Set();
    locations.forEach((l) => (l.series || []).forEach((s) => set.add(s)));
    return Array.from(set);
  }, [locations]);

  return (
    <div className="min-h-screen w-full bg-background text-foreground">
      <header className="sticky top-0 z-20 border-b bg-background/80 backdrop-blur">
        <div className="mx-auto max-w-7xl px-4 py-4 flex items-center gap-3">
          <MapPin className="h-6 w-6" />
          <h1 className="text-xl md:text-2xl font-semibold">Breaking Bad & Better Call Saul Tour</h1>
          <Badge variant="secondary" className="ml-auto">{visible.length} shown</Badge>
          <Badge variant="outline" className="ml-2">{pageData.totalElements} total</Badge>
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="outline" size="sm" className="gap-2"><Filter className="h-4 w-4"/>Filters</Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-[360px] sm:w-[420px]">
              <SheetHeader>
                <SheetTitle>Filter & Search</SheetTitle>
              </SheetHeader>
              <div className="space-y-6 py-4">
                <div className="space-y-2">
                  <Label htmlFor="q">Search by name</Label>
                  <div className="flex gap-2">
                    <Input id="q" placeholder="Los Pollos Hermanos" value={query} onChange={e => { setPage(0); setQuery(e.target.value); }} />
                    <Button variant="secondary" onClick={() => { setPage(0); setQuery(""); }}>Clear</Button>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Series</Label>
                  <Select value={seriesFilter} onValueChange={(v) => { setPage(0); setSeriesFilter(v === "__any__" ? "" : v); }}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Any" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__any__">Any</SelectItem>
                      {allSeries.map((s) => (
                        <SelectItem key={s} value={String(s)}>{s}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Access</Label>
                  <Select value={accessFilter} onValueChange={(v) => { setPage(0); setAccessFilter(v === "__any__" ? "" : v); }}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Any" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__any__">Any</SelectItem>
                      {accessOptions.map((a) => (
                        <SelectItem key={a} value={String(a)}>{accessLabel(a)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Page size</Label>
                  <Slider min={5} max={50} step={5} value={[size]} onValueChange={(v) => setSize(v[0])} />
                </div>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6 grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Map */}
        <Card className="h-[60vh] lg:h-[78vh] overflow-hidden">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2"><MapPin className="h-5 w-5"/>Map</CardTitle>
          </CardHeader>
          <CardContent className="h-full">
            <MapContainer center={mapCenter} zoom={12} className="h-full w-full rounded-2xl">
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />
              {visible.map((loc) => (
                Number.isFinite(loc.lat) && Number.isFinite(loc.lng) ? (
                  <Marker key={loc.id} position={[loc.lat, loc.lng]}>
                    <Popup>
                      <div className="space-y-1">
                        <div className="font-semibold flex items-center gap-2">
                          {loc.name}
                        </div>
                        <div className="text-xs text-muted-foreground flex items-center gap-2">
                          <Layers className="h-3 w-3"/> {(loc.series || []).join(" · ") || "—"}
                        </div>
                        <div className="text-xs text-muted-foreground">{accessLabel(loc.access)}</div>
                        {(loc.address || loc.city || loc.state) && (
                          <div className="text-xs">{[loc.address, loc.city, loc.state].filter(Boolean).join(", ")}</div>
                        )}
                        {Boolean(loc.episodes?.length) && (
                          <div className="flex flex-wrap items-center gap-1 pt-1">
                            <Film className="h-3 w-3"/>
                            {loc.episodes.map((ep, i) => (
                              <span key={i} className="text-[10px] rounded bg-muted px-1 py-0.5">{ep}</span>
                            ))}
                          </div>
                        )}
                        {loc.notes && <p className="text-xs mt-2 max-w-[260px]">{loc.notes}</p>}
                      </div>
                    </Popup>
                  </Marker>
                ) : null
              ))}
            </MapContainer>
          </CardContent>
        </Card>

        {/* List */}
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground"/>
              <Input className="pl-8" placeholder="Search locations…" value={query} onChange={(e) => { setPage(0); setQuery(e.target.value); }} />
            </div>
            <Button variant="outline" onClick={() => { setQuery(""); setSeriesFilter(""); setAccessFilter(""); setPage(0); }}>Reset</Button>
          </div>

          {error && (
            <Card className="border-destructive/40">
              <CardContent className="py-3 text-sm text-destructive">Error loading locations: {String(error)}</CardContent>
            </Card>
          )}

          {loading ? (
            <div className="flex items-center justify-center h-40 text-muted-foreground gap-2">
              <Loader2 className="h-5 w-5 animate-spin"/> Loading…
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 overflow-auto pr-1" style={{ maxHeight: "63vh" }}>
              {visible.map((loc) => (
                <Card key={loc.id} className="group">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base flex items-center justify-between gap-2">
                      <span className="truncate" title={loc.name}>{loc.name}</span>
                      <div className="flex items-center gap-1">
                        {Boolean(loc.series?.length) && (
                          <span className="text-[10px] text-muted-foreground">{loc.series.join(" · ")}</span>
                        )}
                      </div>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="text-sm space-y-2">
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <MapPin className="h-4 w-4"/>
                      <span className="truncate" title={[loc.address, loc.city, loc.state].filter(Boolean).join(", ")}>{[loc.address, loc.city, loc.state].filter(Boolean).join(", ") || "—"}</span>
                    </div>
                    <div className="text-xs uppercase tracking-wide text-muted-foreground">{accessLabel(loc.access)}</div>
                    {loc.notes && <p className="text-sm line-clamp-3">{loc.notes}</p>}
                    <div className="flex flex-wrap gap-1 items-center">
                      {Boolean(loc.episodes?.length) && (
                        <>
                          <Film className="h-3 w-3"/>
                          {loc.episodes.slice(0, 6).map((ep, i) => (
                            <span key={i} className="text-[10px] rounded bg-muted px-1 py-0.5">{ep}</span>
                          ))}
                          {loc.episodes.length > 6 && (
                            <span className="text-[10px] text-muted-foreground">+{loc.episodes.length - 6} more</span>
                          )}
                        </>
                      )}
                    </div>
                    <div className="flex gap-2">
                      {Number.isFinite(loc.lat) && Number.isFinite(loc.lng) ? (
                        <a
                          className="text-sm underline hover:no-underline"
                          href={`https://www.google.com/maps?q=${loc.lat},${loc.lng}`}
                          target="_blank" rel="noreferrer"
                        >Open in Maps</a>
                      ) : (
                        <span className="text-sm text-muted-foreground">No coordinates</span>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {/* Pagination */}
          <div className="mt-2 flex items-center justify-between">
            <div className="text-sm text-muted-foreground">Page {Number(pageData.page ?? 0) + 1} of {Math.max(1, pageData.totalPages)}</div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" disabled={page <= 0 || loading} onClick={() => setPage(p => Math.max(0, p - 1))}>Previous</Button>
              <Button variant="default" size="sm" disabled={page + 1 >= pageData.totalPages || loading} onClick={() => setPage(p => p + 1)}>Next</Button>
            </div>
          </div>
        </div>
      </main>

      <footer className="mx-auto max-w-7xl px-4 py-8 text-xs text-muted-foreground">
        Data from your API at <code>{API_BASE || window.location.origin}</code> → <code>/api/v1/locations</code>.
        &nbsp;Schema: <code>_id, name, series[], address, city, state, notes, scenes[], access, geolocation</code> (GeoJSON [lng, lat]).
      </footer>
    </div>
  );
}
