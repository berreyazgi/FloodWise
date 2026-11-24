import { NextRequest } from "next/server";
import { z } from "zod";
import { bad, forbidden, roleOf } from "@/lib/server/auth";
import { updateReportStatus } from "@/lib/server/repo";

export async function PATCH(req: NextRequest, ctx: RouteContext<"/api/reports/[id]">) {
  if (roleOf(req) !== "operator") return forbidden();
  const p = z.object({ status: z.enum(["pending", "under_review", "verified", "rejected", "resolved"]), notes: z.string().max(2000).nullish() }).safeParse(await req.json().catch(() => null));
  if (!p.success) return bad("Geçersiz durum");
  const ok = updateReportStatus((await ctx.params).id, p.data.status, p.data.notes ?? null);
  return ok ? Response.json({ ok: true }) : bad("Bildirim bulunamadı", 404);
}
