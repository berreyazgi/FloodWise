import { NextRequest } from "next/server";
import { z } from "zod";
import { getDb } from "@/lib/server/db";
import { runAnalysis } from "@/lib/server/risk-service";
import { getAnalysis } from "@/lib/server/repo";
import { bad, forbidden, roleOf } from "@/lib/server/auth";

export async function POST(req: NextRequest) {
  if (roleOf(req) !== "operator") return forbidden();
  const p = z.object({ locationId: z.string().min(1) }).safeParse(await req.json().catch(() => null));
  if (!p.success) return bad("locationId gerekli");
  try {
    const id = runAnalysis(getDb(), p.data.locationId);
    return Response.json(getAnalysis(id), { status: 201 });
  } catch (e) {
    return bad((e as Error).message, 422);
  }
}
