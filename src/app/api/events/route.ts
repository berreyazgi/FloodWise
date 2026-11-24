import { connection, NextRequest } from "next/server";
import { listEvents } from "@/lib/server/repo";

export async function GET(req: NextRequest) {
  await connection();
  const sp = req.nextUrl.searchParams;
  const from = sp.get("from"), to = sp.get("to"), district = sp.get("district"), precision = sp.get("precision");
  const events = listEvents().filter((e) =>
    (!from || e.event_date >= from) && (!to || e.event_date <= to) &&
    (!district || e.district_ids.includes(district)) && (!precision || e.geographic_precision === precision));
  return Response.json(events);
}
