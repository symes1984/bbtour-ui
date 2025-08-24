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
 * Breaking Bad / Better Call Saul Tour UI (High-Contrast BrBa Theme)
 * ------------------------------------------------------------------
 * Focused on accessibility + legibility:
 *  - Dark emerald base with strong text contrast
 *  - Buttons restyled (solid + outline) for readability
 *  - Inputs/cards use darker panels and brighter text
 *  - Map switched to dark tiles; popup styled to match
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
  // Inject small theme overrides safely
  const styles = `
  :root{
    --bb-bg:#0a120d;           /* page background */
    --bb-panel:#0c1511;        /* cards/panels */
    --bb-panel-2:#0e1914;      /* alt panel */
    --bb-border:rgba(16,185,129,.28);
    --bb-text:#eafff4;         /* primary text */
    --bb-muted:#9fb2a7;        /* muted text */
    --bb-accent:#10b981;       /* emerald-500 */
    --bb-accent-2:#34d399;     /* emerald-400 */
  }
  html,body{ background:var(--bb-bg); }
  main[data-bb-layout]{ height:var(--bb-app-h, auto); }
  .bb-header{ background:rgba(7,16,12,.85); backdrop-filter: blur(8px); }
  .bb-card{ background:color-mix(in oklab, var(--bb-panel) 94%, black 6%); border-color:var(--bb-border); }
  .bb-card-ghost{ background:color-mix(in oklab, var(--bb-panel-2) 92%, black 8%); border-color:var(--bb-border); }
  .bb-glow{ box-shadow:0 0 0 1px var(--bb-border) inset; }
  .bb-txt{ color:var(--bb-text); }
  .bb-muted{ color:var(--bb-muted); }
  .bb-badge{ background:#053a2c; color:#b9f4dc; border:1px solid #0a5c46; }
  .bb-badge-outline{ color:#b9f4dc; border:1px solid #0a5c46; background:transparent; }
  .bb-btn{ background:var(--bb-accent); color:#042218; font-weight:700; border:1px solid var(--bb-accent); }
  .bb-btn:hover{ background:var(--bb-accent-2); border-color:var(--bb-accent-2); }
  .bb-btn:focus-visible{ outline:2px solid var(--bb-accent-2); outline-offset:2px; }
  .bb-btn-outline{ background:transparent; color:#b9f4dc; border:1px solid var(--bb-accent); }
  .bb-btn-outline:hover{ background:rgba(16,185,129,.1); }
  .bb-input{ background:rgba(15,23,20,.9) !important; color:var(--bb-text) !important; border-color:#0b3f30 !important; }
  .bb-input::placeholder{ color:#7aa394; }
  .leaflet-container{ background:#0b0f0d; }
  .leaflet-popup-content-wrapper{ background:#0b1110; color:var(--bb-text); border:1px solid #134e3c; box-shadow:0 8px 24px rgba(0,0,0,.45); }
  .leaflet-popup-tip{ background:#0b1110; }
  /* High-contrast chips for scene/episode badges */
  .bb-chip{ background:#0a3f30; border:1px solid #0f6e55; color:#eafff4; border-radius:0.375rem; }
  .bb-chip-muted{ background:#0a2c24; border:1px solid #0d4c3b; color:#d4fff0; }
  .bb-scene-text{ color:#eafff4; }
  `;

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
    <div className="min-h-screen w-full" style={{ background: "var(--bb-bg)", color: "var(--bb-text)" }}>
      {/* theme overrides */}
      <style dangerouslySetInnerHTML={{ __html: styles }} />

      <header className="sticky top-0 z-20 border-b border-emerald-900/40 bb-header">
        <div className="mx-auto max-w-7xl px-4 py-4 flex items-center gap-3">
          {/* Periodic tiles */}
          <div className="flex items-center gap-2">
            <div className="grid place-items-center w-9 h-9 rounded-md border border-emerald-700 bg-emerald-900/60 text-emerald-100 font-extrabold leading-none">Br</div>
            <div className="grid place-items-center w-9 h-9 rounded-md border border-emerald-700 bg-emerald-900/60 text-emerald-100 font-extrabold leading-none">Ba</div>
          </div>
          <h1 className="text-lg md:text-xl font-semibold tracking-tight text-emerald-50">Breaking Bad & Better Call Saul Tour</h1>
          <Badge className="ml-auto bb-badge">{visible.length} shown</Badge>
          <Badge variant="outline" className="ml-2 bb-badge-outline">{pageData.totalElements} total</Badge>
          <Sheet>
            <SheetTrigger asChild>
              <Button size="sm" className="bb-btn-outline gap-2"><Filter className="h-4 w-4"/>Filters</Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-[360px] sm:w-[420px] bb-card bb-glow">
              <SheetHeader>
                <SheetTitle className="bb-txt">Filter & Search</SheetTitle>
              </SheetHeader>
              <div className="space-y-6 py-4">
                <div className="space-y-2">
                  <Label htmlFor="q" className="bb-muted">Search by name</Label>
                  <div className="flex gap-2">
                    <Input id="q" className="bb-input" placeholder="Los Pollos Hermanos" value={query} onChange={e => { setPage(0); setQuery(e.target.value); }} />
                    <Button className="bb-btn-outline" onClick={() => { setPage(0); setQuery(""); }}>Clear</Button>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="bb-muted">Series</Label>
                  <Select value={seriesFilter} onValueChange={(v) => { setPage(0); setSeriesFilter(v === "__any__" ? "" : v); }}>
                    <SelectTrigger className="w-full bb-input">
                      <SelectValue placeholder="Any" />
                    </SelectTrigger>
                    <SelectContent className="bb-card">
                      <SelectItem value="__any__">Any</SelectItem>
                      {allSeries.map((s) => (
                        <SelectItem key={s} value={String(s)}>{s}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label className="bb-muted">Access</Label>
                  <Select value={accessFilter} onValueChange={(v) => { setPage(0); setAccessFilter(v === "__any__" ? "" : v); }}>
                    <SelectTrigger className="w-full bb-input">
                      <SelectValue placeholder="Any" />
                    </SelectTrigger>
                    <SelectContent className="bb-card">
                      <SelectItem value="__any__">Any</SelectItem>
                      {accessOptions.map((a) => (
                        <SelectItem key={a} value={String(a)}>{accessLabel(a)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label className="bb-muted">Page size</Label>
                  <Slider min={5} max={50} step={5} value={[size]} onValueChange={(v) => setSize(v[0])} />
                </div>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6 grid grid-cols-1 lg:grid-cols-2 gap-6" data-bb-layout>
        {/* Map */}
        <Card className="h-[60vh] lg:h-[78vh] overflow-hidden bb-card bb-glow">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-emerald-100"><MapPin className="h-5 w-5"/>Map</CardTitle>
          </CardHeader>
          <CardContent className="h-full">
            {/* Center the map inside a bordered wrapper with equal inner spacing */}
<div className="h-full rounded-2xl ring-1 ring-emerald-900/30 p-3">
  <MapContainer
    center={mapCenter}
    zoom={12}
    className="h-full w-full rounded-xl overflow-hidden"
  >
    <TileLayer
      attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
      url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
    />
    {visible.map((loc) => (
      Number.isFinite(loc.lat) && Number.isFinite(loc.lng) ? (
        <Marker key={loc.id} position={[loc.lat, loc.lng]}>
          <Popup>
            <div className="space-y-1 bb-txt">
              <div className="font-semibold flex items-center gap-2">
                {loc.name}
              </div>
              <div className="text-xs bb-muted flex items-center gap-2">
                <Layers className="h-3 w-3"/> {(loc.series || []).join(" · ") || "—"}
              </div>
              <div className="text-xs bb-muted">{accessLabel(loc.access)}</div>
              {(loc.address || loc.city || loc.state) && (
                <div className="text-xs">{[loc.address, loc.city, loc.state].filter(Boolean).join(", ")}</div>
              )}
              {Boolean(loc.episodes?.length) && (
                <div className="flex flex-wrap items-center gap-1 pt-1">
                  <Film className="h-3 w-3 text-emerald-200"/>
                            {loc.episodes.map((ep, i) => (
                              <span key={i} className="text-[11px] leading-4 bb-chip px-1.5 py-0.5">{ep}</span>
                  ))}
                </div>
              )}
              {loc.notes && <p className="text-xs mt-2 max-w-[260px] bb-muted">{loc.notes}</p>}
            </div>
          </Popup>
        </Marker>
      ) : null
    ))}
  </MapContainer>
</div>
          </CardContent>
        </Card>

        {/* List */}
<Card className="h-[60vh] lg:h-[78vh] bb-card bb-glow flex flex-col">
  <CardHeader className="pb-3">
    <CardTitle className="text-emerald-100 text-base">Results</CardTitle>
    <div className="mt-3 flex items-center gap-2">
      <div className="relative flex-1">
        <Search className="absolute left-2 top-2.5 h-4 w-4 text-emerald-300/70"/>
        <Input className="pl-8 bb-input" placeholder="Search locations…" value={query} onChange={(e) => { setPage(0); setQuery(e.target.value); }} />
      </div>
      <Button className="bb-btn-outline" onClick={() => { setQuery(""); setSeriesFilter(""); setAccessFilter(""); setPage(0); }}>Reset</Button>
    </div>
  </CardHeader>

  <CardContent className="flex-1 overflow-hidden p-0">
    {error && (
      <div className="px-4 py-3 text-sm text-red-300 border-b border-red-500/40">Error loading locations: {String(error)}</div>
    )}

    {loading ? (
      <div className="h-full flex items-center justify-center text-emerald-200 gap-2">
        <Loader2 className="h-5 w-5 animate-spin"/> Loading…
      </div>
    ) : (
      <div className="h-full overflow-auto p-3 pr-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {visible.map((loc) => (
            <Card key={loc.id} className="group bb-card bb-glow">
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center justify-between gap-2 text-emerald-50">
                  <span className="truncate" title={loc.name}>{loc.name}</span>
                  <div className="flex items-center gap-1">
                    {Boolean(loc.series?.length) && (
                      <span className="text-[10px] text-emerald-200/80">{loc.series.join(" · ")}</span>
                    )}
                  </div>
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm space-y-2">
                <div className="flex items-center gap-2 text-emerald-200/90">
                  <MapPin className="h-4 w-4"/>
                  <span className="truncate" title={[loc.address, loc.city, loc.state].filter(Boolean).join(", ")}>{[loc.address, loc.city, loc.state].filter(Boolean).join(", ") || "—"}</span>
                </div>
                <div className="text-xs uppercase tracking-wide text-emerald-300/80">{accessLabel(loc.access)}</div>
                {loc.notes && <p className="text-sm text-emerald-100/90 line-clamp-3">{loc.notes}</p>}
                <div className="flex flex-wrap gap-1 items-center">
                  {Boolean(loc.episodes?.length) && (
                    <>
                      <Film className="h-3 w-3 text-emerald-200"/>$1{loc.episodes.slice(0, 6).map((ep, i) => (
                            <span key={i} className="text-[11px] leading-4 bb-chip px-1.5 py-0.5">{ep}</span>
                      ))}
                      {loc.episodes.length > 6 && (
                        <span className="text-[10px] text-emerald-300/70">+{loc.episodes.length - 6} more</span>
                      )}
                    </>
                  )}
                </div>
                <div className="flex gap-2">
                  {Number.isFinite(loc.lat) && Number.isFinite(loc.lng) ? (
                    <a
                      className="text-sm underline decoration-emerald-400 underline-offset-4 hover:no-underline text-emerald-200"
                      href={`https://www.google.com/maps?q=${loc.lat},${loc.lng}`}
                      target="_blank" rel="noreferrer"
                    >Open in Maps</a>
                  ) : (
                    <span className="text-sm text-emerald-300/70">No coordinates</span>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    )}
  </CardContent>

  {/* Pagination (fixed at bottom of results card) */}
  <div className="border-t border-emerald-900/30 px-4 py-3 flex items-center justify-between">
    <div className="text-sm text-emerald-300/80">Page {Number(pageData.page ?? 0) + 1} of {Math.max(1, pageData.totalPages)}</div>
    <div className="flex items-center gap-2">
      <Button size="sm" className="bb-btn-outline" disabled={page <= 0 || loading} onClick={() => setPage(p => Math.max(0, p - 1))}>Previous</Button>
      <Button size="sm" className="bb-btn" disabled={page + 1 >= pageData.totalPages || loading} onClick={() => setPage(p => p + 1)}>Next</Button>
    </div>
  </div>
</Card>
      </main>

      <footer className="mx-auto max-w-7xl px-4 py-8 text-xs text-emerald-300/70">
        Data from your API at <code className="text-emerald-200">{API_BASE || window.location.origin}</code> → <code className="text-emerald-200">/api/v1/locations</code>.
        &nbsp;Schema: <code className="text-emerald-200">_id, name, series[], address, city, state, notes, scenes[], access, geolocation</code> (GeoJSON [lng, lat]).
      </footer>
    </div>
  );
}
