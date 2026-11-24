// Marks elevation-grid cells that fall on open water (OSM natural=water / reservoirs) so lakes are not
// ranked as "flood exposure". Post-processes data/snapshots/elevation-grid.json. Run: node scripts/ingest-watermask.mjs
import { readFileSync, writeFileSync } from "node:fs";

const OUT = new URL("../data/snapshots/", import.meta.url);
const read = (n) => JSON.parse(readFileSync(new URL(n, OUT), "utf8"));
const districts = read("districts.json").districts;
const elev = read("elevation-grid.json");

const s = Math.min(...districts.map((d) => d.bbox[0])), n = Math.max(...districts.map((d) => d.bbox[1]));
const w = Math.min(...districts.map((d) => d.bbox[2])), e = Math.max(...districts.map((d) => d.bbox[3]));
const q = `[out:json][timeout:120];(way["natural"="water"](${s},${w},${n},${e});relation["natural"="water"](${s},${w},${n},${e}););out geom;`;
const MIRRORS = ["https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter", "https://maps.mail.ru/osm/tools/overpass/api/interpreter"];
let els = null;
for (const url of MIRRORS) {
  try {
    const res = await fetch(url, {
      method: "POST",
      body: "data=" + encodeURIComponent(q),
      headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": "FloodWise-Istanbul-prototype/0.1" },
      signal: AbortSignal.timeout(120_000),
    });
    if (res.ok) { els = (await res.json()).elements; break; }
    console.warn(`${url}: HTTP ${res.status}`);
  } catch (err) { console.warn(`${url}: ${err.message}`); }
}
if (!els) throw new Error("All Overpass mirrors failed");

const pts = (g) => g.map((p) => [p.lon, p.lat]);
const same = (a, b) => a[0] === b[0] && a[1] === b[1];
/** Join open way segments into closed rings by matching endpoints. */
function stitch(segs) {
  const rings = [];
  const pool = segs.map((x) => [...x]);
  while (pool.length) {
    let ring = pool.shift();
    let grew = true;
    while (!same(ring[0], ring[ring.length - 1]) && grew) {
      grew = false;
      for (let i = 0; i < pool.length; i++) {
        const sg = pool[i], end = ring[ring.length - 1];
        if (same(sg[0], end)) ring = ring.concat(sg.slice(1));
        else if (same(sg[sg.length - 1], end)) ring = ring.concat([...sg].reverse().slice(1));
        else continue;
        pool.splice(i, 1); grew = true; break;
      }
    }
    if (same(ring[0], ring[ring.length - 1]) && ring.length >= 4) rings.push(ring);
  }
  return rings;
}

const rings = [];
for (const el of els) {
  if (el.type === "way" && el.geometry?.length >= 4) rings.push(pts(el.geometry));
  if (el.type === "relation") rings.push(...stitch(el.members.filter((m) => m.role === "outer" && m.geometry).map((m) => pts(m.geometry))));
}
const closed = rings.filter((r) => same(r[0], r[r.length - 1]));

function inRing(x, y, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
let masked = 0;
for (const g of elev.grids)
  for (const c of g.cells) {
    c.water = closed.some((r) => inRing(c.lon, c.lat, r));
    if (c.water && c.inside) masked++;
  }
elev.water_mask = { source: "OpenStreetMap natural=water (Overpass)", license: "ODbL", fetched_at: new Date().toISOString(), polygons: closed.length };
writeFileSync(new URL("elevation-grid.json", OUT), JSON.stringify(elev));
console.log(`water polygons: ${closed.length}, masked in-district cells: ${masked}`);
