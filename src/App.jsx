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
 * Breaking Bad / Better Call Saul Tour UI — Themed
 * ------------------------------------------------
 * Visual refresh inspired by the Breaking Bad palette and periodic-table motif.
 *
 * API endpoint (unchanged): GET /api/v1/locations?name&page&size
 * Consumes your Location schema as prior.
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

// Basemap options with more/less cartographic detail
const BASEMAPS = {
  streets: {
    name: "Streets (OSM)",
    url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    attribution:
      "&copy; <a href=\"https://www.openstreetmap.org/copyright\">OpenStreetMap</a> contributors",
  },
  voyager: {
    name: "Voyager (CARTO)",
    url: "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png",
    attribution:
      "&copy; <a href=\"https://www.openstreetmap.org/copyright\">OpenStreetMap</a> contributors, &copy; <a href=\"https://carto.com/attributions\">CARTO</a>",
  },
  light: {
    name: "Light (CARTO)",
    url: "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
    attribution:
      "&copy; <a href=\"https://www.openstreetmap.org/copyright\">OpenStreetMap</a> contributors, &copy; <a href=\"https://carto.com/attributions\">CARTO</a>",
  },
};

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

// Build Breaking Bad style tiles for series badges
function seriesTiles(seriesArr) {
  const tiles = [];
  const pushTile = (sym, num) => tiles.push({ sym, num });
  (seriesArr || []).forEach((s) => {
    if (/breaking\s*bad/i.test(String(s))) {
      pushTile("Br", 35); // Bromine
      pushTile("Ba", 56); // Barium
    }
    if (/better\s*call\s*saul/i.test(String(s))) {
      // Not actual elements, but styled tiles for theme
      pushTile("Bc", "•");
      pushTile("Sa", "•");
    }
  });
  return tiles;
}

