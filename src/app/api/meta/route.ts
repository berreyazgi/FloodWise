import { connection } from "next/server";
import { stats } from "@/lib/server/repo";

export async function GET() {
  await connection();
  return Response.json({ demoMode: true, llmConfigured: !!process.env.ANTHROPIC_API_KEY, ...stats() });
}
