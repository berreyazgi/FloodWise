import { connection } from "next/server";
import { getAnalysis, listAnalyses } from "@/lib/server/repo";

export async function GET(_req: Request, ctx: RouteContext<"/api/risk/[id]">) {
  await connection();
  const { id } = await ctx.params;
  if (id === "all") return Response.json(listAnalyses());
  const a = getAnalysis(id);
  return a ? Response.json(a) : Response.json({ error: "Analiz bulunamadı" }, { status: 404 });
}
