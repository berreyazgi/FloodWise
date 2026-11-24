import { connection } from "next/server";
import { districtIdsOf, eventsForLocation, getLocation, latestAnalysis, listScenarios, rainfallClimatology } from "@/lib/server/repo";

export async function GET(_req: Request, ctx: RouteContext<"/api/locations/[id]">) {
  await connection();
  const { id } = await ctx.params;
  const loc = getLocation(id);
  if (!loc) return Response.json({ error: "Konum bulunamadı" }, { status: 404 });
  const ids = districtIdsOf(loc.district);
  return Response.json({
    ...loc,
    analysis: latestAnalysis(id),
    events: eventsForLocation(loc.district),
    scenarios: listScenarios(id),
    climatology: ids.map((d) => ({ district_id: d, ...rainfallClimatology(d) })),
  });
}
