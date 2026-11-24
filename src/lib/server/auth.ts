import "server-only";
import type { NextRequest } from "next/server";

// shortcut: demo role switch via cookie — NOT authentication. Replace with real IdP (e.g. e-Devlet/Keycloak) before any production use.
export type Role = "citizen" | "operator";
export const ROLE_COOKIE = "fw_role";

export function roleOf(req: NextRequest): Role {
  return req.cookies.get(ROLE_COOKIE)?.value === "operator" ? "operator" : "citizen";
}

export function forbidden() {
  return Response.json({ error: "Bu işlem için belediye operatörü (demo) rolü gerekli." }, { status: 403 });
}

export function bad(msg: string, status = 400) {
  return Response.json({ error: msg }, { status });
}

/** Simple fixed-window in-memory rate limiter (per process). */
const hits = new Map<string, number[]>();
export function rateLimited(key: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  const arr = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (arr.length >= max) { hits.set(key, arr); return true; }
  arr.push(now);
  hits.set(key, arr);
  return false;
}
export const resetRateLimits = () => hits.clear();

export function clientKey(req: NextRequest) {
  return req.headers.get("x-forwarded-for")?.split(",")[0].trim() || req.headers.get("x-real-ip") || "local";
}