export default function BreakingBadTourUI() {
  // Server/query state
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const [size, setSize] = useState(20);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [pageData, setPageData] = useState({ content: [], totalPages: 0, page: 0, size: 20, totalElements: 0 });

  // Map style (more detail with OSM Streets, balanced with CARTO Voyager)
  const [basemap, setBasemap] = useState('streets');

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

  // Update browser tab title dynamically
  useEffect(() => {
    const bits = [];
    if (seriesFilter) bits.push(seriesFilter);
    if (accessFilter) bits.push(accessLabel(accessFilter));
    if (query) bits.push(`“${query}”`);
    document.title = `Breaking Bad Tour — ${visible.length} shown${bits.length ? ' · ' + bits.join(' · ') : ''}`;
  }, [visible.length, seriesFilter, accessFilter, query]);

  return (
    <div className="relative min-h-screen w-full overflow-x-hidden bg-[radial-gradient(75%_60%_at_50%_10%,rgba(16,185,129,0.15),rgba(0,0,0,0.6)_40%,rgba(0,0,0,1)_80%)] text-emerald-50">
      {/* subtle noise/fog overlay */}
      <div className="pointer-events-none fixed inset-0 opacity-[0.07] mix-blend-overlay" style={{ backgroundImage: "url('data:image/svg+xml;utf8,<svg xmlns=\'http://www.w3.org/2000/svg\' width=\'160\' height=\'160\'><filter id=\'n\'><feTurbulence type=\'fractalNoise\' baseFrequency=\'0.8\' numOctaves=\'4\' stitchTiles=\'stitch\'/></filter><rect width=\'100%\' height=\'100%\' filter=\'url(%23n)\' opacity=\'0.35\'/></svg>')" }} />

      <style>{`
        html,body{background:#0a120d;margin:0;overflow-x:hidden;}
        #root{background:transparent;}
        *{box-sizing:border-box;}

        main[data-bb="layout"]{height:var(--bb-app-h);}
        @media (max-width:1023px){ main[data-bb="layout"]{ height:auto; }}

        :root { --bb-panel-h: var(--bb-app-h); }
        @media (max-width:1023px){ :root { --bb-panel-h: 55vh; } }

        /* Leaflet light theme tweaks */
        .leaflet-container { background: #f0f7f4; }
        .leaflet-control-attribution { color: #065f46; }
        .leaflet-popup-content-wrapper {
          background: #f7fcfa;
          color: #064e3b;
          border: 1px solid rgba(16,185,129,0.35);
          box-shadow: 0 10px 30px rgba(16,185,129,0.12);
          border-radius: 0.75rem;
        }
        .leaflet-popup-tip { background: #f7fcfa; }
        .leaflet-tile { filter: saturate(1.05) contrast(0.98) brightness(1.05); }
      `}</style>

      <header className="sticky top-0 z-20 border-b border-emerald-500/20 bg-black/40 backdrop-blur">
        <div className="mx-auto max-w-7xl px-4 py-4 flex items-center gap-4">
          <div className="flex items-center gap-1">
            <div className="grid grid-cols-2 gap-1">
              {/* Br / Ba periodic tiles */}
              {[{sym:'Br',num:35},{sym:'Ba',num:56}].map((t) => (
                <div key={t.sym} className="relative h-8 w-8 rounded-md border border-emerald-500/40 bg-emerald-600/15 grid place-items-center text-emerald-300 font-semibold shadow-[0_0_0_1px_rgba(16,185,129,0.15)_inset]">
                  <span className="text-sm leading-none">{t.sym}</span>
                  <span className="absolute right-0.5 bottom-0.5 text-[9px] opacity-70">{t.num}</span>
                </div>
              ))}
            </div>
            <h1 className="text-lg md:text-2xl font-semibold tracking-tight ml-2 text-emerald-200">
              Breaking Bad & Better Call Saul Tour
            </h1>
          </div>

          <div className="$1">
            {/* Map style selector */}
            <div className="$1">
              <Label className="$1">Map style</Label>
              <Select value={basemap} onValueChange={setBasemap}>
                <SelectTrigger className="$1">
                  <SelectValue placeholder="$1" />
                </SelectTrigger>
                <SelectContent className="$1">
                  <SelectItem value="$1">Streets (OSM)</SelectItem>
                  <SelectItem value="$1">Voyager (CARTO)</SelectItem>
                  <SelectItem value="$1">Light (CARTO)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Badge variant="secondary" className="bg-emerald-500/10 text-emerald-200 border border-emerald-500/30">
              {visible.length} shown
            </Badge>
            <Badge variant="outline" className="border-emerald-400/30 text-emerald-200/90">
              {pageData.totalElements} total
            </Badge>
            <Sheet>
              <SheetTrigger asChild>
                <Button variant="outline" size="sm" className="gap-2 border-emerald-500/30 text-emerald-200 hover:bg-emerald-500/10">
                  <Filter className="h-4 w-4"/>Filters
                </Button>
              </SheetTrigger>
              <SheetContent side="right" className="w-[360px] sm:w-[420px] bg-[#0a120d] text-emerald-50 border-l border-emerald-600/25">
                <SheetHeader>
                  <SheetTitle className="text-emerald-200">Filter & Search</SheetTitle>
                </SheetHeader>
                <div className="space-y-6 py-4">
                  <div className="space-y-2">
                    <Label htmlFor="q" className="text-emerald-200">Search by name</Label>
                    <div className="flex gap-2">
                      <Input id="q" className="bg-black/40 border-emerald-600/30 focus-visible:ring-emerald-400/40" placeholder="Los Pollos Hermanos" value={query} onChange={e => { setPage(0); setQuery(e.target.value); }} />
                      <Button variant="secondary" className="bg-emerald-500/10 text-emerald-200 border border-emerald-600/30" onClick={() => { setPage(0); setQuery(""); }}>Clear</Button>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-emerald-200">Series</Label>
                    <Select value={seriesFilter} onValueChange={(v) => { setPage(0); setSeriesFilter(v === "__any__" ? "" : v); }}>
                      <SelectTrigger className="w-full bg-black/40 border-emerald-600/30 text-emerald-100">
                        <SelectValue placeholder="Any" />
                      </SelectTrigger>
                      <SelectContent className="bg-[#0a120d] border-emerald-700/30">
                        <SelectItem value="__any__">Any</SelectItem>
                        {allSeries.map((s) => (
                          <SelectItem key={s} value={String(s)}>{s}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {/* quick chips */}
                    <div className="flex flex-wrap gap-2 pt-1">
                      {["Breaking Bad","Better Call Saul"].filter(s=>allSeries.includes(s)).map((s) => (
                        <button
                          key={s}
                          onClick={() => { setPage(0); setSeriesFilter(seriesFilter === s ? "" : s); }}
                          className={`rounded-md border px-2 py-1 text-xs tracking-wide ${seriesFilter === s ? "bg-emerald-600/20 border-emerald-400/50 text-emerald-200" : "bg-black/30 border-emerald-700/30 text-emerald-300 hover:bg-emerald-600/10"}`}
                        >{s}</button>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-emerald-200">Access</Label>
                    <Select value={accessFilter} onValueChange={(v) => { setPage(0); setAccessFilter(v === "__any__" ? "" : v); }}>
                      <SelectTrigger className="w-full bg-black/40 border-emerald-600/30 text-emerald-100">
                        <SelectValue placeholder="Any" />
                      </SelectTrigger>
                      <SelectContent className="bg-[#0a120d] border-emerald-700/30">
                        <SelectItem value="__any__">Any</SelectItem>
                        {accessOptions.map((a) => (
                          <SelectItem key={a} value={String(a)}>{accessLabel(a)}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-emerald-200">Page size</Label>
                    <Slider min={5} max={50} step={5} value={[size]} onValueChange={(v) => setSize(v[0])} />
                  </div>
                </div>
              </SheetContent>
            </Sheet>
          </div>
        </div>
      </header>

      <main data-bb="layout" style={{ height: 'var(--bb-app-h)' }} className="mx-auto max-w-7xl px-4 py-6 grid grid-cols-1 lg:grid-cols-2 gap-6 min-h-0">
        {/* Map */}
        <Card style={{ height: 'var(--bb-panel-h)' }} className="h-full overflow-hidden border-emerald-700/30 bg-black/30">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-emerald-200">
              <MapPin className="h-5 w-5"/>
              Map
            </CardTitle>
          </CardHeader>
          <CardContent className="h-full">
            <MapContainer center={mapCenter} zoom={12} className="h-full w-full rounded-2xl">
              <TileLayer
                attribution={BASEMAPS[basemap].attribution}
                url={BASEMAPS[basemap].url}
              />
              {visible.map((loc) => (
                Number.isFinite(loc.lat) && Number.isFinite(loc.lng) ? (
                  <Marker key={loc.id} position={[loc.lat, loc.lng]}>
                    <Popup>
                      <div className="space-y-1">
                        <div className="font-semibold text-emerald-200 flex items-center gap-2">
                          {loc.name}
                        </div>
                        <div className="text-xs text-emerald-300/80 flex items-center gap-1">
                          {/* Series tiles */}
                          <div className="flex items-center gap-1">
                            {seriesTiles(loc.series).map((t, i) => (
                              <div key={i} className="relative h-5 w-5 rounded border border-emerald-500/40 bg-emerald-600/15 grid place-items-center text-emerald-300 font-semibold">
                                <span className="text-[10px] leading-none">{t.sym}</span>
                                <span className="absolute right-0.5 bottom-0.5 text-[8px] opacity-70">{t.num}</span>
                              </div>
                            ))}
                          </div>
                          <span className="opacity-70">{(loc.series || []).join(" · ") || "—"}</span>
                        </div>
                        <div className="text-[11px] text-emerald-300/80">{accessLabel(loc.access)}</div>
                        {(loc.address || loc.city || loc.state) && (
                          <div className="text-[11px] text-emerald-100">{[loc.address, loc.city, loc.state].filter(Boolean).join(", ")}</div>
                        )}
                        {Boolean(loc.episodes?.length) && (
                          <div className="flex flex-wrap items-center gap-1 pt-1">
                            <Film className="h-3 w-3"/>
                            {loc.episodes.map((ep, i) => (
                              <span key={i} className="text-[10px] rounded bg-emerald-600/15 border border-emerald-600/30 text-emerald-200 px-1 py-0.5">{ep}</span>
                            ))}
                          </div>
                        )}
                        {loc.notes && <p className="text-xs mt-2 max-w-[260px] text-emerald-100/90">{loc.notes}</p>}
                      </div>
                    </Popup>
                  </Marker>
                ) : null
              ))}
            </MapContainer>
          </CardContent>
        </Card>

        {/* List */}
        <div className="flex min-h-0 flex-col gap-3">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-emerald-300/70"/>
              <Input className="pl-8 bg-black/40 border-emerald-700/40 text-emerald-100 focus-visible:ring-emerald-400/40" placeholder="Search locations…" value={query} onChange={(e) => { setPage(0); setQuery(e.target.value); }} />
            </div>
            <Button variant="outline" className="border-emerald-600/30 text-emerald-200 hover:bg-emerald-600/10" onClick={() => { setQuery(""); setSeriesFilter(""); setAccessFilter(""); setPage(0); }}>Reset</Button>
          </div>

          {error && (
            <Card className="border-red-700/40 bg-red-900/20">
              <CardContent className="py-3 text-sm text-red-300">Error loading locations: {String(error)}</CardContent>
            </Card>
          )}

          {loading ? (
            <div className="flex items-center justify-center h-40 text-emerald-300/80 gap-2">
              <Loader2 className="h-5 w-5 animate-spin"/> Cooking data…
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 overflow-auto pr-1 min-h-0" style={{ maxHeight: 'var(--bb-panel-h)' }}>
              {visible.map((loc) => (
                <Card key={loc.id} className="group border-emerald-700/30 bg-black/30 hover:bg-emerald-600/5 transition-colors">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base flex items-center justify-between gap-2 text-emerald-100">
                      <span className="truncate" title={loc.name}>{loc.name}</span>
                      <div className="flex items-center gap-1">
                        {/* Series tiles */}
                        <div className="flex items-center gap-1">
                          {seriesTiles(loc.series).map((t, i) => (
                            <div key={i} className="relative h-5 w-5 rounded border border-emerald-500/40 bg-emerald-600/15 grid place-items-center text-emerald-300 font-semibold">
                              <span className="text-[10px] leading-none">{t.sym}</span>
                              <span className="absolute right-0.5 bottom-0.5 text-[8px] opacity-70">{t.num}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="text-sm space-y-2 text-emerald-100/90">
                    <div className="flex items-center gap-2 text-emerald-300/80">
                      <MapPin className="h-4 w-4"/>
                      <span className="truncate" title={[loc.address, loc.city, loc.state].filter(Boolean).join(", ")}>{[loc.address, loc.city, loc.state].filter(Boolean).join(", ") || "—"}</span>
                    </div>
                    <div className="text-[11px] uppercase tracking-wide text-emerald-300/70">{accessLabel(loc.access)}</div>
                    {loc.notes && <p className="text-sm line-clamp-3 text-emerald-100/90">{loc.notes}</p>}
                    <div className="flex flex-wrap gap-1 items-center">
                      {Boolean(loc.episodes?.length) && (
                        <>
                          <Film className="h-3 w-3"/>
                          {loc.episodes.slice(0, 6).map((ep, i) => (
                            <span key={i} className="text-[10px] rounded bg-emerald-600/15 border border-emerald-600/30 text-emerald-200 px-1 py-0.5">{ep}</span>
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
                          className="text-sm underline underline-offset-2 decoration-emerald-500/60 hover:decoration-emerald-300"
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
          )}

          {/* Pagination */}
          <div className="mt-2 flex items-center justify-between">
            <div className="text-sm text-emerald-300/80">Page {Number(pageData.page ?? 0) + 1} of {Math.max(1, pageData.totalPages)}</div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" className="border-emerald-600/30 text-emerald-200 hover:bg-emerald-600/10" disabled={page <= 0 || loading} onClick={() => setPage(p => Math.max(0, p - 1))}>Previous</Button>
              <Button variant="default" size="sm" className="bg-emerald-600/70 hover:bg-emerald-500" disabled={page + 1 >= pageData.totalPages || loading} onClick={() => setPage(p => p + 1)}>Next</Button>
            </div>
          </div>
        </div>
      </main>

      <footer className="mx-auto max-w-7xl px-4 py-8 text-xs text-emerald-300/70">
        Data from your API at <code className="text-emerald-200">{API_BASE || window.location.origin}</code> → <code className="text-emerald-200">/api/v1/locations</code>.
        &nbsp;Schema: <code className="text-emerald-200">_id, name, series[], address, city, state, notes, scenes[], access, geolocation</code> (GeoJSON [lng, lat]).
      </footer>
    </div>
  );
}
