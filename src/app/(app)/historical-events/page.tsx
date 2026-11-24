"use client";

import { Suspense, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ExternalLink, MapPin } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmptyState, ErrorState, LoadingBlock, NativeSelect, Notice, PageHeader, Panel, ProvenanceBadge, fmtDate } from "@/components/app/common";
import { HourlyRainChart } from "@/components/app/charts";
import { useEvents } from "@/lib/client/hooks";
import { api } from "@/lib/client/api";
import type { HistoricalEvent } from "@/lib/domain/types";
import type { RainSummary } from "@/lib/domain/rainfall";
import { Input } from "@/components/ui/input";

const PRECISION: Record<string, string> = { district: "İlçe düzeyi", corridor_approx: "Dere koridoru (yaklaşık alan)", point: "Nokta" };
const DISTRICT_NAME: Record<string, string> = { basaksehir: "Başakşehir", kucukcekmece: "Küçükçekmece" };

interface EventDetail extends HistoricalEvent {
  rainfall: { available: false; reason: string } | { available: true; source: string; license: string; fetched_at: string; timezone: string; series: { district_id: string; grid: { lat: number; lon: number }; summary: RainSummary; points: { t: string; mm: number | null }[] }[] };
}

function EventDialog({ id, onClose }: { id: string; onClose: () => void }) {
  const q = useQuery({ queryKey: ["event", id], queryFn: () => api<EventDetail>(`/api/events/${id}`) });
  const e = q.data;
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{e?.title ?? "Olay"}</DialogTitle>
          <DialogDescription>{e ? `${fmtDate(e.event_date)} · ${e.district}` : "Yükleniyor…"}</DialogDescription>
        </DialogHeader>
        {q.isLoading && <LoadingBlock />}
        {q.isError && <ErrorState error={q.error} />}
        {e && (
          <div className="space-y-4 text-sm">
            <div className="flex flex-wrap gap-2"><ProvenanceBadge p={e.verified_status} /><span className="rounded-md border border-border px-1.5 py-0.5 text-[11px]">{e.classification}</span><span className="rounded-md border border-border px-1.5 py-0.5 text-[11px]">Hassasiyet: {PRECISION[e.geographic_precision]}</span></div>
            <dl className="grid gap-x-4 gap-y-2 sm:grid-cols-[10rem_1fr]">
              <dt className="text-muted-foreground">Olay kimliği</dt><dd className="font-mono text-xs">{e.id}</dd>
              <dt className="text-muted-foreground">Zaman</dt><dd>{e.time_note ?? "—"}</dd>
              <dt className="text-muted-foreground">Mahalle</dt><dd>{e.neighborhood ?? "Doğrulanmadı — üretilmedi"}</dd>
              <dt className="text-muted-foreground">Açıklama</dt><dd>{e.description}</dd>
              <dt className="text-muted-foreground">Bildirilen sonuçlar</dt><dd>{e.consequences}</dd>
              <dt className="text-muted-foreground">Yağış miktarı</dt><dd>{e.rainfall_mm != null ? `${e.rainfall_mm} mm` : "Doğrulanmış değer yok."} <span className="text-muted-foreground">{e.rainfall_note}</span></dd>
              <dt className="text-muted-foreground">Veri kalitesi</dt><dd>{e.data_quality}</dd>
              <dt className="text-muted-foreground">Kayıt tarihi</dt><dd>{e.ingested_at}</dd>
            </dl>
            <div>
              <h3 className="mb-1 font-semibold">Kaynaklar</h3>
              <ul className="space-y-1">{e.sources.map((s) => <li key={s.url}><a href={s.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">{s.publisher}: {s.title}<ExternalLink className="size-3" /></a></li>)}</ul>
            </div>
            <div>
              <h3 className="mb-1 font-semibold">Olay çevresindeki saatlik yağış (ERA5 yeniden analizi)</h3>
              {e.rainfall.available ? (
                <>
                  <HourlyRainChart series={e.rainfall.series.map((s) => ({ name: DISTRICT_NAME[s.district_id] ?? s.district_id, points: s.points }))} />
                  <div className="mt-2 grid gap-2 sm:grid-cols-2">
                    {e.rainfall.series.map((s) => (
                      <div key={s.district_id} className="rounded-lg border border-border p-2 text-xs">
                        <div className="font-medium">{DISTRICT_NAME[s.district_id]} — ızgara {s.grid.lat.toFixed(2)}, {s.grid.lon.toFixed(2)}</div>
                        <div>Toplam {s.summary.total_mm} mm · en yüksek saatlik {s.summary.max_hourly_mm ?? "—"} mm · en yüksek 3 saatlik {s.summary.max_3h_mm ?? "—"} mm · eksik {s.summary.missing}/{s.summary.count}</div>
                      </div>
                    ))}
                  </div>
                  <Notice tone="warning" className="mt-2">Kaynak: {e.rainfall.source} ({e.rainfall.license}), saat dilimi {e.rainfall.timezone}. Izgara ortalaması doğrudan yağmur ölçer gözlemi değildir ve kısa süreli yerel sağanakları ciddi biçimde düşük gösterebilir.</Notice>
                </>
              ) : <EmptyState title="Yağış verisi yok">{e.rainfall.reason}</EmptyState>}
            </div>
            <Link href="/map" className="inline-flex items-center gap-1 text-primary hover:underline"><MapPin className="size-4" />Haritada çalışma alanını göster</Link>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function EventsInner() {
  const params = useSearchParams();
  const router = useRouter();
  const openId = params.get("id");
  const events = useEvents();
  const [district, setDistrict] = useState("all");
  const [precision, setPrecision] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const filtered = useMemo(() => (events.data ?? []).filter((e) =>
    (district === "all" || e.district_ids.includes(district)) && (precision === "all" || e.geographic_precision === precision) &&
    (!from || e.event_date >= from) && (!to || e.event_date <= to)), [events.data, district, precision, from, to]);
  const years = (events.data ?? []).map((e) => Number(e.event_date.slice(0, 4)));
  const [minY, maxY] = years.length ? [Math.min(...years) - 1, Math.max(...years) + 1] : [2000, 2030];

  return (
    <>
      <PageHeader title="Doğrulanmış Geçmiş Taşkın Olayları" subtitle="Yalnızca güvenilir kaynakla belgelenmiş olaylar listelenir. Kesin koordinatı olmayan olaylar nokta olarak değil, yaklaşık çalışma alanı olarak gösterilir." />
      <Panel title="Zaman çizelgesi">
        <div className="relative h-16" role="list" aria-label="Olay zaman çizelgesi">
          <div className="absolute inset-x-0 top-8 h-px bg-border" />
          {(events.data ?? []).map((e) => {
            const y = Number(e.event_date.slice(0, 4)) + Number(e.event_date.slice(5, 7)) / 12;
            const left = ((y - minY) / (maxY - minY)) * 100;
            return (
              <button key={e.id} role="listitem" onClick={() => router.push(`/historical-events?id=${e.id}`)} className="absolute top-2 -translate-x-1/2 text-center" style={{ left: `${left}%` }}>
                <span className="block text-xs font-medium">{e.event_date.slice(0, 7)}</span>
                <span className="mx-auto mt-1 block size-3 rounded-full border-2 border-warning bg-background" />
              </button>
            );
          })}
          <span className="absolute left-0 top-10 text-[10px] text-muted-foreground">{minY}</span>
          <span className="absolute right-0 top-10 text-[10px] text-muted-foreground">{maxY}</span>
        </div>
      </Panel>

      <div className="mt-4 grid gap-4 lg:grid-cols-[16rem_1fr]">
        <Panel title="Filtreler">
          <div className="space-y-3 text-sm">
            <label className="block">İlçe<NativeSelect className="mt-1" value={district} onChange={(e) => setDistrict(e.target.value)}><option value="all">Tümü</option><option value="basaksehir">Başakşehir</option><option value="kucukcekmece">Küçükçekmece</option></NativeSelect></label>
            <label className="block">Konum hassasiyeti<NativeSelect className="mt-1" value={precision} onChange={(e) => setPrecision(e.target.value)}><option value="all">Tümü</option><option value="district">İlçe düzeyi</option><option value="corridor_approx">Dere koridoru</option></NativeSelect></label>
            <label className="block">Başlangıç<Input type="date" className="mt-1" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
            <label className="block">Bitiş<Input type="date" className="mt-1" value={to} onChange={(e) => setTo(e.target.value)} /></label>
          </div>
        </Panel>
        <Panel title={`Olaylar (${filtered.length})`}>
          {events.isLoading ? <LoadingBlock /> : events.isError ? <ErrorState error={events.error} /> : filtered.length === 0 ? <EmptyState title="Filtreye uyan olay yok" /> : (
            <ul className="space-y-3">
              {filtered.map((e) => (
                <li key={e.id}>
                  <button onClick={() => router.push(`/historical-events?id=${e.id}`)} className="w-full rounded-lg border border-border p-4 text-left transition-colors hover:border-primary/50 hover:bg-accent/40" data-testid="event-card">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-xs text-muted-foreground">{fmtDate(e.event_date)} · {e.district}</span>
                      <span className="flex gap-1.5"><ProvenanceBadge p={e.verified_status} /><span className="rounded-md border border-border px-1.5 py-0.5 text-[11px]">{PRECISION[e.geographic_precision]}</span></span>
                    </div>
                    <div className="mt-1 font-semibold">{e.title}</div>
                    <p className="mt-1 text-sm text-muted-foreground">{e.description}</p>
                    <div className="mt-2 text-xs">Kaynak sayısı: {e.sources.length} · Veri kalitesi: {e.data_quality.split(".")[0]}.</div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
      {openId && <EventDialog id={openId} onClose={() => router.push("/historical-events")} />}
    </>
  );
}

export default function HistoricalEventsPage() {
  return <Suspense><EventsInner /></Suspense>;
}
