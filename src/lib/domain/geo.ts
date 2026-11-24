export type LonLat = [number, number];

const M_PER_DEG_LAT = 110_540;
const mPerDegLon = (lat: number) => 111_320 * Math.cos((lat * Math.PI) / 180);

/** Distance in metres from point p to segment ab (local equirectangular projection; fine at < ~10 km). */
export function pointSegmentDistanceM(p: LonLat, a: LonLat, b: LonLat): number {
  const kx = mPerDegLon(p[1]);
  const [px, py] = [p[0] * kx, p[1] * M_PER_DEG_LAT];
  const [ax, ay] = [a[0] * kx, a[1] * M_PER_DEG_LAT];
  const [bx, by] = [b[0] * kx, b[1] * M_PER_DEG_LAT];
  const dx = bx - ax, dy = by - ay;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

export function distanceToLinesM(p: LonLat, lines: LonLat[][]): number {
  let best = Infinity;
  for (const line of lines)
    for (let i = 1; i < line.length; i++) best = Math.min(best, pointSegmentDistanceM(p, line[i - 1], line[i]));
  return best;
}

export function gridSpacingM(stepDeg: number, lat: number) {
  return { dx: stepDeg * mPerDegLon(lat), dy: stepDeg * M_PER_DEG_LAT };
}

function inRing(x: number, y: number, ring: LonLat[]) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export type PolyGeom = { type: "Polygon"; coordinates: LonLat[][] } | { type: "MultiPolygon"; coordinates: LonLat[][][] };

export function pointInGeometry(p: LonLat, g: PolyGeom): boolean {
  const polys = g.type === "Polygon" ? [g.coordinates] : g.coordinates;
  return polys.some((poly) => inRing(p[0], p[1], poly[0]) && !poly.slice(1).some((h) => inRing(p[0], p[1], h)));
}

export function bboxOf(coords: LonLat[]): [number, number, number, number] {
  const xs = coords.map((c) => c[0]), ys = coords.map((c) => c[1]);
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
}

export function bboxPolygon([w, s, e, n]: [number, number, number, number]): PolyGeom {
  return { type: "Polygon", coordinates: [[[w, s], [e, s], [e, n], [w, n], [w, s]]] };
}

/** Square cell polygon centred on a grid point, for map display. */
export function cellPolygon(lon: number, lat: number, stepDeg: number): LonLat[][] {
  const h = stepDeg / 2;
  return [[[lon - h, lat - h], [lon + h, lat - h], [lon + h, lat + h], [lon - h, lat + h], [lon - h, lat - h]]];
}
