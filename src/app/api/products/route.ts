import { connection } from "next/server";
import { listProducts } from "@/lib/server/repo";

export async function GET() {
  await connection();
  return Response.json(listProducts());
}
