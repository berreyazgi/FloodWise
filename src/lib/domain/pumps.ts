/** Preliminary Wilo candidate screening. Never returns "suitable" — only "worth investigating" vs. blockers. */
import { totalDynamicHead, type PipeInput } from "./hydraulics";
import type { WaterType, WiloProduct } from "./types";

export const MISSING_DATA_MSG = "Kesin pompa seçimi için ilave hidrolik ve saha verileri gereklidir.";

export interface PlanInput extends Omit<PipeInput, "flowM3h"> {
  volumeM3: number; // water to remove
  targetHours: number; // desired drain time
  pumpCount: number;
  waterType: WaterType;
  intervention: "temporary" | "permanent";
  hasPower: boolean;
  hasBackupPower: boolean;
  downstreamCapacityKnown: boolean;
  hasDebris: boolean;
}

export type CandidateStatus = "investigate" | "data_missing" | "not_recommended";
export interface Candidate {
  product: WiloProduct;
  status: CandidateStatus;
  reasons: string[];
  optimisticDrainHours: number | null; // at Qmax — a lower bound, real operating point is lower flow
}

export function requiredFlowPerPump(p: PlanInput) {
  return p.volumeM3 / p.targetHours / Math.max(1, p.pumpCount);
}

export function evaluatePlan(p: PlanInput, products: WiloProduct[]) {
  const qPerPump = requiredFlowPerPump(p);
  const hyd = totalDynamicHead({ ...p, flowM3h: qPerPump });
  const siteGaps: string[] = [];
  if (!p.downstreamCapacityKnown) siteGaps.push("Deşarj noktasının / alıcı şebekenin kapasitesi bilinmiyor.");
  if (!p.hasPower) siteGaps.push("Sahada elektrik beslemesi yok — jeneratör veya alternatif gerekli.");
  if (!p.hasBackupPower) siteGaps.push("Yedek güç planı yok; sel sırasında şebeke kesintisi olası.");
  if (p.hasDebris) siteGaps.push("Çöp/iri katı bekleniyor — ızgara/ön eleme ve uygun serbest geçiş doğrulanmalı.");
  siteGaps.push("Pompa eğrisi ile sistem eğrisinin kesişimi (çalışma noktası) üretici eğrisiyle doğrulanmalı.");
  siteGaps.push("Emme koşulları, NPSH ve kavitasyon riski sahada değerlendirilmeli.");

  const candidates: Candidate[] = products.map((product) => {
    const reasons: string[] = [];
    let status = "investigate" as CandidateStatus; // widened: also mutated inside block()
    const block = (r: string) => { reasons.push(r); status = "not_recommended"; };

    if (!product.water_types.includes(p.waterType)) block("Belirtilen su karakteri ürünün kayıtlı uygulama alanında değil.");
    if (p.intervention === "permanent" && product.installation.length === 1 && product.installation[0] === "portable")
      block("Yalnızca portatif kullanım için kayıtlı; kalıcı kurulum için uygun aile değil.");
    if (p.hasDebris && product.free_passage_mm != null && product.free_passage_mm < 10)
      block(`Serbest geçiş ${product.free_passage_mm} mm; iri katı içeren su için yetersiz.`);
    if (!product.submersible) reasons.push("Kuru tip — pompa taşkın kotunun üzerine ve korunaklı yerleştirilmeli.");

    let optimistic: number | null = null;
    if (product.qmax_m3h == null || product.hmax_m == null) {
      if (status !== "not_recommended") status = "data_missing";
      reasons.push("Doğrulanmış Q/H verisi yok — hidrolik kontrol yapılamadı.");
    } else {
      optimistic = Math.round((p.volumeM3 / (product.qmax_m3h * Math.max(1, p.pumpCount))) * 10) / 10;
      if (hyd.tdhM >= product.hmax_m) block(`Hesaplanan TDH ${hyd.tdhM} m ≥ Hmax ${product.hmax_m} m: bu debide basamaz.`);
      if (qPerPump >= product.qmax_m3h) block(`Gereken debi ${qPerPump.toFixed(1)} m³/h/pompa ≥ Qmax ${product.qmax_m3h} m³/h.`);
      if (status === "investigate")
        reasons.push(`Qmax/Hmax ön koşulu sağlanıyor; ancak Qmax yalnızca 0 m basmada geçerlidir. Gerçek süre ${optimistic} saatten uzun olacaktır.`);
    }
    return { product, status, reasons, optimisticDrainHours: optimistic };
  });

  const order: Record<CandidateStatus, number> = { investigate: 0, data_missing: 1, not_recommended: 2 };
  candidates.sort((a, b) => order[a.status] - order[b.status]);
  return { qPerPumpM3h: Math.round(qPerPump * 10) / 10, hydraulics: hyd, siteGaps, candidates, message: MISSING_DATA_MSG };
}
