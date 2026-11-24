import { connection } from "next/server";
import { eventRainfall, getEvent } from "@/lib/server/repo";

export async function GET(_req: Request, ctx: RouteContext<"/api/events/[id]">) {
  await connection();
  const { id } = await ctx.params;
  const e = getEvent(id);
  if (!e) return Response.json({ error: "Olay bulunamadı" }, { status: 404 });
  return Response.json({ ...e, rainfall: eventRainfall(e) });
}
