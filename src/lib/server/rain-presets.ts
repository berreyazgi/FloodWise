import "server-only";
import { snapshots } from "./snapshots";
import type { Provenance } from "@/lib/domain/types";

export interface RainPreset { id: string; label: string; stepMin: number; mmPerH: number[]; provenance: Provenance; note: string }

export function rainPresets(): RainPreset[] {
  const out: RainPreset[] = [
    { id: "design-50-1h", label: "Tasarım: 50 mm / 1 saat (sabit)", stepMin: 60, mmPerH: [50], provenance: "synthetic_demo", note: "Eğitim amaçlı sabit yoğunluklu varsayım; İstanbul için doğrulanmış tasarım yağışı değildir." },
    { id: "design-125-6h", label: "Varsayım: 125 mm / 6 saat (üçgen)", stepMin: 60, mmPerH: [8, 20, 35, 32, 20, 10], provenance: "synthetic_demo", note: "Toplam, Eylül 2023 için basında aktarılan ~125 kg/m² değerine eşitlendi; zaman dağılımı varsayımdır." },
  ];
  const rain = snapshots.rainfall();
  const s = rain?.series.find((x) => x.district_id === "basaksehir" && x.kind === "hourly" && x.start.startsWith("2009"));
  if (s) {
    const start = s.time.findIndex((t) => t.startsWith("2009-09-08T12"));
    const vals = s.time.slice(start, start + 36).map((_, i) => s.precipitation_mm[start + i] ?? 0);
    out.push({ id: "era5-2009", label: "ERA5: 8–9 Eylül 2009, Başakşehir (36 saat)", stepMin: 60, mmPerH: vals, provenance: "estimated", note: "Open-Meteo/ERA5 yeniden analiz verisi. Yerel sağanağı düşük gösterir — gerçek olayın alt sınırı gibi okunmalıdır." });
  }
  return out;
}
