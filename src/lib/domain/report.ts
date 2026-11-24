/** Builds the preliminary decision-support report. Every section is tagged with what kind of knowledge it is. */
import type { HistoricalEvent, WiloProduct } from "./types";

export type SectionKind = "verified" | "model" | "assumption" | "illustrative" | "guidance";
export const SECTION_KIND_LABEL: Record<SectionKind, string> = {
  verified: "Doğrulanmış gözlem",
  model: "Model türevi gösterge",
  assumption: "Kullanıcı varsayımı",
  illustrative: "Örnek simülasyon sonucu",
  guidance: "Yöntem / öneri",
};

export interface ReportSection { title: string; kind: SectionKind; paragraphs: string[]; table?: { head: string[]; rows: (string | number)[][] } }
export interface ReportContent { heading: string; subtitle: string; location: string; generatedAt: string; disclaimer: string; sections: ReportSection[]; references: { title: string; url: string }[] }

export interface ReportInput {
  location: { name: string; district: string; precision: string; notes: string | null };
  analysis: { id: string; model_version: string; risk_index: number; created_at: string; explanation: AnalysisExplanation; uncertainty: AnalysisUncertainty } | null;
  events: HistoricalEvent[];
  scenarios: { scenario_name: string; provenance: string; assumptions: Record<string, unknown>; results: Record<string, number | null> }[];
  products: WiloProduct[];
  dataSources: { source: string | null; fetched_at: string | null; license: string | null }[];
  generatedAt: string;
}
export interface AnalysisExplanation {
  method: string;
  factors: { label: string; weight: number; meanContribution: number; rule: string }[];
  bands: { high: number; medium: number; low: number };
  cellCount: number;
  maxIndex: number;
  candidates: { id: string; index: number; stability: number; explanation: string; lat: number; lon: number }[];
  interpretation: string;
  pipeline: readonly { step: string; status: string; detail: string }[];
}
export interface AnalysisUncertainty { demResolutionM: number; sampleSpacingM: number; dataCompleteness: string; missingInputs: string[]; stableTopCandidates: string; rainfallNote: string; buildingScale: string }

const fmt = (v: number | null | undefined, unit = "") => (v == null ? "—" : `${v.toLocaleString("tr-TR")}${unit}`);

