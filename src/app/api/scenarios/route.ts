import { connection, NextRequest } from "next/server";
import { z } from "zod";
import { listScenarios, listProducts, saveScenario, getLocation } from "@/lib/server/repo";
import { bad, forbidden, roleOf } from "@/lib/server/auth";
import { simulate } from "@/lib/domain/simulation";
import { evaluatePlan } from "@/lib/domain/pumps";
import { PlanInputSchema, SimInputSchema } from "@/lib/schemas";

export async function GET(req: NextRequest) {
  await connection();
  return Response.json(listScenarios(req.nextUrl.searchParams.get("locationId") ?? undefined));
}

const Body = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("simulation"), locationId: z.string(), name: z.string().trim().min(2).max(120), input: SimInputSchema, presetId: z.string().optional() }),
  z.object({ kind: z.literal("pump_plan"), locationId: z.string(), name: z.string().trim().min(2).max(120), input: PlanInputSchema }),
]);

/** Results are recomputed server-side from the assumptions; client-sent results are never stored. */
export async function POST(req: NextRequest) {
  if (roleOf(req) !== "operator") return forbidden();
  const p = Body.safeParse(await req.json().catch(() => null));
  if (!p.success) return bad(p.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
  if (!getLocation(p.data.locationId)) return bad("Konum bulunamadı", 404);
  if (p.data.kind === "simulation") {
    const { series: _series, ...summary } = simulate(p.data.input);
    const id = saveScenario({ location_id: p.data.locationId, scenario_name: p.data.name, kind: "simulation", assumptions: { ...p.data.input, presetId: p.data.presetId }, product_id: null, results: summary });
    return Response.json({ id, results: summary }, { status: 201 });
  }
  const plan = evaluatePlan(p.data.input, listProducts());
  const results = { qPerPumpM3h: plan.qPerPumpM3h, tdhM: plan.hydraulics.tdhM, investigate: plan.candidates.filter((c) => c.status === "investigate").map((c) => c.product.id), dataMissing: plan.candidates.filter((c) => c.status === "data_missing").map((c) => c.product.id) };
  const id = saveScenario({ location_id: p.data.locationId, scenario_name: p.data.name, kind: "pump_plan", assumptions: p.data.input, product_id: results.investigate[0] ?? null, results });
  return Response.json({ id, results }, { status: 201 });
}
