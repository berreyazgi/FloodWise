"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MapPin, Save } from "lucide-react";
import { EmptyState, ErrorState, LoadingBlock, NativeSelect, Notice, PageHeader, Panel, ProvenanceBadge, Spinner, StatTile, StatusBadge, fmtDate } from "@/components/app/common";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useApp } from "@/components/app/providers";
import { api, postJson } from "@/lib/client/api";
import { useEvents, useMeta } from "@/lib/client/hooks";
import { CATEGORIES } from "@/lib/domain/reports-ai";
import { REPORT_STATUS_LABEL, type ReportStatus } from "@/lib/domain/types";

interface Report {
  id: string; district: string; neighborhood: string | null; lon: number | null; lat: number | null; reported_at: string; observed_at: string | null;
  category: string; description: string; has_photo: boolean; water_depth_cm: number | null; building_affected: number; road_affected: number;
  status: ReportStatus; verification_notes: string | null; provenance: string; display_name: string | null;
  ai_suggestions: { suggestedCategory: string; matchedKeywords: string[]; missing: string[]; possibleDuplicates: { id: string; distanceM: number | null; hoursApart: number | null; similarity: number }[]; note: string } | null;
}

function ReportRow({ r }: { r: Report }) {
  const qc = useQueryClient();
  const router = useRouter();
  const { setLocationId } = useApp();
  const [status, setStatus] = useState<ReportStatus>(r.status);
  const [notes, setNotes] = useState(r.verification_notes ?? "");
  const [open, setOpen] = useState(false);
  const save = useMutation({ mutationFn: () => postJson(`/api/reports/${r.id}`, { status, notes: notes || null }, "PATCH"), onSuccess: () => qc.invalidateQueries() });
  const study = useMutation({
    mutationFn: () => postJson<{ id: string }>("/api/locations", { name: `Bildirim ${r.id} çevresi`, district: r.district, lon: r.lon, lat: r.lat, notes: `Vatandaş bildirimi ${r.id} üzerine oluşturuldu.` }),
    onSuccess: (x) => { qc.invalidateQueries(); setLocationId(x.id); router.push("/risk-analysis"); },
  });
  return (
    <li className="rounded-lg border border-border p-3" data-testid="admin-report">
      <button className="flex w-full flex-wrap items-center gap-2 text-left" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        <span className="font-mono text-xs text-muted-foreground">{r.id}</span>
        <StatusBadge s={r.status} /><ProvenanceBadge p={r.provenance} />
        <span className="text-sm font-medium">{CATEGORIES[r.category as keyof typeof CATEGORIES] ?? r.category}</span>
        <span className="text-xs text-muted-foreground">{r.district} · {fmtDate(r.observed_at)}</span>
        {(r.ai_suggestions?.possibleDuplicates.length ?? 0) > 0 && <span className="rounded border border-warning/50 px-1.5 text-[11px] text-warning">olası tekrar</span>}
      </button>
      {open && (
        <div className="mt-3 grid gap-4 lg:grid-cols-2">
          <div className="space-y-2 text-sm">
            <p>{r.description}</p>
            <dl className="grid grid-cols-2 gap-y-1 text-xs">
              <dt className="text-muted-foreground">Mahalle</dt><dd>{r.neighborhood ?? "—"}</dd>
              <dt className="text-muted-foreground">Konum</dt><dd>{r.lat != null ? `${r.lat}, ${r.lon}` : "—"}</dd>
              <dt className="text-muted-foreground">Su derinliği</dt><dd>{r.water_depth_cm != null ? `${r.water_depth_cm} cm` : "—"}</dd>
              <dt className="text-muted-foreground">Bina / yol</dt><dd>{r.building_affected ? "Bina etkilendi" : "—"} / {r.road_affected ? "Yol etkilendi" : "—"}</dd>
              <dt className="text-muted-foreground">Bildiren</dt><dd>{r.display_name ?? "Anonim"}</dd>
              <dt className="text-muted-foreground">Alınma</dt><dd>{fmtDate(r.reported_at)}</dd>
            </dl>
            {r.has_photo && <img src={`/api/reports/${r.id}/photo`} alt={`Bildirim ${r.id} fotoğrafı`} className="max-h-56 rounded-lg border border-border" />}
            {r.ai_suggestions && (
              <div className="rounded-lg border border-primary/30 bg-primary/5 p-2 text-xs">
                <div className="font-semibold text-primary">Otomatik öneriler</div>
                <div>Önerilen kategori: {CATEGORIES[r.ai_suggestions.suggestedCategory as keyof typeof CATEGORIES]} {r.ai_suggestions.matchedKeywords.length ? `(anahtar: ${r.ai_suggestions.matchedKeywords.join(", ")})` : ""}</div>
                {r.ai_suggestions.missing.length > 0 && <div>Eksik bilgi: {r.ai_suggestions.missing.join(", ")}</div>}
                {r.ai_suggestions.possibleDuplicates.map((d) => <div key={d.id}>Olası tekrar: {d.id} ({d.distanceM ?? "?"} m, {d.hoursApart ?? "?"} sa, benzerlik {d.similarity})</div>)}
                <div className="mt-1 text-muted-foreground">{r.ai_suggestions.note}</div>
              </div>
            )}
          </div>
          <div className="space-y-2">
            <label className="block text-sm">Durum
              <NativeSelect className="mt-1" value={status} onChange={(e) => setStatus(e.target.value as ReportStatus)} data-testid="status-select">
                {(Object.keys(REPORT_STATUS_LABEL) as ReportStatus[]).map((s) => <option key={s} value={s}>{REPORT_STATUS_LABEL[s]}</option>)}
              </NativeSelect>
            </label>
            <label className="block text-sm">Doğrulama notu<Textarea className="mt-1" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} /></label>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" onClick={() => save.mutate()} disabled={save.isPending} data-testid="save-status">{save.isPending ? <Spinner /> : <Save className="size-4" />} Kaydet</Button>
              {r.lon != null && <Button size="sm" variant="secondary" onClick={() => study.mutate()} disabled={study.isPending}><MapPin className="size-4" /> Çalışma noktası oluştur</Button>}
            </div>
            {save.isSuccess && <p className="text-xs text-success" role="status">Durum kaydedildi.</p>}
            {(save.isError || study.isError) && <ErrorState error={save.error ?? study.error} />}
            <p className="text-[11px] text-muted-foreground">“Doğrulandı” durumu yalnızca operatör kararıdır; otomatik öneriler olayı doğrulamaz ve bildirimler eğitim etiketi olarak kullanılmaz.</p>
          </div>
        </div>
      )}
    </li>
  );
}

