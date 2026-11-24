/**
 * FloodWise Asistan — deterministic retrieval over application records. Works with no LLM.
 * Each answer separates facts (records) from assumptions and lists citations.
 */
import type { HistoricalEvent, WiloProduct } from "./types";
import type { AnalysisExplanation, AnalysisUncertainty } from "./report";

export interface AssistantContext {
  location: { id: string; name: string; district: string; precision: string } | null;
  analysis: { model_version: string; risk_index: number; explanation: AnalysisExplanation; uncertainty: AnalysisUncertainty } | null;
  events: HistoricalEvent[];
  products: WiloProduct[];
  scenarios: { scenario_name: string; provenance: string; results: Record<string, number | null> }[];
}

export type Intent = "why_priority" | "history" | "missing" | "wilo" | "scenario_diff" | "safety" | "unknown";
export interface Citation { label: string; url?: string; recordId?: string }
export interface AssistantAnswer { intent: Intent; facts: string[]; assumptions: string[]; uncertainty: string[]; citations: Citation[] }

const has = (q: string, words: string[]) => words.some((w) => q.includes(w));

export function detectIntent(question: string): Intent {
  const q = question.toLocaleLowerCase("tr-TR");
  if (has(q, ["tahliye et", "kaçmalı", "acil", "hayati", "evden çık", "112"])) return "safety";
  if (has(q, ["senaryo", "fark", "karşılaştır"])) return "scenario_diff";
  if (has(q, ["wilo", "pompa", "ürün", "çözüm"])) return "wilo";
  if (has(q, ["eksik", "hangi veri", "veri yok", "belirsiz"])) return "missing";
  if (has(q, ["geçmiş", "kayıt", "tarih", "olay", "2009", "2023"])) return "history";
  if (has(q, ["neden", "öncelik", "risk", "skor", "indeks"])) return "why_priority";
  return "unknown";
}

