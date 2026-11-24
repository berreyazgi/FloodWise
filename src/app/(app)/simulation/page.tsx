"use client";

import { Suspense, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Save } from "lucide-react";
import { ENGINEERING_DISCLAIMER, ErrorState, LocationSelect, NativeSelect, Notice, PageHeader, Panel, ProvenanceBadge, Spinner, fmtNum } from "@/components/app/common";
import { FlowChart, StorageChart } from "@/components/app/charts";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useApp } from "@/components/app/providers";
import { api, postJson } from "@/lib/client/api";
import { simulate, validateSim, type SimInput } from "@/lib/domain/simulation";
import { useLocation } from "@/lib/client/hooks";

interface Preset { id: string; label: string; stepMin: number; mmPerH: number[]; provenance: string; note: string }
interface Arrangement { name: string; pumpCount: number; pumpFlowM3h: number; extraStorageM3: number }
const COLORS = ["#94A3B8", "#38BDF8", "#22C55E"];

function N({ label, value, onChange, unit, step = 1 }: { label: string; value: number; onChange: (v: number) => void; unit?: string; step?: number }) {
  return (
    <label className="block text-xs">
      {label}{unit && <span className="text-muted-foreground"> ({unit})</span>}
      <Input type="number" step={step} className="mt-1 h-8" value={Number.isFinite(value) ? value : ""} onChange={(e) => onChange(e.target.value === "" ? NaN : Number(e.target.value))} />
    </label>
  );
}

