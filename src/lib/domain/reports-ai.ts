/** Deterministic assistance for citizen reports: suggestions only — never verifies that a flood occurred. */
import { pointSegmentDistanceM } from "./geo";

export const CATEGORIES = {
  basement: "Bodrum / otopark su baskını",
  street: "Cadde / sokak su birikmesi",
  underpass: "Alt geçit su birikmesi",
  drain: "Tıkalı / taşan ızgara-mazgal",
  stream: "Dere taşması",
  other: "Diğer",
} as const;
export type Category = keyof typeof CATEGORIES;

const KEYWORDS: Record<Exclude<Category, "other">, string[]> = {
  basement: ["bodrum", "otopark", "garaj", "kiler", "zemin kat"],
  underpass: ["alt geçit", "altgeçit", "köprü altı", "tünel"],
  drain: ["ızgara", "mazgal", "rögar", "logar", "kanal kapağı", "tıkalı"],
  stream: ["dere", "taştı", "taşkın", "ayamama"],
  street: ["cadde", "sokak", "yol", "kavşak", "kaldırım", "göl"],
};

const norm = (s: string) => s.toLocaleLowerCase("tr-TR");

export function suggestCategory(text: string): { category: Category; matched: string[] } {
  const t = norm(text);
  let best: { category: Category; matched: string[] } = { category: "other", matched: [] };
  for (const [cat, words] of Object.entries(KEYWORDS) as [Category, string[]][]) {
    const matched = words.filter((w) => t.includes(w));
    if (matched.length > best.matched.length) best = { category: cat, matched };
  }
  return best;
}

export function missingInfo(r: { description: string; lon: number | null; neighborhood: string | null; water_depth_cm: number | null; observed_at: string | null }) {
  const out: string[] = [];
  if (r.lon == null) out.push("Yaklaşık konum işaretlenmemiş");
  if (!r.neighborhood) out.push("Mahalle belirtilmemiş");
  if (r.water_depth_cm == null) out.push("Su derinliği tahmini yok");
  if (!r.observed_at) out.push("Gözlem zamanı yok");
  if (r.description.trim().length < 30) out.push("Açıklama çok kısa");
  return out;
}

const tokens = (s: string) => new Set(norm(s).split(/[^\p{L}\p{N}]+/u).filter((w) => w.length > 2));
export function jaccard(a: string, b: string) {
  const A = tokens(a), B = tokens(b);
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const w of A) if (B.has(w)) inter++;
  return inter / (A.size + B.size - inter);
}

export interface DupCandidate { id: string; lon: number | null; lat: number | null; observed_at: string | null; district: string; description: string }

/** Possible duplicates: same district AND (within 400 m and 24 h, or text similarity ≥ 0.5). */
export function findPossibleDuplicates(r: DupCandidate, others: DupCandidate[]) {
  return others
    .filter((o) => o.id !== r.id && o.district === r.district)
    .map((o) => {
      const dist = r.lon != null && r.lat != null && o.lon != null && o.lat != null
        ? pointSegmentDistanceM([r.lon, r.lat], [o.lon, o.lat], [o.lon, o.lat]) : null;
      const dtH = r.observed_at && o.observed_at ? Math.abs(Date.parse(r.observed_at) - Date.parse(o.observed_at)) / 3.6e6 : null;
      const sim = jaccard(r.description, o.description);
      const near = dist != null && dist <= 400 && dtH != null && dtH <= 24;
      return { id: o.id, distanceM: dist == null ? null : Math.round(dist), hoursApart: dtH == null ? null : Math.round(dtH), similarity: Math.round(sim * 100) / 100, match: near || sim >= 0.5 };
    })
    .filter((x) => x.match);
}
