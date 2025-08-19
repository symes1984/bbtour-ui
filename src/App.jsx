import React, { useEffect, useMemo, useState } from "react";
import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Search, Filter, MapPin, Star, Loader2 } from "lucide-react";

/**
 * Breaking Bad Tour UI
 * --------------------
 * Drop this component into a Vite + React project (with Tailwind + shadcn/ui).
 * It expects a Spring backend exposing GET /api/v1/locations that returns a Spring Page<Location>.
 * Page JSON shape assumed: { content: Location[], totalElements, totalPages, number, size }.
 * Location shape assumed: { id, name, type, latitude, longitude, address, city, state, description, mustSee }.
 * Adjust the field names in the mapper below if yours differ.
 */

// Fix default Leaflet icon paths when bundling
// (Leaflet tries to load marker icons from an absolute path by default)
// You can replace with custom icons if you like.
// @ts-ignore
const DefaultIcon = new L.Icon({
  iconUrl:
    "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  iconRetinaUrl:
    "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  shadowUrl:
    "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});
L.Marker.prototype.options.icon = DefaultIcon;

const API_BASE = import.meta.env.VITE_API_BASE ?? ""; // e.g., "" when same origin or "http://localhost:8080"

// Map a raw Location (your entity) to a UI-friendly shape and tolerate common naming differences.
function mapLocation(raw) {
  const lat = raw.latitude ?? raw.lat ?? raw.geoLat ?? raw.y ?? null;
  const lng = raw.longitude ?? raw.lng ?? raw.lon ?? raw.long ?? raw.geoLng ?? raw.x ?? null;
  return {
    id: raw.id ?? raw._id ?? raw.uuid ?? Math.random().toString(36).slice(2),
    name: raw.name ?? raw.title ?? "Untitled",
    type: raw.type ?? raw.category ?? "Unknown",
    mustSee: raw.mustSee ?? raw.must_see ?? raw.mustsee ?? false,
    description: raw.description ?? raw.notes ?? "",
    address: raw.address ?? "",
    city: raw.city ?? "",
    state: raw.state ?? raw.region ?? "",
    lat,
    lng,
  };
}

export default function BreakingBadTourUI() {
  const [query, setQuery] = useState("");
  const [type, setType] = useState("");
  const [mustSee, setMustSee] = useState(false);
  const [page, setPage] = useState(0);
  const [size, setSize] = useState(20);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [pageData, setPageData] = useState({ content: [], totalPages: 0, number: 0, size: 20, totalElements: 0 });

  // Fetch options builder based on filters
  const params = useMemo(() => {
    const p = new URLSearchParams();
    if (query) p.set("name", query);
    if (type) p.set("type", type);
    if (mustSee) p.set("mustSee", "true");
    p.set("page", String(page));
    p.set("size", String(size));
    return p.toString();
  }, [query, type, mustSee, page, size]);

  useEffect(() => {
    let cancelled = false;
    async function run() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`${API_BASE}/api/v1/locations?${params}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        if (cancelled) return;
        // Spring Page may be flat content array or wrapped; normalize
        const normalized = {
          content: Array.isArray(json?.content) ? json.content : Array.isArray(json) ? json : [],
          totalPages: json?.totalPages ?? 1,
          number: json?.number ?? 0,
          size: json?.size ?? size,
          totalElements: json?.totalElements ?? (Array.isArray(json?.content) ? json.content.length : Array.isArray(json) ? json.length : 0),
        };
        setPageData(normalized);
      } catch (e) {
        setError(e.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    run();
    return () => { cancelled = true; };
  }, [params, size]);

  const locations = useMemo(() => pageData.content.map(mapLocation), [pageData]);

  // Compute map center: average of available coordinates, or fallback to Albuquerque
  const mapCenter = useMemo(() => {
    const pts = locations.filter(l => typeof l.lat === "number" && typeof l.lng === "number");
    if (!pts.length) return [35.0844, -106.6504]; // Albuquerque, NM
    const avgLat = pts.reduce((s, p) => s + p.lat, 0) / pts.length;
    const avgLng = pts.reduce((s, p) => s + p.lng, 0) / pts.length;
    return [avgLat, avgLng];
  }, [locations]);

  const typeOptions = useMemo(() => {
    // Derive from current page; your backend could expose a /types endpoint if you prefer
    const set = new Set(locations.map(l => l.type).filter(Boolean));
    return Array.from(set).sort();
  }, [locations]);

  return (
    <div className="min-h-screen w-full bg-background text-foreground">
      <header className="sticky top-0 z-20 border-b bg-background/80 backdrop-blur">
        <div className="mx-auto max-w-7xl px-4 py-4 flex items-center gap-3">
          <MapPin className="h-6 w-6" />
          <h1 className="text-xl md:text-2xl font-semibold">Breaking Bad & Better Call Saul Tour</h1>
          <Badge variant="secondary" className="ml-auto">{pageData.totalElements} locations</Badge>
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
                  <Label>Type</Label>
                  <Select value={type} onValueChange={(v) => { setPage(0); setType(v === "__any__" ? "" : v); }}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Any" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__any__">Any</SelectItem>
                      {typeOptions.map(t => (<SelectItem key={t} value={String(t)}>{t}</SelectItem>))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <Label htmlFor="mustSee">Must-see only</Label>
                    <p className="text-xs text-muted-foreground">Show locations flagged as iconic stops</p>
                  </div>
                  <Switch id="mustSee" checked={mustSee} onCheckedChange={(v) => { setPage(0); setMustSee(Boolean(v)); }} />
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
              {locations.map((loc) => (
                typeof loc.lat === "number" && typeof loc.lng === "number" ? (
                  <Marker key={loc.id} position={[loc.lat, loc.lng]}>
                    <Popup>
                      <div className="space-y-1">
                        <div className="font-semibold flex items-center gap-2">
                          {loc.name}
                          {loc.mustSee && <Star className="h-4 w-4"/>}
                        </div>
                        <div className="text-xs text-muted-foreground">{loc.type}</div>
                        {loc.address && <div className="text-xs">{loc.address}{loc.city ? `, ${loc.city}` : ""}{loc.state ? `, ${loc.state}` : ""}</div>}
                        {loc.description && <p className="text-xs mt-2 max-w-[260px]">{loc.description}</p>}
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
            <Button variant="outline" onClick={() => { setQuery(""); setType(""); setMustSee(false); setPage(0); }}>Reset</Button>
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
              {locations.map((loc) => (
                <Card key={loc.id} className="group">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base flex items-center justify-between gap-2">
                      <span className="truncate" title={loc.name}>{loc.name}</span>
                      {loc.mustSee && (
                        <Badge className="shrink-0" variant="secondary"><Star className="h-3 w-3 mr-1"/> Must-see</Badge>
                      )}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="text-sm space-y-2">
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <MapPin className="h-4 w-4"/>
                      <span className="truncate" title={[loc.address, loc.city, loc.state].filter(Boolean).join(", ")}>{[loc.address, loc.city, loc.state].filter(Boolean).join(", ") || "—"}</span>
                    </div>
                    <div className="text-xs uppercase tracking-wide text-muted-foreground">{loc.type || "Unknown"}</div>
                    {loc.description && <p className="text-sm line-clamp-3">{loc.description}</p>}
                    <div className="flex gap-2">
                      {typeof loc.lat === "number" && typeof loc.lng === "number" ? (
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
            <div className="text-sm text-muted-foreground">Page {pageData.number + 1} of {Math.max(1, pageData.totalPages)}</div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" disabled={page <= 0 || loading} onClick={() => setPage(p => Math.max(0, p - 1))}>Previous</Button>
              <Button variant="default" size="sm" disabled={page + 1 >= pageData.totalPages || loading} onClick={() => setPage(p => p + 1)}>Next</Button>
            </div>
          </div>
        </div>
      </main>

      <footer className="mx-auto max-w-7xl px-4 py-8 text-xs text-muted-foreground">
        Data from your Spring API at <code>{API_BASE || window.location.origin}</code>.
      </footer>
    </div>
  );
}
