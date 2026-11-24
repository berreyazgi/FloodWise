"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { useApp } from "@/components/app/providers";
import { BandBadge, EmptyState, ErrorState, LoadingBlock, Notice, PageHeader, Panel, ProvenanceBadge, StatTile, fmtDate } from "@/components/app/common";
import { AnnualMaxChart } from "@/components/app/charts";
import { useEvents, useLocation, useMeta } from "@/lib/client/hooks";
import { buttonVariants } from "@/components/ui/button";

export default function DashboardPage() {
  const { locationId } = useApp();
  const meta = useMeta();
  const loc = useLocation(locationId);
  const events = useEvents();
  const m = meta.data;
  const clim = loc.data?.climatology.find((c) => c.annualMax?.length);

  return (
    <>
      <PageHeader
        title="İstanbul Taşkın Analizi — Genel Bakış"
        subtitle="Tüm sayılar uygulamadaki kayıtlardan hesaplanır. Sentetik demo kayıtları ayrıca belirtilir."
        actions={<Link href="/map" className={buttonVariants()}>Haritayı aç <ArrowRight className="size-4" /></Link>}
      />
      {meta.isError && <ErrorState error={meta.error} />}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
        <StatTile label="Geçmiş olay kaydı" value={m?.historicalEvents ?? "…"} hint={m ? `${m.verifiedEvents} doğrulanmış` : undefined} />
        <StatTile label="Vatandaş bildirimi" value={m?.citizenReports ?? "…"} hint={m ? `${m.demoReports} sentetik demo` : undefined} />
        <StatTile label="Bekleyen inceleme" value={m?.pendingReports ?? "…"} tone="warning" />
        <StatTile label="Doğrulanan bildirim" value={m?.verifiedReports ?? "…"} tone="success" />
        <StatTile label="İnceleme adayı hücre" value={m?.investigationCandidates ?? "…"} hint="indeks ≥ 60, ilk-10" />
        <StatTile label="Senaryo analizi" value={m?.scenarios ?? "…"} />
        <StatTile label="Çalışma alanı" value={m?.studyLocations ?? "…"} />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <Panel title={`Yıllık en yüksek günlük yağış — ${loc.data?.name ?? ""}`} className="xl:col-span-2">
          {loc.isLoading ? <LoadingBlock /> : clim?.annualMax ? (
            <>
              <AnnualMaxChart data={clim.annualMax} />
              <p className="mt-2 text-xs text-muted-foreground">
                Kaynak: {clim.source} — ızgara noktası {clim.grid?.lat.toFixed(2)}, {clim.grid?.lon.toFixed(2)}. Yeniden analiz verisi istasyon ölçümü değildir; yerel konvektif sağanakları düşük gösterebilir.
              </p>
            </>
          ) : <EmptyState title="Bu alan için yağış klimatolojisi yok">Nokta tipi çalışma alanlarında ilçe ızgarası kullanılır.</EmptyState>}
        </Panel>

        <Panel title="Doğrulanmış geçmiş olaylar">
          {events.isLoading ? <LoadingBlock /> : events.data?.length ? (
            <ul className="space-y-3">
              {events.data.map((e) => (
                <li key={e.id} className="rounded-lg border border-border p-3">
                  <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground"><span>{fmtDate(e.event_date)}</span><ProvenanceBadge p={e.verified_status} /></div>
                  <div className="mt-1 font-medium">{e.title}</div>
                  <div className="text-xs text-muted-foreground">{e.district}</div>
                </li>
              ))}
            </ul>
          ) : <EmptyState title="Olay kaydı yok" />}
          <Link href="/historical-events" className="mt-3 inline-flex items-center gap-1 text-sm text-primary hover:underline">Tüm olaylar <ArrowRight className="size-3" /></Link>
        </Panel>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <Panel title="Öncelikli inceleme adayları (seçili alan)" className="xl:col-span-2">
          {loc.isLoading ? <LoadingBlock /> : loc.data?.analysis ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs text-muted-foreground"><tr><th className="py-1.5">Hücre</th><th>İndeks</th><th>Bant</th><th>Kararlılık</th><th className="hidden md:table-cell">Kot / eğim</th></tr></thead>
                <tbody>
                  {loc.data.analysis.explanation.candidates.slice(0, 6).map((c) => (
                    <tr key={c.id} className="border-t border-border">
                      <td className="py-1.5 font-mono text-xs">{c.lat.toFixed(4)}, {c.lon.toFixed(4)}</td>
                      <td className="tabular-nums">{c.index}</td>
                      <td><BandBadge index={c.index} /></td>
                      <td>%{Math.round(c.stability * 100)}</td>
                      <td className="hidden text-xs text-muted-foreground md:table-cell">{c.elev} m / {c.slopeDeg}°</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <Notice className="mt-3">Tarama indeksi bir taşkın olasılığı değildir; saha incelemesi önceliği önerir. <Link className="underline" href="/risk-analysis">Analizin ayrıntıları</Link></Notice>
            </div>
          ) : <EmptyState title="Bu alan için analiz yok">Risk Analizi sayfasından çalıştırabilirsiniz.</EmptyState>}
        </Panel>
        <Panel title="Veri tazeliği">
          <ul className="space-y-2 text-sm">
            {m?.snapshots.map((s) => (
              <li key={s.key} className="flex items-start justify-between gap-2 border-b border-border pb-2 last:border-0">
                <div><div className="font-medium">{s.source ?? s.key}</div><div className="text-xs text-muted-foreground">{s.license}</div></div>
                <div className={s.available ? "text-xs text-success" : "text-xs text-warning"}>{s.available ? fmtDate(s.fetched_at) : "yok"}</div>
              </li>
            )) ?? <LoadingBlock />}
          </ul>
          <p className="mt-2 text-xs text-muted-foreground">Canlı sensör veya gerçek zamanlı yağış entegrasyonu yoktur.</p>
        </Panel>
      </div>
    </>
  );
}