function SimInner() {
  const params = useSearchParams();
  const { locationId, role } = useApp();
  const qc = useQueryClient();
  const loc = useLocation(locationId);
  const presets = useQuery({ queryKey: ["presets"], queryFn: () => api<Preset[]>("/api/simulation/presets") });
  const [presetId, setPresetId] = useState("design-125-6h");
  const [base, setBase] = useState({ areaM2: 50_000, runoffC: 0.85, initialStorageM3: 0, storageCapacityM3: 1500, dischargeLimitM3h: 500 as number | null, durationH: 24, dtMin: 5, headM: Number(params.get("head") ?? 6), efficiency: 0.5 });
  const [arr, setArr] = useState<Arrangement[]>([
    { name: "A: Ek pompa yok", pumpCount: 0, pumpFlowM3h: 0, extraStorageM3: 0 },
    { name: "B: Pompa düzeni", pumpCount: Number(params.get("pumps") ?? 4), pumpFlowM3h: Number(params.get("flow") ?? 150), extraStorageM3: 0 },
    { name: "C: Pompa + ek depolama", pumpCount: 2, pumpFlowM3h: 150, extraStorageM3: 1500 },
  ]);
  const preset = presets.data?.find((p) => p.id === presetId);
  const setB = <K extends keyof typeof base>(k: K) => (v: (typeof base)[K]) => setBase((b) => ({ ...b, [k]: v }));
  const setA = (i: number, k: keyof Arrangement, v: number | string) => setArr((a) => a.map((x, j) => (j === i ? { ...x, [k]: v } : x)));

  const inputs: SimInput[] = useMemo(() => !preset ? [] : arr.map((a) => ({
    ...base, rainMmPerH: preset.mmPerH, rainStepMin: preset.stepMin, pumpCount: a.pumpCount, pumpFlowM3h: a.pumpFlowM3h, storageCapacityM3: base.storageCapacityM3 + a.extraStorageM3,
  })), [base, arr, preset]);
  const errors = inputs.length ? validateSim(inputs[0]).concat(...inputs.slice(1).map(validateSim)) : [];
  const results = useMemo(() => (errors.length ? [] : inputs.map((i) => simulate(i))), [inputs, errors.length]);
  const merged = useMemo(() => results[0]?.series.filter((_, i) => i % 3 === 0).map((p, k) => Object.fromEntries([["tH", p.tH], ...results.map((r, j) => [`s${j}`, r.series[k * 3]?.storageM3 ?? 0])])) ?? [], [results]);

  const save = useMutation({
    mutationFn: async () => { for (let i = 0; i < arr.length; i++) await postJson("/api/scenarios", { kind: "simulation", locationId, name: arr[i].name, input: inputs[i], presetId }); },
    onSuccess: () => qc.invalidateQueries(),
  });

  return (
    <>
      <PageHeader title="Drenaj Senaryo Simülatörü" subtitle="Basitleştirilmiş toplu depolama modeli ile üç tahliye düzenini karşılaştırın. Grafikler girdiler değiştikçe yeniden hesaplanır." actions={<LocationSelect className="w-72" id="sim-location" />} />
      <Notice tone="warning" className="mb-4">{ENGINEERING_DISCLAIMER}</Notice>

      <div className="grid gap-4 xl:grid-cols-[20rem_1fr]">
        <div className="space-y-4">
          <Panel title="Yağış senaryosu">
            <NativeSelect aria-label="Yağış senaryosu" value={presetId} onChange={(e) => setPresetId(e.target.value)} data-testid="preset-select">
              {presets.data?.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
            </NativeSelect>
            {preset && <div className="mt-2 space-y-1 text-xs text-muted-foreground"><ProvenanceBadge p={preset.provenance} /><p>{preset.note}</p><p>Toplam: {fmtNum(preset.mmPerH.reduce((a, b) => a + b, 0) * preset.stepMin / 60)} mm, adım {preset.stepMin} dk.</p></div>}
          </Panel>
          <Panel title="Havza ve depolama varsayımları">
            <div className="grid grid-cols-2 gap-2">
              <N label="Katkı alanı" unit="m²" value={base.areaM2} onChange={setB("areaM2")} step={1000} />
              <N label="Akış katsayısı C" value={base.runoffC} onChange={setB("runoffC")} step={0.05} />
              <N label="Başlangıç birikimi" unit="m³" value={base.initialStorageM3} onChange={setB("initialStorageM3")} step={100} />
              <N label="Mevcut depolama" unit="m³" value={base.storageCapacityM3} onChange={setB("storageCapacityM3")} step={100} />
              <N label="Deşarj sınırı" unit="m³/h" value={base.dischargeLimitM3h ?? NaN} onChange={(v) => setB("dischargeLimitM3h")(Number.isFinite(v) ? v : null)} step={50} />
              <N label="Süre" unit="saat" value={base.durationH} onChange={setB("durationH")} />
              <N label="Zaman adımı" unit="dk" value={base.dtMin} onChange={setB("dtMin")} />
              <N label="Basma yüksekliği" unit="m" value={base.headM} onChange={setB("headM")} step={0.5} />
              <N label="Pompa verimi η" value={base.efficiency} onChange={setB("efficiency")} step={0.05} />
            </div>
            <p className="mt-2 text-[11px] text-muted-foreground">Deşarj sınırını boş bırakmak sınırsız alıcı kapasitesi varsayar. Varsayılan değerler sentetik demo varsayımlarıdır{loc.data ? ` (${loc.data.name})` : ""}.</p>
          </Panel>
          <Panel title="Karşılaştırılan düzenler">
            <div className="space-y-3">
              {arr.map((a, i) => (
                <div key={i} className="rounded-lg border border-border p-2">
                  <div className="mb-1 flex items-center gap-2 text-xs font-medium"><span className="inline-block size-2.5 rounded-full" style={{ background: COLORS[i] }} />{a.name}</div>
                  <div className="grid grid-cols-3 gap-1.5">
                    <N label="Pompa" value={a.pumpCount} onChange={(v) => setA(i, "pumpCount", v)} />
                    <N label="Debi/pompa" unit="m³/h" value={a.pumpFlowM3h} onChange={(v) => setA(i, "pumpFlowM3h", v)} step={10} />
                    <N label="Ek depo" unit="m³" value={a.extraStorageM3} onChange={(v) => setA(i, "extraStorageM3", v)} step={100} />
                  </div>
                </div>
              ))}
            </div>
            <p className="mt-2 text-[11px] text-muted-foreground">Pompa debisi kullanıcı varsayımıdır (çalışma noktası); ürün Qmax değeri değildir.</p>
          </Panel>
        </div>

        <div className="space-y-4">
          {presets.isError && <ErrorState error={presets.error} />}
          {errors.length > 0 && <Notice tone="critical">{errors.join(" ")}</Notice>}
          {results.length === 3 && (
            <>
              <div className="grid gap-3 md:grid-cols-3" data-testid="sim-results">
                {results.map((r, i) => (
                  <div key={i} className="rounded-xl border border-border bg-card p-3 text-sm">
                    <div className="mb-1 flex items-center gap-2 font-medium"><span className="inline-block size-2.5 rounded-full" style={{ background: COLORS[i] }} />{arr[i].name}</div>
                    <dl className="grid grid-cols-[1fr_auto] gap-y-0.5 text-xs">
                      <dt className="text-muted-foreground">Pik birikim</dt><dd className="tabular-nums" data-testid={`peak-${i}`}>{fmtNum(r.peakStorageM3, 0)} m³ (t={r.peakTimeH} sa)</dd>
                      <dt className="text-muted-foreground">Depolama aşımı (yüzey taşkını)</dt><dd className={r.peakExcessM3 > 0 ? "tabular-nums text-critical" : "tabular-nums text-success"}>{fmtNum(r.peakExcessM3, 0)} m³</dd>
                      <dt className="text-muted-foreground">Yağış sonrası boşalma</dt><dd>{r.drainTimeH == null ? "Süre içinde boşalmadı" : `${r.drainTimeH} sa`}</dd>
                      <dt className="text-muted-foreground">Toplam giriş / pompalanan</dt><dd className="tabular-nums">{fmtNum(r.totalInflowM3, 0)} / {fmtNum(r.totalPumpedM3, 0)} m³</dd>
                      <dt className="text-muted-foreground">Karşılanamayan deşarj</dt><dd className="tabular-nums">{fmtNum(r.unmetDischargeM3, 0)} m³</dd>
                      <dt className="text-muted-foreground">Yaklaşık pompa enerjisi</dt><dd className="tabular-nums">{r.energyKWh == null ? "—" : `${fmtNum(r.energyKWh)} kWh`}</dd>
                    </dl>
                  </div>
                ))}
              </div>
              <Panel title="Birikim hacmi – zaman">
                <StorageChart data={merged} keys={arr.map((a, i) => ({ key: `s${i}`, label: a.name, color: COLORS[i], dash: i === 0 ? "4 3" : undefined }))} />
                <p className="text-xs text-muted-foreground">Mevcut depolama kapasitesinin üzerindeki hacim “depolama aşımı” olarak raporlanır (yüzeyde birikme / taşkın vekili).</p>
              </Panel>
              <Panel title={`Giriş ve çıkış debisi — ${arr[1].name}`}>
                <FlowChart data={results[1].series} />
              </Panel>
              <Panel title="Model kapsamı">
                <ul className="ml-4 list-disc text-xs text-muted-foreground">
                  <li>Giriş: rasyonel yöntem hacim formu Q = C · i · A; sızma, gecikme ve yüzey akış rotalaması ihmal edildi.</li>
                  <li>Çıkış = min(mevcut su, pompa kapasitesi, deşarj sınırı). Pompa debisinin basma yüksekliğiyle değişimi modellenmedi.</li>
                  <li>Ters akış (backwater), şebeke hidroliği, yeraltı bağlantıları ve ayrıntılı hidrodinamik ihmal edildi.</li>
                  <li>Enerji = ρ·g·V·H/η; yalnızca basma yüksekliği ve verim girildiğinde hesaplanır.</li>
                </ul>
                {role === "operator" && (
                  <div className="mt-3">
                    <Button onClick={() => save.mutate()} disabled={save.isPending} data-testid="save-scenarios">{save.isPending ? <Spinner /> : <Save className="size-4" />} Üç senaryoyu kaydet</Button>
                    {save.isSuccess && <span className="ml-2 text-sm text-success" role="status">Kaydedildi (sonuçlar sunucuda yeniden hesaplandı).</span>}
                    {save.isError && <ErrorState error={save.error} />}
                  </div>
                )}
              </Panel>
            </>
          )}
        </div>
      </div>
    </>
  );
}

export default function SimulationPage() {
  return <Suspense><SimInner /></Suspense>;
}
