import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { answer, type AssistantAnswer, type AssistantContext } from "@/lib/domain/assistant";
import { eventsForLocation, getLocation, latestAnalysis, listEvents, listProducts, listScenarios } from "./repo";

export function buildContext(locationId: string | null): AssistantContext {
  const loc = locationId ? getLocation(locationId) : null;
  return {
    location: loc ? { id: loc.id, name: loc.name, district: loc.district, precision: loc.geographic_precision } : null,
    analysis: loc ? latestAnalysis(loc.id) : null,
    events: loc ? eventsForLocation(loc.district) : listEvents(),
    products: listProducts(),
    scenarios: loc ? listScenarios(loc.id).filter((s) => s.kind === "simulation") : [],
  };
}

const SYSTEM = `Sen FloodWise Asistan'sın: İstanbul için prototip bir kentsel taşkın karar destek aracının yardımcısısın.
Yalnızca sana verilen KAYITLAR bölümündeki bilgileri kullan. Kayıtta olmayan konum, sayı, ürün özelliği veya olay uydurma.
Gerçekleri varsayımlardan ayır ve belirsizliği açıkça söyle. Kesin hayati güvenlik talimatı verme; belediye yetkisi iddia etme.
Türkçe, kısa (en fazla 150 kelime), düz metin yanıt ver.`;

/** Optional LLM phrasing. The deterministic answer is always computed and its citations are always returned. */
export async function ask(question: string, locationId: string | null): Promise<AssistantAnswer & { text: string | null; mode: "llm" | "deterministic"; llmError?: string }> {
  const ctx = buildContext(locationId);
  const base = answer(question, ctx);
  if (!process.env.ANTHROPIC_API_KEY || base.intent === "safety") return { ...base, text: null, mode: "deterministic" };

  const records = JSON.stringify({ facts: base.facts, assumptions: base.assumptions, uncertainty: base.uncertainty, citations: base.citations });
  try {
    const client = new Anthropic();
    const res = await client.beta.messages.create({
      model: process.env.ANTHROPIC_MODEL || "claude-opus-5-5",
      max_tokens: 2000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "low" },
      system: SYSTEM,
      messages: [{ role: "user", content: `KAYITLAR:\n${records}\n\nSORU: ${question}` }],
    });
    if (res.stop_reason === "refusal") return { ...base, text: null, mode: "deterministic", llmError: "Model yanıtı reddetti; deterministik yanıt gösteriliyor." };
    const text = res.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("\n").trim();
    return { ...base, text: text || null, mode: text ? "llm" : "deterministic" };
  } catch (e) {
    const msg = e instanceof Anthropic.APIError ? `LLM hatası (${e.status})` : "LLM'e ulaşılamadı";
    return { ...base, text: null, mode: "deterministic", llmError: `${msg}; deterministik yanıt gösteriliyor.` };
  }
}