export function buildReport(i: ReportInput): ReportContent {
  const a = i.analysis;
  const sections: ReportSection[] = [
    {
      title: "1. Çalışma alanı",
      kind: "verified",
      paragraphs: [`${i.location.name} — ${i.location.district}. Coğrafi hassasiyet: ${i.location.precision}.`, i.location.notes ?? ""].filter(Boolean),
    },
    {
      title: "2. Veri kaynakları",
      kind: "guidance",
      paragraphs: ["Analizde kullanılan açık veri anlık görüntüleri:"],
      table: { head: ["Kaynak", "Alınma tarihi", "Lisans"], rows: i.dataSources.map((d) => [d.source ?? "—", d.fetched_at?.slice(0, 10) ?? "—", d.license ?? "—"]) },
    },
    {
      title: "3. Geçmiş olaylar",
      kind: "verified",
      paragraphs: i.events.length
        ? i.events.map((e) => `${e.event_date} — ${e.title}: ${e.consequences} (Hassasiyet: ${e.geographic_precision}; kaynak: ${e.sources[0].publisher})`)
        : ["Bu alan için doğrulanmış geçmiş olay kaydı yok."],
    },
  ];
  if (a) {
    sections.push(
      {
        title: "4. Coğrafi değerlendirme",
        kind: "model",
        paragraphs: [
          `${a.explanation.cellCount} ızgara hücresi (~${a.uncertainty.sampleSpacingM} m aralık, ${a.uncertainty.demResolutionM} m DEM) değerlendirildi. Ortalama tarama indeksi ${a.risk_index}/100, en yüksek ${a.explanation.maxIndex}/100.`,
          `Bant dağılımı — öncelikli inceleme: ${a.explanation.bands.high}, izlenmeli: ${a.explanation.bands.medium}, düşük öncelik: ${a.explanation.bands.low}.`,
        ],
        table: { head: ["Aday hücre", "İndeks", "Kararlılık", "Açıklama"], rows: a.explanation.candidates.slice(0, 5).map((c) => [`${c.lat.toFixed(4)}, ${c.lon.toFixed(4)}`, c.index, `%${Math.round(c.stability * 100)}`, c.explanation]) },
      },
      {
        title: "5. Model açıklaması",
        kind: "model",
        paragraphs: [`Yöntem: ${a.explanation.method} (${a.model_version}).`, a.explanation.interpretation, ...a.explanation.pipeline.filter((p) => p.status === "skipped").map((p) => `${p.step}: ${p.detail}`)],
        table: { head: ["Faktör", "Ağırlık", "Ort. katkı", "Kural"], rows: a.explanation.factors.map((f) => [f.label, f.weight, f.meanContribution, f.rule]) },
      },
      {
        title: "6. Belirsizlikler",
        kind: "guidance",
        paragraphs: [
          `Veri bütünlüğü: ${a.uncertainty.dataCompleteness}. Kararlı ilk-10 aday: ${a.uncertainty.stableTopCandidates}.`,
          a.uncertainty.rainfallNote,
          a.uncertainty.buildingScale,
          `Eksik girdiler: ${a.uncertainty.missingInputs.join("; ")}.`,
        ],
      },
    );
  } else {
    sections.push({ title: "4–6. Coğrafi değerlendirme", kind: "guidance", paragraphs: ["Bu konum için henüz analiz çalıştırılmadı."] });
  }
  sections.push(
    {
      title: "7. Tahliye senaryosu karşılaştırması",
      kind: "illustrative",
      paragraphs: i.scenarios.length
        ? ["Sonuçlar basitleştirilmiş toplu depolama modelinden hesaplanmıştır; ters akış, şebeke hidroliği ve yeraltı bağlantıları ihmal edilmiştir. Varsayımlar kullanıcı girdisidir."]
        : ["Kaydedilmiş senaryo yok."],
      table: i.scenarios.length
        ? {
            head: ["Senaryo", "Veri türü", "Pik depolama (m³)", "Depolama aşımı (m³)", "Boşalma süresi (sa)", "Karşılanamayan deşarj (m³)", "Enerji (kWh)"],
            rows: i.scenarios.map((s) => [s.scenario_name, s.provenance, fmt(s.results.peakStorageM3), fmt(s.results.peakExcessM3), s.results.drainTimeH == null ? "Süre içinde boşalmadı" : fmt(s.results.drainTimeH), fmt(s.results.unmetDischargeM3), fmt(s.results.energyKWh)]),
          }
        : undefined,
    },
    {
      title: "8. Wilo çözüm adayları (ön inceleme)",
      kind: "guidance",
      paragraphs: ["Aşağıdaki aileler yalnızca incelemeye değer adaylardır; uygunluk beyanı değildir. Kesin pompa seçimi için ilave hidrolik ve saha verileri gereklidir."],
      table: { head: ["Ürün", "Uygulama", "Qmax / Hmax", "Doğrulama", "Doküman"], rows: i.products.map((p) => [p.model_name, p.application, p.qmax_m3h == null ? "Veri yok" : `${p.qmax_m3h} m³/h / ${p.hmax_m} m`, p.verification_status, p.documentation_url]) },
    },
    {
      title: "9. Gerekli mühendislik kontrolleri",
      kind: "guidance",
      paragraphs: [
        "Toplam manometrik yükseklik ve sistem eğrisi; üretici pompa eğrisiyle çalışma noktası.",
        "Boru sürtünmesi, yerel kayıplar; emme koşulları, NPSH ve kavitasyon.",
        "Su bileşimi, çöp/katı madde, ızgara ihtiyacı; deşarj noktası ve alıcı şebeke kapasitesi.",
        "Elektrik beslemesi, yedek güç, taşkına karşı koruma, bakım erişimi ve işletme güvenliği.",
      ],
    },
    {
      title: "10. Önerilen sonraki adımlar",
      kind: "guidance",
      paragraphs: [
        "Aday hücrelerde saha keşfi ve yerel gözlem (ızgara, mazgal, alt geçit, bodrum girişleri).",
        "İSKİ'den yağmursuyu şebekesi ve kapasite verisinin talep edilmesi.",
        "Yüksek çözünürlüklü (LiDAR/≤5 m) yükseklik modeli ile akış birikimi analizinin tekrarlanması.",
        "Yerel yağış istasyonu (MGM/AKOM) verisiyle olay yağışlarının doğrulanması.",
        "Wilo teknik ekibiyle pompa eğrisi bazlı seçim çalışması.",
      ],
    },
  );
  const refs = new Map<string, string>();
  i.events.forEach((e) => e.sources.forEach((s) => refs.set(s.url, `${s.publisher}: ${s.title}`)));
  i.products.forEach((p) => refs.set(p.documentation_url, p.model_name));
  return {
    heading: "FloodWise İstanbul — Ön Karar Destek Raporu",
    subtitle: "Demo / Ön Fizibilite — resmi belge değildir",
    location: i.location.name,
    generatedAt: i.generatedAt,
    disclaimer: "Bu rapor bir prototip karar destek aracının çıktısıdır. Sertifikalı taşkın tahmini, erken uyarı veya pompa mühendisliği çalışması değildir; belediye onayı içermez.",
    sections,
    references: [...refs].map(([url, title]) => ({ url, title })),
  };
}
