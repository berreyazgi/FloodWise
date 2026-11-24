import { connection, NextRequest } from "next/server";
import { z } from "zod";
import { createLocation, listLocations } from "@/lib/server/repo";
import { forbidden, roleOf, bad } from "@/lib/server/auth";
import { runAnalysis } from "@/lib/server/risk-service";
import { getDb } from "@/lib/server/db";

export async function GET() {
  await connection();
  return Response.json(listLocations());
}

const Body = z.object({
  name: z.string().trim().min(3).max(120),
  district: z.string().trim().min(2).max(80),
  lon: z.number().min(28.4).max(29.5),
  lat: z.number().min(40.8).max(41.4),
  notes: z.string().max(1000).nullish(),
});

export async function POST(req: NextRequest) {
  if (roleOf(req) !== "operator") return forbidden();
  const p = Body.safeParse(await req.json().catch(() => null));
  if (!p.success) return bad(p.error.issues.map((i) => i.message).join("; "));
  const id = createLocation(p.data);
  let analysisId: string | null = null;
  try { analysisId = runAnalysis(getDb(), id); } catch { /* point outside analysed grids: location still created */ }
  return Response.json({ id, analysisId }, { status: 201 });
}
