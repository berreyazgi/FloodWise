import { connection, NextRequest } from "next/server";
import { z } from "zod";
import { bad, forbidden, roleOf } from "@/lib/server/auth";
import { generateReport, listGeneratedReports } from "@/lib/server/repo";

export async function GET(req: NextRequest) {
  await connection();
  if (roleOf(req) !== "operator") return forbidden();
  return Response.json(listGeneratedReports());
}

export async function POST(req: NextRequest) {
  if (roleOf(req) !== "operator") return forbidden();
  const p = z.object({ locationId: z.string(), scenarioIds: z.array(z.string()).nullish() }).safeParse(await req.json().catch(() => null));
  if (!p.success) return bad("locationId gerekli");
  try {
    return Response.json({ id: generateReport(p.data.locationId, p.data.scenarioIds ?? null) }, { status: 201 });
  } catch (e) {
    return bad((e as Error).message, 404);
  }
}
