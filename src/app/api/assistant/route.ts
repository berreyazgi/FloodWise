import { NextRequest } from "next/server";
import { z } from "zod";
import { ask } from "@/lib/server/assistant";
import { bad, clientKey, rateLimited } from "@/lib/server/auth";

export async function POST(req: NextRequest) {
  if (rateLimited(`assistant:${clientKey(req)}`, 30, 60_000)) return bad("Çok fazla istek; bir dakika sonra deneyin.", 429);
  const p = z.object({ question: z.string().trim().min(3).max(500), locationId: z.string().nullish() }).safeParse(await req.json().catch(() => null));
  if (!p.success) return bad("Soru 3–500 karakter olmalı");
  return Response.json(await ask(p.data.question, p.data.locationId ?? null));
}