export default function AdminPage() {
  const { role } = useApp();
  const meta = useMeta();
  const events = useEvents();
  const [filter, setFilter] = useState<"all" | ReportStatus>("all");
  const reports = useQuery({ queryKey: ["reports", role], queryFn: () => api<Report[]>("/api/reports"), enabled: role === "operator" });
  const analyses = useQuery({ queryKey: ["analyses"], queryFn: () => api<{ id: string; location_name: string; risk_index: number; created_at: string; model_version: string }[]>("/api/risk/all"), enabled: role === "operator" });

  if (role !== "operator") {
    return (<><PageHeader title="Belediye Yönetim Paneli" /><EmptyState title="Bu panel belediye operatörleri içindir">Sağ üstten “Belediye operatörü (demo)” rolüne geçin. Demo rol değiştirme gerçek kimlik doğrulaması değildir.</EmptyState></>);
  }
  const m = meta.data;
  const list = (reports.data ?? []).filter((r) => filter === "all" || r.status === filter);

  return (
    <>
      <PageHeader title="Belediye Yönetim Paneli" subtitle="Demo operatör görünümü. Belediye yetkisi veya resmi onay içermez." />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
        <StatTile label="Geçmiş olay" value={m?.historicalEvents ?? "…"} />
        <StatTile label="Vatandaş bildirimi" value={m?.citizenReports ?? "…"} />
        <StatTile label="Bekleyen" value={m?.pendingReports ?? "…"} tone="warning" />
        <StatTile label="Doğrulanmış olay" value={m?.verifiedEvents ?? "…"} tone="success" />
        <StatTile label="İnceleme gereken konum" value={m?.investigationCandidates ?? "…"} />
        <StatTile label="Senaryo analizi" value={m?.scenarios ?? "…"} />
        <StatTile label="Veri tazeliği" value={m ? fmtDate(m.snapshots.map((s) => s.fetched_at).filter(Boolean).sort().at(-1) ?? null).split(" ")[0] : "…"} hint="son anlık görüntü" />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[1fr_22rem]">
        <Panel title="Bildirim inceleme kuyruğu" actions={
          <NativeSelect className="h-8 w-40" value={filter} onChange={(e) => setFilter(e.target.value as typeof filter)} aria-label="Duruma göre filtrele">
            <option value="all">Tümü</option>
            {(Object.keys(REPORT_STATUS_LABEL) as ReportStatus[]).map((s) => <option key={s} value={s}>{REPORT_STATUS_LABEL[s]}</option>)}
          </NativeSelect>
        }>
          {reports.isLoading ? <LoadingBlock /> : reports.isError ? <ErrorState error={reports.error} /> : list.length === 0 ? <EmptyState title="Bu filtrede bildirim yok" /> : (
            <ul className="space-y-2">{list.map((r) => <ReportRow key={r.id} r={r} />)}</ul>
          )}
        </Panel>
        <div className="space-y-4">
          <Panel title="Risk analizi sonuçları">
            {analyses.isLoading ? <LoadingBlock /> : (
              <ul className="space-y-1 text-sm">
                {analyses.data?.slice(0, 8).map((a) => <li key={a.id} className="flex justify-between gap-2"><span className="truncate">{a.location_name}</span><span className="tabular-nums text-muted-foreground">{a.risk_index}</span></li>)}
              </ul>
            )}
            <Link href="/risk-analysis" className="mt-2 inline-block text-sm text-primary hover:underline">Analiz ekranı →</Link>
          </Panel>
          <Panel title="Olay yönetimi">
            <ul className="space-y-1 text-sm">{events.data?.map((e) => <li key={e.id}><Link className="hover:underline" href={`/historical-events?id=${e.id}`}>{e.event_date} — {e.title}</Link></li>)}</ul>
            <p className="mt-2 text-xs text-muted-foreground">Doğrulanmış olaylar kaynaklarıyla birlikte <code>src/data/seed.ts</code> içinde küratörlü tutulur; kaynaksız olay eklenemez.</p>
          </Panel>
          <Panel title="Kaynak veri yönetimi">
            <ul className="space-y-1 text-xs">{m?.snapshots.map((s) => <li key={s.key} className="flex justify-between gap-2"><span>{s.source}</span><span className={s.available ? "text-success" : "text-warning"}>{s.available ? fmtDate(s.fetched_at) : "yok"}</span></li>)}</ul>
            <Notice className="mt-2">Yenilemek için sunucuda <code>node scripts/ingest.mjs</code> çalıştırın ve veritabanını yeniden oluşturun (README).</Notice>
          </Panel>
        </div>
      </div>
    </>
  );
}
