"use client";

import Link from "next/link";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, CircleSlash, Play, ArrowRight } from "lucide-react";
import { useApp } from "@/components/app/providers";
import { BandBadge, BUILDING_SCALE_MSG, EmptyState, ErrorState, LoadingBlock, LocationSelect, Notice, PageHeader, Panel, ProvenanceBadge, Spinner, StatTile, fmtDate } from "@/components/app/common";
import { AnnualMaxChart, FactorBars } from "@/components/app/charts";
import { Button, buttonVariants } from "@/components/ui/button";
import { useLocation } from "@/lib/client/hooks";
import { postJson } from "@/lib/client/api";

export default function RiskAnalysisPage() {
  const { locationId, role } = useApp();
  const qc = useQueryClient();
  const loc = useLocation(locationId);
  const run = useMutation({ mutationFn: () => postJson("/api/risk/run", { locationId }), onSuccess: () => qc.invalidateQueries() });
  const a = loc.data?.analysis;
  const clim = loc.data?.climatology.find((c) => c.annualMax?.length);

  return (
    <>
      <PageHeader
        title="Yapay Zekâ Destekli Risk Analizi"
        subtitle="Hangi alanların ileri inceleme gerektirdiğini mevcut kanıtlara göre önceliklendirir. Çıktı doğrulanmış bir taşkın olasılığı değildir."
        actions={
          <>
            <LocationSelect className="w-72" id="risk-location" />
            {role === "operator"
              ? <Button onClick={() => run.mutate()} disabled={run.isPending} data-testid="run-analysis">{run.isPending ? <Spinner /> : <Play className="size-4" />} Analizi yeniden çalıştır</Button>
              : <span className="self-center text-xs text-muted-foreground">Çalıştırmak için operatör (demo) rolü</span>}
          </>
        }
      />
      {run.isError && <ErrorState error={run.error} />}
      {loc.isLoading ? <LoadingBlock rows={6} /> : loc.isError ? <ErrorState error={loc.error} /> : !a ? (
        <EmptyState title="Bu alan için analiz yok">Operatör rolüyle “Analizi yeniden çalıştır” düğmesini kullanın. Izgara dışındaki noktalar için veri bulunmayabilir.</EmptyState>
      ) : (
        <div className="space-y-4" data-testid="analysis">
          <Notice tone="warning">
            <b>Model türü: keşifsel tarama indeksi ({a.model_version}).</b> Doğrulanmış etiketli veri yetersiz olduğu için makine öğrenmesi modeli eğitilmedi ve doğruluk (precision/recall/F1) metriği gösterilmez. Bu indeks, saha incelemesi önceliği için şeffaf bir göstergedir.
          </Notice>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
            <StatTile label="Ortalama indeks" value={a.risk_index} hint="0–100" />
            <StatTile label="En yüksek hücre" value={a.explanation.maxIndex} />
            <StatTile label="Öncelikli hücre" value={a.explanation.bands.high} hint={`${a.explanation.cellCount} hücreden`} tone="warning" />
            <StatTile label="Veri bütünlüğü" value={`%${Math.round(a.uncertainty.completenessRatio * 100)}`} hint={a.uncertainty.dataCompleteness} />
            <StatTile label="Kararlı ilk-10" value={a.uncertainty.stableTopCandidates} hint="ağırlık duyarlılığı" />
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <Panel title="Analiz hattı">
              <ol className="space-y-2 text-sm">
                {a.explanation.pipeline.map((p, i) => (
                  <li key={i} className="flex gap-2">
                    {p.status === "done" ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" aria-label="Tamamlandı" /> : <CircleSlash className="mt-0.5 size-4 shrink-0 text-warning" aria-label="Uygulanmadı" />}
                    <div><div className="font-medium">{i + 1}. {p.step}</div><div className="text-xs text-muted-foreground">{p.detail}</div></div>
                  </li>
                ))}
              </ol>
              <div className="mt-3 text-xs text-muted-foreground">Çalıştırma: {fmtDate(a.created_at)} · Analiz kimliği {a.id}</div>
            </Panel>
            <Panel title="Faktör katkıları (alan ortalaması)">
              <FactorBars data={a.explanation.factors.map((f) => ({ label: f.label, value: f.meanContribution }))} />
              <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                {a.explanation.factors.map((f) => <li key={f.label}><b className="text-foreground">{f.label}</b> (ağırlık {f.weight}): {f.rule}</li>)}
              </ul>
              <p className="mt-2 text-sm">{a.explanation.interpretation}</p>
            </Panel>
          </div>

          <Panel title="İnceleme adayı konumlar (ilk 10)">
            <div className="space-y-3">
              {a.explanation.candidates.map((c, i) => (
                <div key={c.id} className="rounded-lg border border-border p-3" data-testid="candidate">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xs text-muted-foreground">#{i + 1} · {c.lat.toFixed(4)}, {c.lon.toFixed(4)}</span>
                    <span className="font-semibold">{c.index}</span><BandBadge index={c.index} />
                    <span className="text-xs text-muted-foreground">kararlılık %{Math.round(c.stability * 100)} ({c.stabilityLabel})</span>
                    <ProvenanceBadge p="estimated" />
                  </div>
                  <p className="mt-1 text-sm">{c.explanation}</p>
                </div>
              ))}
            </div>
          </Panel>

          <div className="grid gap-4 xl:grid-cols-2">
            <Panel title="Belirsizlik ve sınırlamalar">
              <ul className="ml-4 list-disc space-y-1 text-sm">
                <li>Yükseklik modeli: {a.uncertainty.demResolutionM} m çözünürlük, ~{a.uncertainty.sampleSpacingM} m örnekleme aralığı.</li>
                <li>{a.uncertainty.rainfallNote}</li>
                <li>{BUILDING_SCALE_MSG}</li>
                {a.uncertainty.missingInputs.map((m) => <li key={m}>Eksik: {m}</li>)}
              </ul>
            </Panel>
            <Panel title="Geçmiş kanıt">
              {a.explanation.historicalEvidence.length ? (
                <ul className="space-y-2 text-sm">
                  {a.explanation.historicalEvidence.map((e) => (
                    <li key={e.id} className="flex items-center justify-between gap-2 rounded-lg border border-border p-2">
                      <span>{e.date} — {e.title}</span>
                      <Link href={`/historical-events?id=${e.id}`} className="text-xs text-primary hover:underline">Aç</Link>
                    </li>
                  ))}
                </ul>
              ) : <EmptyState title="İlişkili doğrulanmış olay yok" />}
              <p className="mt-2 text-xs text-muted-foreground">Olaylar ilçe/koridor hassasiyetindedir; hücre ölçeğinde etiket olarak kullanılmadı.</p>
              {clim?.annualMax && <div className="mt-3"><div className="mb-1 text-xs font-semibold text-muted-foreground">Yıllık en yüksek günlük yağış (ERA5)</div><AnnualMaxChart data={clim.annualMax} /></div>}
            </Panel>
          </div>
          <div className="flex justify-end">
            <Link href="/pump-planning" className={buttonVariants()}>Müdahale planlamasına geç <ArrowRight className="size-4" /></Link>
          </div>
        </div>
      )}
    </>
  );
}
