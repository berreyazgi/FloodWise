import { connection, NextRequest } from "next/server";
import { writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { CitizenReportSchema } from "@/lib/schemas";
import { bad, clientKey, rateLimited, roleOf } from "@/lib/server/auth";
import { insertReport, listReports } from "@/lib/server/repo";
import { sanitizeImage } from "@/lib/domain/photo";
import { findPossibleDuplicates, missingInfo, suggestCategory } from "@/lib/domain/reports-ai";
import { newId } from "@/lib/server/util";

export async function GET(req: NextRequest) {
  await connection();
  return Response.json(listReports({ publicView: roleOf(req) !== "operator" }));
}

const UPLOAD_DIR = () => path.join(process.cwd(), "data", "uploads");

/** Citizen report: multipart form with a JSON `data` field and optional `photo`. */
export async function POST(req: NextRequest) {
  if (rateLimited(`report:${clientKey(req)}`, 5, 10 * 60_000)) return bad("Çok fazla bildirim gönderildi. Lütfen 10 dakika sonra tekrar deneyin.", 429);
  const form = await req.formData().catch(() => null);
  if (!form) return bad("Form verisi okunamadı");
  let raw: unknown;
  try { raw = JSON.parse(String(form.get("data") ?? "")); } catch { return bad("Geçersiz form verisi"); }
  const p = CitizenReportSchema.safeParse(raw);
  if (!p.success) return bad(p.error.issues.map((i) => i.message).join("; "));
  const d = p.data;

  const id = newId("R");
  let photo_path: string | null = null;
  const file = form.get("photo");
  if (file && typeof file !== "string" && file.size > 0) {
    try {
      const { type, bytes } = sanitizeImage(new Uint8Array(await file.arrayBuffer()));
      mkdirSync(UPLOAD_DIR(), { recursive: true });
      photo_path = `${id}.${type === "jpeg" ? "jpg" : "png"}`; // server-generated name; never the client filename
      writeFileSync(path.join(UPLOAD_DIR(), photo_path), bytes);
    } catch (e) {
      return bad((e as Error).message);
    }
  }

  const others = listReports({ publicView: false }).map((r) => ({ id: r.id, lon: r.lon, lat: r.lat, observed_at: r.observed_at, district: r.district, description: r.description }));
  const suggestion = suggestCategory(d.description);
  const ai = {
    note: "Otomatik öneri — olayın gerçekleştiğini doğrulamaz.",
    suggestedCategory: suggestion.category,
    matchedKeywords: suggestion.matched,
    missing: missingInfo({ description: d.description, lon: d.lon, neighborhood: d.neighborhood || null, water_depth_cm: d.water_depth_cm, observed_at: d.observed_at }),
    possibleDuplicates: findPossibleDuplicates({ id, lon: d.lon, lat: d.lat, observed_at: d.observed_at, district: d.district, description: d.description }, others),
  };
  const locId = d.district === "Başakşehir" ? "loc-basaksehir" : d.district === "Küçükçekmece" ? "loc-kucukcekmece" : null;
  insertReport({
    id, location_id: locId, district: d.district, neighborhood: d.neighborhood || null,
    // store at ~10 m precision; public views coarsen further
    lon: d.lon == null ? null : Math.round(d.lon * 1e4) / 1e4, lat: d.lat == null ? null : Math.round(d.lat * 1e4) / 1e4,
    observed_at: d.observed_at, category: d.category, description: d.description, photo_path,
    water_depth_cm: d.water_depth_cm, building_affected: d.building_affected ? 1 : 0, road_affected: d.road_affected ? 1 : 0,
    provenance: "user_reported", ai_suggestions: JSON.stringify(ai), display_name: d.display_name || null,
  });
  return Response.json({ id, status: "pending", ai }, { status: 201 });
}
