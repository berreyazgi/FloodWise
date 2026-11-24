import { connection } from "next/server";
import { rainPresets } from "@/lib/server/rain-presets";

export async function GET() {
  await connection();
  return Response.json(rainPresets());
}
