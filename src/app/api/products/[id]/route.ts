import { connection } from "next/server";
import { getProduct } from "@/lib/server/repo";

export async function GET(_req: Request, ctx: RouteContext<"/api/products/[id]">) {
  await connection();
  const p = getProduct((await ctx.params).id);
  return p ? Response.json(p) : Response.json({ error: "Ürün bulunamadı" }, { status: 404 });
}
