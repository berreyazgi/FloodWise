import { NextRequest } from "next/server";
import { bad, rateLimited } from "@/lib/server/auth";
import { listLocations } from "@/lib/server/repo";

const cache = new Map<string, unknown>();

/** Location search: app study areas first, then OSM Nominatim (bounded to İstanbul, cached, ≤1 req/s). */
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (q.length < 2 || q.length > 100) return bad("Arama 2–100 karakter olmalı");
  const lower = q.toLocaleLowerCase("tr-TR");
  const local = listLocations().filter((l) => l.name.toLocaleLowerCase("tr-TR").includes(lower)).map((l) => ({ name: l.name, source: "FloodWise çalışma alanı", id: l.id, center: centerOf(l.geometry as Geo) }));
  if (cache.has(lower)) return Response.json([...local, ...(cache.get(lower) as unknown[])]);
  if (rateLimited("nominatim", 1, 1100)) return Response.json(local);
  try {
    const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=5&countrycodes=tr&viewbox=28.0,41.6,29.95,40.75&bounded=1&q=${encodeURIComponent(q)}`;
    const res = await fetch(url, { headers: { "User-Agent": "FloodWise-Istanbul-prototype/0.1", "Accept-Language": "tr" }, signal: AbortSignal.timeout(8000) });
    const hits = res.ok ? ((await res.json()) as { display_name: string; lon: string; lat: string }[]).map((h) => ({ name: h.display_name, source: "OpenStreetMap Nominatim", center: [Number(h.lon), Number(h.lat)] })) : [];
    cache.set(lower, hits);
    return Response.json([...local, ...hits]);
  } catch {
    return Response.json(local);
  }
}

type Geo = { type: string; coordinates: unknown };
function centerOf(g: Geo): [number, number] {
  if (g.type === "Point") return g.coordinates as [number, number];
  const flat = JSON.stringify(g.coordinates).match(/-?\d+\.?\d*/g)!.map(Number);
  const xs = flat.filter((_, i) => i % 2 === 0), ys = flat.filter((_, i) => i % 2 === 1);
  return [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2];
}