export function answer(question: string, ctx: AssistantContext): AssistantAnswer {
  const intent = detectIntent(question);
  const loc = ctx.location;
  const out: AssistantAnswer = { intent, facts: [], assumptions: [], uncertainty: [], citations: [] };
  const needLoc = () => { out.uncertainty.push("Önce sağ üstten veya haritadan bir çalışma alanı seçin."); return out; };

  switch (intent) {
    case "safety":
      out.facts.push("FloodWise bir erken uyarı veya acil durum sistemi değildir ve hayati güvenlik talimatı veremez.");
      out.facts.push("Acil durumlarda 112'yi arayın ve İstanbul Valiliği / AFAD / İBB AKOM resmi duyurularını izleyin.");
      return out;
    case "why_priority": {
      if (!loc) return needLoc();
      const a = ctx.analysis;
      if (!a) { out.uncertainty.push(`${loc.name} için henüz analiz çalıştırılmadı.`); return out; }
      const f = [...a.explanation.factors].sort((x, y) => y.meanContribution - x.meanContribution);
      out.facts.push(`${loc.name}: ${a.explanation.cellCount} hücrenin ortalama tarama indeksi ${a.risk_index}/100, en yüksek ${a.explanation.maxIndex}/100 (${a.model_version}).`);
      out.facts.push(`Alan genelinde en büyük ortalama katkı: ${f[0].label} (${f[0].meanContribution}), ardından ${f[1].label} (${f[1].meanContribution}).`);
      const top = a.explanation.candidates[0];
      if (top) out.facts.push(`En yüksek öncelikli hücre (${top.lat.toFixed(4)}, ${top.lon.toFixed(4)}): ${top.explanation}`);
      if (ctx.events.length) out.facts.push(`İlçe düzeyinde ${ctx.events.length} doğrulanmış geçmiş olay kaydı var (hücre ölçeğinde değil).`);
      out.assumptions.push("Faktör ağırlıkları uzman varsayımıdır; duyarlılık analizi ile sınandı, gözlemle kalibre edilmedi.");
      out.uncertainty.push(a.uncertainty.buildingScale, `Veri bütünlüğü: ${a.uncertainty.dataCompleteness}.`);
      out.citations.push({ label: `Risk analizi kaydı (${a.model_version})`, recordId: loc.id });
      return out;
    }
    case "history":
      if (!ctx.events.length) { out.facts.push(loc ? `${loc.name} için uygulamada doğrulanmış olay kaydı yok.` : "Kayıtlı olay bulunamadı."); return out; }
      for (const e of ctx.events) {
        out.facts.push(`${e.event_date} — ${e.title}: ${e.description} ${e.consequences}`);
        out.uncertainty.push(`${e.id}: ${e.data_quality}`);
        e.sources.forEach((s) => out.citations.push({ label: `${s.publisher}: ${s.title}`, url: s.url, recordId: e.id }));
      }
      return out;
    case "missing":
      if (!loc || !ctx.analysis) return needLoc();
      out.facts.push(`Mevcut girdiler: ${ctx.analysis.explanation.factors.map((f) => f.label).join(", ")}.`);
      out.facts.push(`Eksik girdiler: ${ctx.analysis.uncertainty.missingInputs.join("; ")}.`);
      out.uncertainty.push(`DEM çözünürlüğü ${ctx.analysis.uncertainty.demResolutionM} m; örnekleme aralığı ~${ctx.analysis.uncertainty.sampleSpacingM} m.`, ctx.analysis.uncertainty.rainfallNote);
      return out;
    case "wilo": {
      const rel = ctx.products.filter((p) => p.water_types.includes("slightly_dirty") || p.water_types.includes("sandy"));
      out.facts.push("Kataloğumuzdaki ürün aileleri ve kayıtlı uygulama alanları:");
      rel.forEach((p) => {
        out.facts.push(`${p.model_name} — ${p.application}. Q/H: ${p.qmax_m3h == null ? "doğrulanmış veri yok" : `Qmax ${p.qmax_m3h} m³/h, Hmax ${p.hmax_m} m`}.`);
        out.citations.push({ label: p.model_name, url: p.documentation_url });
      });
      out.assumptions.push("Hangi ailenin değerlendirileceği su karakteri, hacim, basma yüksekliği ve deşarj koşullarına bağlıdır — Pompa Planlama ekranında girin.");
      out.uncertainty.push("Kesin pompa seçimi için ilave hidrolik ve saha verileri gereklidir.");
      return out;
    }
    case "scenario_diff": {
      if (ctx.scenarios.length < 2) { out.uncertainty.push("Karşılaştırma için bu alanda en az iki kayıtlı senaryo gerekli."); return out; }
      const [a, b] = ctx.scenarios;
      const d = (k: string) => `${a.results[k] ?? "—"} → ${b.results[k] ?? "—"}`;
      out.facts.push(`"${a.scenario_name}" ile "${b.scenario_name}" karşılaştırması (hesaplanmış sonuçlar):`);
      out.facts.push(`Pik depolama (m³): ${d("peakStorageM3")}; depolama aşımı (m³): ${d("peakExcessM3")}; boşalma süresi (sa): ${d("drainTimeH")}; karşılanamayan deşarj (m³): ${d("unmetDischargeM3")}.`);
      out.assumptions.push(`Senaryo veri türleri: ${a.provenance}, ${b.provenance}. Girdiler kullanıcı varsayımıdır.`);
      out.uncertainty.push("Toplu depolama modeli; ters akış, şebeke hidroliği ve yeraltı bağlantıları ihmal edilir.");
      return out;
    }
    default:
      out.uncertainty.push("Soruyu eşleştiremedim. Örnek: “Bu bölge neden inceleme önceliği taşıyor?”, “Hangi veriler eksik?”, “Bu konumda hangi Wilo çözümleri değerlendirilebilir?”");
      return out;
  }
}
