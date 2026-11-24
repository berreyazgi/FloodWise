import { connection, NextRequest } from "next/server";
import { forbidden, roleOf } from "@/lib/server/auth";
import { getGeneratedReport } from "@/lib/server/repo";

export async function GET(req: NextRequest, ctx: RouteContext<"/api/generated-reports/[id]">) {
  await connection();
  if (roleOf(req) !== "operator") return forbidden();
  const r = getGeneratedReport((await ctx.params).id);
  return r ? Response.json(r) : Response.json({ error: "Rapor bulunamadı" }, { status: 404 });
}
