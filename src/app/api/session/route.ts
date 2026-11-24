import { NextRequest } from "next/server";
import { z } from "zod";
import { ROLE_COOKIE, roleOf } from "@/lib/server/auth";

export async function GET(req: NextRequest) {
  return Response.json({ role: roleOf(req), demo: true });
}

/** Demo role switch — sets a cookie; not authentication. */
export async function POST(req: NextRequest) {
  const parsed = z.object({ role: z.enum(["citizen", "operator"]) }).safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Geçersiz rol" }, { status: 400 });
  const res = Response.json({ role: parsed.data.role, demo: true });
  res.headers.append("Set-Cookie", `${ROLE_COOKIE}=${parsed.data.role}; Path=/; SameSite=Lax; HttpOnly; Max-Age=86400`);
  return res;
}
