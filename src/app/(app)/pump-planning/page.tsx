"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, ExternalLink, HelpCircle, Save, XCircle, ArrowRight } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { EmptyState, ErrorState, LoadingBlock, LocationSelect, NativeSelect, Notice, PageHeader, Panel, Spinner } from "@/components/app/common";
import { SystemCurveChart } from "@/components/app/charts";
import { useApp } from "@/components/app/providers";
import { useProducts } from "@/lib/client/hooks";
import { evaluatePlan, MISSING_DATA_MSG, type PlanInput, type CandidateStatus } from "@/lib/domain/pumps";
import { systemCurve } from "@/lib/domain/hydraulics";
import { WATER_TYPE_LABEL, type WiloProduct, type WaterType } from "@/lib/domain/types";
import { PlanInputSchema } from "@/lib/schemas";
import { postJson } from "@/lib/client/api";

const VERIF: Record<WiloProduct["verification_status"], string> = {
  manufacturer_page: "Üretici sayfası (Q/H hariç alanlar)",
  secondary_datasheet: "Üretici veri sayfasının bayi kopyası",
  unverified: "Doğrulanmadı",
};
const INSTALL: Record<string, string> = { portable: "Portatif", stationary_wet: "Sabit ıslak kuyu", stationary_dry: "Sabit kuru kurulum" };
const STATUS: Record<CandidateStatus, { t: string; cls: string; icon: React.ReactNode }> = {
  investigate: { t: "İncelemeye değer", cls: "border-success/50 text-success", icon: <CheckCircle2 className="size-3.5" /> },
  data_missing: { t: "Veri eksik", cls: "border-warning/50 text-warning", icon: <HelpCircle className="size-3.5" /> },
  not_recommended: { t: "Bu koşullarda önerilmez", cls: "border-critical/50 text-critical", icon: <XCircle className="size-3.5" /> },
};

