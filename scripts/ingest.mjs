// Data ingestion: fetches real open data into data/snapshots/*.json so the app runs offline.
// Run: node scripts/ingest.mjs   (requires network; respects Nominatim 1 req/s policy)
import { writeFileSync, mkdirSync } from "node:fs";

const UA = "FloodWise-Istanbul-prototype/0.1 (hackathon research prototype)";
const OUT = new URL("../data/snapshots/", import.meta.url);
mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const save = (name, obj) => writeFileSync(new URL(name, OUT), JSON.stringify(obj));
const now = new Date().toISOString();

async function getJson(url, init = {}) {
  for (let attempt = 1; attempt <= 5; attempt++) {
    const res = await fetch(url, { ...init, headers: { "User-Agent": UA, ...(init.headers ?? {}) } });
    if (res.ok) return res.json();
    console.warn(`HTTP ${res.status} for ${url.slice(0, 120)} (attempt ${attempt})`);
    await sleep(res.status === 429 ? 65000 : 2000 * attempt);
  }
  throw new Error(`Failed: ${url}`);
}

const DISTRICTS = [
  { id: "basaksehir", name: "Başakşehir", q: "Başakşehir, İstanbul, Türkiye" },
  { id: "kucukcekmece", name: "Küçükçekmece", q: "Küçükçekmece, İstanbul, Türkiye" },
];

// 1) District boundaries (OSM via Nominatim, ODbL)
const districts = [];
for (const d of DISTRICTS) {
  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(d.q)}&polygon_geojson=1&polygon_threshold=0.0005&format=jsonv2&limit=1&featureType=settlement`;
  let [hit] = await getJson(url);
  if (!hit || !["Polygon", "MultiPolygon"].includes(hit.geojson?.type)) {
    [hit] = await getJson(url.replace("&featureType=settlement", ""));
  }
  if (!hit?.geojson) throw new Error(`No boundary for ${d.name}`);
  districts.push({ ...d, osm_type: hit.osm_type, osm_id: hit.osm_id, bbox: hit.boundingbox.map(Number), geometry: hit.geojson });
  console.log(`boundary ${d.name}: ${hit.geojson.type}`);
  await sleep(1100);
}
save("districts.json", { source: "OpenStreetMap / Nominatim", license: "ODbL", fetched_at: now, districts });

// point-in-polygon (ray casting) for Polygon/MultiPolygon
function inRing(x, y, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
const inGeom = (x, y, g) =>
  (g.type === "Polygon" ? [g.coordinates] : g.coordinates).some((p) => inRing(x, y, p[0]) && !p.slice(1).some((h) => inRing(x, y, h)));

// 2) Elevation grid (Open-Meteo Elevation API = Copernicus DEM GLO-90, 90 m)
const STEP = 0.005; // ~0.55 km lat × ~0.42 km lon
const grids = [];
for (const d of districts) {
  const [s, n, w, e] = d.bbox; // nominatim: [south, north, west, east]
  const pts = [];
  for (let lat = s; lat <= n; lat += STEP)
    for (let lon = w; lon <= e; lon += STEP) pts.push([+lon.toFixed(5), +lat.toFixed(5)]);
  const elev = [];
  for (let i = 0; i < pts.length; i += 100) {
    const chunk = pts.slice(i, i + 100);
    const url = `https://api.open-meteo.com/v1/elevation?latitude=${chunk.map((p) => p[1]).join(",")}&longitude=${chunk.map((p) => p[0]).join(",")}`;
    elev.push(...(await getJson(url)).elevation);
    await sleep(12000); // Open-Meteo counts each coordinate; stay under 600/min
  }
  const cells = pts.map(([lon, lat], i) => ({ lon, lat, elev: elev[i], inside: inGeom(lon, lat, d.geometry) }));
  grids.push({ district_id: d.id, step_deg: STEP, cells });
  console.log(`elevation ${d.name}: ${cells.length} points`);
}
save("elevation-grid.json", {
  source: "Open-Meteo Elevation API (Copernicus DEM GLO-90)",
  resolution_m: 90,
  sample_spacing_deg: STEP,
  license: "Copernicus DEM © DLR/Airbus, ESA; API by Open-Meteo (CC BY 4.0)",
  fetched_at: now,
  grids,
});

// 3) Waterways (OSM via Overpass)
const [s, n, w, e] = [
  Math.min(...districts.map((d) => d.bbox[0])),
  Math.max(...districts.map((d) => d.bbox[1])),
  Math.min(...districts.map((d) => d.bbox[2])),
  Math.max(...districts.map((d) => d.bbox[3])),
];
const oq = `[out:json][timeout:90];way["waterway"~"^(river|stream|canal|drain|ditch)$"](${s},${w},${n},${e});out geom tags;`;
const ov = await getJson("https://overpass-api.de/api/interpreter", {
  method: "POST",
  body: "data=" + encodeURIComponent(oq),
  headers: { "Content-Type": "application/x-www-form-urlencoded" },
});
const waterways = ov.elements
  .filter((el) => el.geometry?.length > 1)
  .map((el) => ({
    type: "Feature",
    properties: { osm_id: el.id, name: el.tags?.name ?? null, waterway: el.tags?.waterway, tunnel: el.tags?.tunnel ?? null },
    geometry: { type: "LineString", coordinates: el.geometry.map((g) => [+g.lon.toFixed(5), +g.lat.toFixed(5)]) },
  }));
save("waterways.json", { source: "OpenStreetMap / Overpass API", license: "ODbL", fetched_at: now, type: "FeatureCollection", features: waterways });
console.log(`waterways: ${waterways.length}`);

// 4) Rainfall (Open-Meteo Historical Weather API; ERA5/ERA5-Land reanalysis — gridded, not a rain gauge)
const centroid = (d) => [+(((d.bbox[2] + d.bbox[3]) / 2).toFixed(4)), +(((d.bbox[0] + d.bbox[1]) / 2).toFixed(4))];
const rain = { source: "Open-Meteo Historical Weather API (ERA5 / ERA5-Land reanalysis)", license: "CC BY 4.0", fetched_at: now, timezone: "Europe/Istanbul", series: [] };
const windows = [
  ["2009-09-06", "2009-09-11"],
  ["2023-09-03", "2023-09-08"],
];
for (const d of districts) {
  const [lon, lat] = centroid(d);
  for (const [a, b] of windows) {
    const j = await getJson(`https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lon}&start_date=${a}&end_date=${b}&hourly=precipitation&timezone=Europe%2FIstanbul`);
    rain.series.push({ district_id: d.id, kind: "hourly", lat, lon, grid_lat: j.latitude, grid_lon: j.longitude, start: a, end: b, time: j.hourly.time, precipitation_mm: j.hourly.precipitation });
    await sleep(500);
  }
  const j = await getJson(`https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lon}&start_date=1995-01-01&end_date=2025-12-31&daily=precipitation_sum&timezone=Europe%2FIstanbul`);
  rain.series.push({ district_id: d.id, kind: "daily", lat, lon, grid_lat: j.latitude, grid_lon: j.longitude, start: "1995-01-01", end: "2025-12-31", time: j.daily.time, precipitation_mm: j.daily.precipitation_sum });
  console.log(`rainfall ${d.name}: ok`);
  await sleep(500);
}
save("rainfall.json", rain);
console.log("done");
await import("./ingest-watermask.mjs");
