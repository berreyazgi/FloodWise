import { NextRequest } from "next/server";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { forbidden, roleOf } from "@/lib/server/auth";
import { getReportRow } from "@/lib/server/repo";

/** Operator-only photo access; served with a fixed image content-type and nosniff. */
export async function GET(req: NextRequest, ctx: RouteContext<"/api/reports/[id]/photo">) {
  if (roleOf(req) !== "operator") return forbidden();
  const r = getReportRow((await ctx.params).id);
  if (!r?.photo_path || !/^[\w-]+\.(jpg|png)$/.test(r.photo_path)) return Response.json({ error: "Fotoğraf yok" }, { status: 404 });
  const file = path.join(process.cwd(), "data", "uploads", r.photo_path);
  if (!existsSync(file)) return Response.json({ error: "Fotoğraf yok" }, { status: 404 });
  return new Response(readFileSync(file), { headers: { "Content-Type": r.photo_path.endsWith(".png") ? "image/png" : "image/jpeg", "X-Content-Type-Options": "nosniff", "Cache-Control": "private, no-store" } });
}