function ProductDialog({ p, onClose }: { p: WiloProduct; onClose: () => void }) {
  const row = (k: string, v: React.ReactNode) => (<><dt className="text-muted-foreground">{k}</dt><dd>{v ?? "Veri yok"}</dd></>);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader><DialogTitle>{p.model_name}</DialogTitle><DialogDescription>{p.family} · {p.category}</DialogDescription></DialogHeader>
        <dl className="grid gap-x-4 gap-y-1.5 text-sm sm:grid-cols-[11rem_1fr]">
          {row("Uygulama", p.application)}
          {row("Uygun su karakteri", p.water_types.map((w) => WATER_TYPE_LABEL[w]).join(", "))}
          {row("Kurulum", p.installation.map((i) => INSTALL[i]).join(", ") + (p.submersible ? " · dalgıç" : " · kuru tip"))}
          {row("Qmax (doğrulanmış)", p.qmax_m3h != null ? `${p.qmax_m3h} m³/h` : null)}
          {row("Hmax (doğrulanmış)", p.hmax_m != null ? `${p.hmax_m} m` : null)}
          {row("Güç", p.power)}
          {row("Serbest geçiş", p.free_passage_mm != null ? `${p.free_passage_mm} mm` : null)}
          {row("İzleme arayüzü", p.monitoring ?? "Doğrulanmış bilgi yok")}
          {row("Pompa eğrisi", "Sayısal eğri sisteme aktarılmadı — üretici dokümanından okunmalı")}
          {row("Doğrulama durumu", VERIF[p.verification_status])}
          {row("Kaynak tarihi", p.source_date)}
        </dl>
        <div className="text-sm"><b>Kısıtlar:</b><ul className="ml-4 list-disc">{p.constraints.map((c) => <li key={c}>{c}</li>)}</ul></div>
        <p className="text-sm text-muted-foreground">{p.notes}</p>
        <div className="flex flex-wrap gap-3 text-sm">
          <a href={p.documentation_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">Üretici dokümantasyonu <ExternalLink className="size-3" /></a>
          {p.spec_source_url && p.spec_source_url !== p.documentation_url && <a href={p.spec_source_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">Teknik veri kaynağı <ExternalLink className="size-3" /></a>}
        </div>
      </DialogContent>
    </Dialog>
  );
}

const DEFAULT: PlanInput = { volumeM3: 3000, targetHours: 6, pumpCount: 2, staticHeadM: 4, pipeLengthM: 120, pipeDiameterMm: 150, roughnessMm: 0.05, minorLossK: 5, waterType: "slightly_dirty", intervention: "temporary", hasPower: true, hasBackupPower: false, downstreamCapacityKnown: false, hasDebris: true };

function Num({ label, value, onChange, unit, step = 1, id }: { label: string; value: number; onChange: (v: number) => void; unit: string; step?: number; id: string }) {
  return (
    <label htmlFor={id} className="block text-sm">
      {label}
      <div className="mt-1 flex items-center gap-1.5"><Input id={id} type="number" step={step} value={Number.isFinite(value) ? value : ""} onChange={(e) => onChange(e.target.value === "" ? NaN : Number(e.target.value))} /><span className="w-12 text-xs text-muted-foreground">{unit}</span></div>
    </label>
  );
}

export default function PumpPlanningPage() {
  const products = useProducts();
  const { role, locationId } = useApp();
  const qc = useQueryClient();
  const [open, setOpen] = useState<WiloProduct | null>(null);
  const [plan, setPlan] = useState<PlanInput>(DEFAULT);
  const set = <K extends keyof PlanInput>(k: K) => (v: PlanInput[K]) => setPlan((p) => ({ ...p, [k]: v }));
  const parsed = PlanInputSchema.safeParse(plan);
  const result = useMemo(() => (parsed.success && products.data ? evaluatePlan(parsed.data, products.data) : null), [parsed.success, plan, products.data]); // eslint-disable-line react-hooks/exhaustive-deps
  const save = useMutation({ mutationFn: () => postJson("/api/scenarios", { kind: "pump_plan", locationId, name: `Pompa planı — ${plan.pumpCount} pompa, ${plan.volumeM3} m³`, input: plan }), onSuccess: () => qc.invalidateQueries() });

  return (
    <>
      <PageHeader title="Wilo Akıllı Pompa Yerleşim Planlama" subtitle="Seçili çalışma alanı için hangi Wilo pompa ailelerinin veya drenaj yaklaşımlarının incelemeye değer olduğunu keşfedin. Kesin seçim veya kurulum talimatı üretmez." actions={<LocationSelect className="w-72" id="pump-location" />} />

      <Panel title="Doğrulanmış ürün kataloğu">
        {products.isLoading ? <LoadingBlock /> : products.isError ? <ErrorState error={products.error} /> : !products.data?.length ? <EmptyState title="Ürün kaydı yok" /> : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {products.data.map((p) => (
              <button key={p.id} onClick={() => setOpen(p)} className="rounded-lg border border-border p-3 text-left transition-colors hover:border-primary/50 hover:bg-accent/40" data-testid="product-card">
                <div className="font-medium">{p.model_name}</div>
                <div className="text-xs text-muted-foreground">{p.category}</div>
                <div className="mt-2 text-xs">Q/H: {p.qmax_m3h != null ? `${p.qmax_m3h} m³/h · ${p.hmax_m} m` : <span className="text-warning">doğrulanmış veri yok</span>}</div>
                <div className="mt-1 text-[11px] text-muted-foreground">{VERIF[p.verification_status]}</div>
              </button>
            ))}
          </div>
        )}
      </Panel>

      <div className="mt-4 grid gap-4 xl:grid-cols-[22rem_1fr]">
        <Panel title="Saha ve hidrolik varsayımlar">
          <div className="space-y-3">
            <Num id="vol" label="Tahliye edilecek su hacmi" value={plan.volumeM3} onChange={set("volumeM3")} unit="m³" />
            <Num id="hours" label="Hedef tahliye süresi" value={plan.targetHours} onChange={set("targetHours")} unit="saat" step={0.5} />
            <Num id="pumps" label="Pompa adedi" value={plan.pumpCount} onChange={set("pumpCount")} unit="adet" />
            <Num id="head" label="Kot farkı (statik basma)" value={plan.staticHeadM} onChange={set("staticHeadM")} unit="m" step={0.5} />
            <Num id="len" label="Basma hattı uzunluğu" value={plan.pipeLengthM} onChange={set("pipeLengthM")} unit="m" />
            <Num id="dia" label="Boru iç çapı" value={plan.pipeDiameterMm} onChange={set("pipeDiameterMm")} unit="mm" />
            <Num id="rough" label="Boru pürüzlülüğü" value={plan.roughnessMm} onChange={set("roughnessMm")} unit="mm" step={0.01} />
            <Num id="k" label="Yerel kayıp katsayıları (ΣK)" value={plan.minorLossK} onChange={set("minorLossK")} unit="–" step={0.5} />
            <label className="block text-sm">Su karakteri
              <NativeSelect className="mt-1" value={plan.waterType} onChange={(e) => set("waterType")(e.target.value as WaterType)}>
                {(Object.keys(WATER_TYPE_LABEL) as WaterType[]).map((w) => <option key={w} value={w}>{WATER_TYPE_LABEL[w]}</option>)}
              </NativeSelect>
            </label>
            <label className="block text-sm">Müdahale türü
              <NativeSelect className="mt-1" value={plan.intervention} onChange={(e) => set("intervention")(e.target.value as PlanInput["intervention"])}>
                <option value="temporary">Geçici (mobil)</option><option value="permanent">Kalıcı (istasyon)</option>
              </NativeSelect>
            </label>
            {([["hasDebris", "Çöp / iri katı bekleniyor"], ["hasPower", "Sahada elektrik var"], ["hasBackupPower", "Yedek güç planı var"], ["downstreamCapacityKnown", "Deşarj noktası kapasitesi biliniyor"]] as const).map(([k, l]) => (
              <label key={k} className="flex items-center gap-2 text-sm"><Switch checked={plan[k]} onCheckedChange={(v: boolean) => set(k)(v)} />{l}</label>
            ))}
          </div>
        </Panel>

        <div className="space-y-4">
          {!parsed.success && <Notice tone="critical">Girdi hatası: {parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}</Notice>}
          <Notice tone="warning">{MISSING_DATA_MSG} Bir pompa yalnızca nominal debisi tahmini hacmi karşıladığı için uygun kabul edilmez.</Notice>
          {result && (
            <>
              <Panel title="Hidrolik ön hesap (Darcy–Weisbach, temiz su varsayımı)">
                <div className="grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
                  <div><div className="text-xs text-muted-foreground">Gerekli debi / pompa</div><div className="text-lg font-semibold" data-testid="q-per-pump">{result.qPerPumpM3h} m³/h</div></div>
                  <div><div className="text-xs text-muted-foreground">Toplam dinamik yük (TDH)</div><div className="text-lg font-semibold" data-testid="tdh">{result.hydraulics.tdhM} m</div></div>
                  <div><div className="text-xs text-muted-foreground">Boru hızı</div><div className="text-lg font-semibold">{result.hydraulics.velocityMs} m/s</div></div>
                  <div><div className="text-xs text-muted-foreground">Sürtünme + yerel kayıp</div><div className="text-lg font-semibold">{result.hydraulics.frictionLossM} + {result.hydraulics.minorLossM} m</div></div>
                </div>
                {(result.hydraulics.velocityMs < 0.6 || result.hydraulics.velocityMs > 3) && <Notice tone="warning" className="mt-3">Boru hızı {result.hydraulics.velocityMs} m/s; çökelme (&lt;0,6) veya aşırı kayıp/aşınma (&gt;3) riski — çap gözden geçirilmeli.</Notice>}
                <SystemCurveChart
                  curve={systemCurve(plan, Math.max(result.qPerPumpM3h * 1.6, 20))}
                  duty={{ q: result.qPerPumpM3h, h: result.hydraulics.tdhM }}
                  endpoints={result.candidates.filter((c) => c.product.qmax_m3h != null && c.status !== "not_recommended").map((c) => ({ name: c.product.model_name, q: c.product.qmax_m3h!, h: c.product.hmax_m! }))}
                />
                <p className="text-xs text-muted-foreground">Yeşil işaretler üretici Qmax/Hmax uç noktalarıdır; gerçek pompa eğrisi bu noktaları birleştiren çizgi değildir ve çalışma noktası eğriyle doğrulanmalıdır.</p>
              </Panel>

              <Panel title="Aday Wilo aileleri">
                <div className="space-y-2">
                  {result.candidates.map((c) => {
                    const s = STATUS[c.status];
                    return (
                      <div key={c.product.id} className="rounded-lg border border-border p-3" data-testid="pump-candidate">
                        <div className="flex flex-wrap items-center gap-2">
                          <button className="font-medium hover:underline" onClick={() => setOpen(c.product)}>{c.product.model_name}</button>
                          <span className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] font-medium ${s.cls}`}>{s.icon}{s.t}</span>
                          {c.optimisticDrainHours != null && <span className="text-xs text-muted-foreground">Qmax ile iyimser alt sınır: {c.optimisticDrainHours} sa</span>}
                        </div>
                        <ul className="ml-4 mt-1 list-disc text-xs text-muted-foreground">{c.reasons.map((r) => <li key={r}>{r}</li>)}</ul>
                      </div>
                    );
                  })}
                </div>
              </Panel>

              <Panel title="Saha için gerekli ek kontroller">
                <ul className="space-y-1 text-sm">{result.siteGaps.map((g) => <li key={g} className="flex gap-2"><AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" />{g}</li>)}</ul>
                <div className="mt-4 flex flex-wrap gap-2">
                  {role === "operator" && <Button onClick={() => save.mutate()} disabled={save.isPending} data-testid="save-plan">{save.isPending ? <Spinner /> : <Save className="size-4" />} Ön değerlendirmeyi kaydet</Button>}
                  <Link className={buttonVariants({ variant: "secondary" })} href={`/simulation?pumps=${plan.pumpCount}&flow=${result.qPerPumpM3h}&head=${result.hydraulics.tdhM}`}>Bu varsayımla simüle et <ArrowRight className="size-4" /></Link>
                  <Link className={buttonVariants({ variant: "secondary" })} href="/reports">Rapor oluştur</Link>
                </div>
                {save.isSuccess && <p className="mt-2 text-sm text-success" role="status">Kaydedildi — rapora dahil edilebilir.</p>}
                {save.isError && <ErrorState error={save.error} />}
              </Panel>
            </>
          )}
        </div>
      </div>
      {open && <ProductDialog p={open} onClose={() => setOpen(null)} />}
    </>
  );
}
