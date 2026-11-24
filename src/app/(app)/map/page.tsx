"use client";

import { Suspense, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Layers, Maximize2, Search, X, MapPin } from "lucide-react";
import { FloodMap, type LayerKey, type MapFilters, type Selected } from "@/components/map/flood-map";
import { BandBadge, BUILDING_SCALE_MSG, NativeSelect, Notice, ProvenanceBadge, Spinner, StatusBadge, fmtDate } from "@/components/app/common";
import { useApp } from "@/components/app/providers";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api, postJson } from "@/lib/client/api";
import { useMeta } from "@/lib/client/hooks";
import { FACTOR_META, MISSING_INPUTS, stabilityLabel } from "@/lib/domain/risk";
import { CATEGORIES } from "@/lib/domain/reports-ai";
import type { ReportStatus } from "@/lib/domain/types";

const LAYERS: { key: LayerKey; label: string; disabled?: string; source?: string }[] = [
  { key: "events", label: "Geçmiş taşkın gözlemleri (çalışma alanı)", source: "Doğrulanmış olaylar; ilçe/koridor hassasiyeti" },
  { key: "rain", label: "Yağış ızgara noktaları (ERA5)", source: "Open-Meteo ERA5 — istasyon değil" },
  { key: "elevation", label: "Arazi kotu", source: "Copernicus GLO-90 (90 m) + gölgelendirme" },
  { key: "slope", label: "Arazi eğimi", source: "GLO-90 örnekleme ızgarasından türetildi" },
  { key: "accumulation", label: "Su birikimi göstergesi (tarama indeksi)", source: "screening-index-v1 — olasılık değil" },
  { key: "waterways", label: "Dereler / kanallar", source: "OpenStreetMap (ODbL)" },
  { key: "buildings", label: "Binalar", source: "OpenStreetMap / CARTO altlığı (yakınlaştırın)" },
  { key: "roads", label: "Yollar ve alt geçitler", source: "OpenStreetMap / CARTO altlığı" },
  { key: "reports", label: "Vatandaş bildirimleri", source: "Vatandaş: yalnızca doğrulanmış; operatör: tümü" },
  { key: "candidates", label: "Mühendislik inceleme adayları", source: "İndeks ≥ 60, ilk-10 hücre" },
  { key: "drainage", label: "Drenaj altyapısı", disabled: "Açık ve lisanslı İSKİ şebeke verisi yok — katman eklenmedi." },
  { key: "pumps", label: "Mevcut pompa istasyonları", disabled: "Doğrulanabilir kurulum verisi yok — katman eklenmedi." },
];

const LEGENDS: Partial<Record<LayerKey, { title: string; stops: [string, string][] }>> = {
  accumulation: { title: "Tarama indeksi (0–100)", stops: [["#0e3a5a", "0 düşük"], ["#F59E0B", "40 izlenmeli"], ["#f97316", "60 öncelikli"], ["#EF4444", "80+"]] },
  elevation: { title: "Kot (m)", stops: [["#1d4ed8", "0"], ["#0ea5e9", "50"], ["#22c55e", "100"], ["#eab308", "150"], ["#f8fafc", "220+"]] },
  slope: { title: "Eğim (°)", stops: [["#082f49", "0"], ["#0891b2", "2"], ["#facc15", "5"], ["#f97316", "10+"]] },
};

function DetailPanel({ sel, onClose }: { sel: Selected; onClose: () => void }) {
  const { role, setLocationId } = useApp();
  const router = useRouter();
  const qc = useQueryClient();
  const p = sel.props as Record<string, number & string>;
  const create = useMutation({
    mutationFn: () => postJson<{ id: string }>("/api/locations", { name: `İnceleme noktası ${sel.lngLat[1].toFixed(4)}, ${sel.lngLat[0].toFixed(4)}`, district: p.district_id === "basaksehir" ? "Başakşehir" : "Küçükçekmece", lon: Number(p.lon ?? sel.lngLat[0]), lat: Number(p.lat ?? sel.lngLat[1]), notes: "Haritadan oluşturuldu (tarama hücresi)." }),
    onSuccess: (r) => { qc.invalidateQueries(); setLocationId(r.id); router.push("/risk-analysis"); },
  });

  return (
    <aside className="absolute inset-x-2 bottom-2 z-20 max-h-[60%] overflow-y-auto rounded-xl border border-border bg-popover/95 p-4 shadow-xl backdrop-blur md:inset-x-auto md:right-3 md:top-3 md:bottom-3 md:max-h-none md:w-96" data-testid="detail-panel" aria-label="Konum ayrıntıları">
      <div className="mb-2 flex items-start justify-between gap-2">
        <div>
          <div className="text-xs text-muted-foreground">Konum: {sel.lngLat[1].toFixed(5)}, {sel.lngLat[0].toFixed(5)}</div>
          <h2 className="font-semibold">
            {sel.kind === "cell" && "Tarama ızgarası hücresi (~500 m)"}
            {sel.kind === "candidate" && "Mühendislik inceleme adayı"}
            {sel.kind === "event" && String(p.title)}
            {sel.kind === "rain" && "ERA5 yağış ızgara noktası"}
            {sel.kind === "report" && "Vatandaş bildirimi"}
          </h2>
        </div>
        <button onClick={onClose} aria-label="Paneli kapat" className="rounded p-1 hover:bg-accent"><X className="size-4" /></button>
      </div>

      {(sel.kind === "cell") && (
        <div className="space-y-3 text-sm">
          <div className="flex items-center gap-2"><span className="text-2xl font-semibold tabular-nums">{p.index}</span><span className="text-muted-foreground">/ 100</span><BandBadge index={Number(p.index)} /></div>
          <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
            <dt className="text-muted-foreground">Kot</dt><dd>{p.elev} m</dd>
            <dt className="text-muted-foreground">Komşulara göre (TPI)</dt><dd>{p.tpi} m</dd>
            <dt className="text-muted-foreground">Eğim</dt><dd>{p.slope}°</dd>
            <dt className="text-muted-foreground">En yakın OSM dere</dt><dd>{Number(p.water) >= 0 ? `~${p.water} m` : "—"}</dd>
            <dt className="text-muted-foreground">Ağırlık kararlılığı</dt><dd>%{Math.round(Number(p.stability) * 100)} ({stabilityLabel(Number(p.stability))})</dd>
          </dl>
          <div>
            <div className="mb-1 text-xs font-semibold text-muted-foreground">Faktör puanları (0–1)</div>
            {(Object.keys(FACTOR_META) as (keyof typeof FACTOR_META)[]).map((k) => (
              <div key={k} className="flex items-center gap-2 text-xs">
                <span className="w-40 shrink-0">{FACTOR_META[k].label}</span>
                <div className="h-1.5 flex-1 rounded bg-secondary"><div className="h-1.5 rounded bg-cyan" style={{ width: `${Number(p[`f_${k}`]) * 100}%` }} /></div>
                <span className="w-9 text-right tabular-nums">{Number(p[`f_${k}`]).toFixed(2)}</span>
              </div>
            ))}
          </div>
          <div className="text-xs text-muted-foreground">Kaynak: Copernicus GLO-90 (90 m), OSM dereleri. Geçmiş olay kanıtı yalnızca ilçe/koridor düzeyinde.</div>
          <Notice tone="warning">{BUILDING_SCALE_MSG}</Notice>
          <div className="text-xs"><span className="font-semibold">Başlıca eksik veriler:</span> {MISSING_INPUTS.slice(0, 3).join("; ")}.</div>
          <div className="text-xs"><span className="font-semibold">Önerilen sonraki inceleme:</span> saha keşfi (ızgara/mazgal, alt geçit, bodrum girişleri) ve İSKİ şebeke kapasitesinin talep edilmesi.</div>
          {role === "operator" ? (
            <Button size="sm" onClick={() => create.mutate()} disabled={create.isPending} data-testid="create-study-point">
              {create.isPending ? <Spinner /> : <MapPin className="size-4" />} Çalışma noktası oluştur ve analiz et
            </Button>
          ) : <div className="text-xs text-muted-foreground">Çalışma noktası oluşturmak için operatör (demo) rolüne geçin.</div>}
          {create.isError && <Notice tone="critical">{(create.error as Error).message}</Notice>}
        </div>
      )}

      {sel.kind === "candidate" && (
        <div className="space-y-2 text-sm">
          <div className="flex items-center gap-2"><span className="text-2xl font-semibold">{p.index}</span><BandBadge index={Number(p.index)} /></div>
          <p>{String(p.explanation)}</p>
          <div className="text-xs text-muted-foreground">Analiz alanı: {String(p.location_name)}</div>
          <Notice tone="warning">{BUILDING_SCALE_MSG}</Notice>
          <Link href="/risk-analysis" className="text-sm text-primary hover:underline">Analizi aç →</Link>
        </div>
      )}

      {sel.kind === "event" && (
        <div className="space-y-2 text-sm">
          <div className="flex flex-wrap items-center gap-2 text-xs"><span>{fmtDate(String(p.date))}</span><ProvenanceBadge p={String(p.provenance)} /></div>
          <div>{String(p.classification)}</div>
          <Notice>Alan sınırı olayın gerçek taşkın kapsamı değildir; {p.precision === "district" ? "ilçe düzeyinde" : "dere koridoru çevresinde yaklaşık"} çalışma alanıdır.</Notice>
          <Link href={`/historical-events?id=${p.id}`} className="text-primary hover:underline">Olay ayrıntıları, kaynaklar ve yağış grafiği →</Link>
        </div>
      )}

      {sel.kind === "rain" && (
        <div className="space-y-2 text-sm">
          <dl className="grid grid-cols-2 gap-y-1 text-xs">
            <dt className="text-muted-foreground">6–11 Eyl 2009 toplam</dt><dd>{p.total_2009 ?? "—"} mm</dd>
            <dt className="text-muted-foreground">3–8 Eyl 2023 toplam</dt><dd>{p.total_2023 ?? "—"} mm</dd>
          </dl>
          <Notice tone="warning">ERA5 yeniden analizi ~9–25 km ızgaralıdır ve sokak ölçeğinde yağmur ölçer değildir. Eylül 2023&apos;te basında ~125 kg/m² aktarılırken bu ızgara yalnızca birkaç mm gösterir — yerel konvektif sağanakları yakalayamaz.</Notice>
        </div>
      )}

      {sel.kind === "report" && (
        <div className="space-y-2 text-sm">
          <div className="flex flex-wrap gap-2"><StatusBadge s={p.status as unknown as ReportStatus} /><ProvenanceBadge p={String(p.provenance)} /></div>
          <div>{CATEGORIES[p.category as unknown as keyof typeof CATEGORIES] ?? String(p.category)}</div>
          <div className="text-xs text-muted-foreground">{String(p.district)} · {fmtDate(String(p.observed_at))}</div>
          <Notice>Doğrulanmamış vatandaş bildirimleri model eğitim etiketi olarak kullanılmaz.</Notice>
        </div>
      )}
    </aside>
  );
}

function MapPageInner() {
  const params = useSearchParams();
  const { role } = useApp();
  const meta = useMeta();
  const [visible, setVisible] = useState<Partial<Record<LayerKey, boolean>>>({ events: true, accumulation: true, waterways: true, candidates: true, roads: true, reports: true, districts: true });
  const [filters, setFilters] = useState<MapFilters>({ eventFrom: "", eventTo: "", eventPrecision: "all", rainMin: 0, rainMax: 500, metric: "index" });
  const [sel, setSel] = useState<Selected | null>(null);
  const [panelOpen, setPanelOpen] = useState(true);
  const [q, setQ] = useState(params.get("q") ?? "");
  const [term, setTerm] = useState(params.get("q") ?? "");
  const [showResults, setShowResults] = useState(true);
  const geo = useQuery({ queryKey: ["geocode", term], queryFn: () => api<{ name: string; source: string; center: [number, number] }[]>(`/api/geocode?q=${encodeURIComponent(term)}`), enabled: term.trim().length >= 2 });
  const results = showResults && term.trim().length >= 2 ? (geo.isError ? [] : geo.data ?? null) : null;
  const searching = geo.isFetching;
  const [flyTo, setFlyTo] = useState<{ center: [number, number]; zoom?: number } | null>(null);
  const elev = meta.data?.snapshots.find((s) => s.key === "elevation");

  const search = (text: string) => { setTerm(text.trim()); setShowResults(true); };

  const reportsUrl = useMemo(() => (role === "operator" ? "/api/reports" : "/api/geo/citizen-reports"), [role]);
  const legends = (Object.keys(LEGENDS) as LayerKey[]).filter((k) => visible[k]);

  return (
    <div id="map-root" className="relative -m-3 h-[calc(100vh-7.5rem)] overflow-hidden bg-background sm:-m-5 lg:h-[calc(100vh-6.5rem)]">
      <FloodMap visible={visible} filters={filters} onSelect={setSel} reportsUrl={reportsUrl} flyTo={flyTo} />

      <div className="absolute left-2 top-2 z-20 flex gap-2">
        <Button size="sm" variant="secondary" onClick={() => setPanelOpen((v) => !v)} aria-expanded={panelOpen} aria-controls="layer-panel"><Layers className="size-4" /> Katmanlar</Button>
        <Button size="sm" variant="secondary" aria-label="Tam ekran" onClick={() => { const el = document.getElementById("map-root"); if (document.fullscreenElement) void document.exitFullscreen(); else void el?.requestFullscreen?.(); }}><Maximize2 className="size-4" /></Button>
      </div>

      {panelOpen && (
        <div id="layer-panel" className="absolute left-2 top-12 z-20 max-h-[calc(100%-4rem)] w-[min(20rem,calc(100%-1rem))] space-y-4 overflow-y-auto rounded-xl border border-border bg-popover/95 p-3 text-sm shadow-xl backdrop-blur">
          <form className="flex gap-1.5" onSubmit={(e) => { e.preventDefault(); search(q); }}>
            <Input aria-label="Haritada konum ara" placeholder="Konum ara…" value={q} onChange={(e) => setQ(e.target.value)} className="h-8" />
            <Button size="sm" type="submit" aria-label="Ara">{searching ? <Spinner /> : <Search className="size-4" />}</Button>
          </form>
          {results && (
            <ul className="space-y-1 text-xs" aria-label="Arama sonuçları">
              {results.length === 0 && <li className="text-muted-foreground">Sonuç bulunamadı.</li>}
              {results.slice(0, 6).map((r, i) => (
                <li key={i}><button className="w-full rounded px-1.5 py-1 text-left hover:bg-accent" onClick={() => { setFlyTo({ center: r.center, zoom: 14 }); setShowResults(false); }}>{r.name}<span className="block text-[10px] text-muted-foreground">{r.source}</span></button></li>
              ))}
            </ul>
          )}

          <fieldset>
            <legend className="mb-1.5 text-xs font-semibold uppercase text-muted-foreground">Katmanlar</legend>
            <ul className="space-y-1.5">
              {LAYERS.map((l) => (
                <li key={l.key} className="flex items-start gap-2">
                  <Switch id={`layer-${l.key}`} checked={!!visible[l.key]} disabled={!!l.disabled} onCheckedChange={(v: boolean) => setVisible((s) => ({ ...s, [l.key]: v }))} aria-label={l.label} />
                  <label htmlFor={`layer-${l.key}`} className={l.disabled ? "text-muted-foreground" : ""}>
                    {l.label}
                    <span className="block text-[10px] text-muted-foreground">{l.disabled ?? l.source}</span>
                  </label>
                </li>
              ))}
            </ul>
          </fieldset>

          <fieldset className="space-y-2">
            <legend className="mb-1 text-xs font-semibold uppercase text-muted-foreground">Filtreler</legend>
            <label className="block text-xs">Olay tarihi (başlangıç – bitiş)
              <div className="mt-1 flex gap-1.5">
                <Input type="date" className="h-8" value={filters.eventFrom} onChange={(e) => setFilters({ ...filters, eventFrom: e.target.value })} aria-label="Olay başlangıç tarihi" />
                <Input type="date" className="h-8" value={filters.eventTo} onChange={(e) => setFilters({ ...filters, eventTo: e.target.value })} aria-label="Olay bitiş tarihi" />
              </div>
            </label>
            <label className="block text-xs">Olay konum hassasiyeti
              <NativeSelect className="mt-1 h-8" value={filters.eventPrecision} onChange={(e) => setFilters({ ...filters, eventPrecision: e.target.value as MapFilters["eventPrecision"] })}>
                <option value="all">Tümü</option><option value="corridor_approx">Dere koridoru (yaklaşık)</option><option value="district">İlçe düzeyi</option>
              </NativeSelect>
            </label>
            <label className="block text-xs">Yağış aralığı (ERA5 olay toplamı, mm)
              <div className="mt-1 flex gap-1.5">
                <Input type="number" min={0} className="h-8" value={filters.rainMin} onChange={(e) => setFilters({ ...filters, rainMin: Number(e.target.value) })} aria-label="En az yağış" />
                <Input type="number" min={0} className="h-8" value={filters.rainMax} onChange={(e) => setFilters({ ...filters, rainMax: Number(e.target.value) })} aria-label="En çok yağış" />
              </div>
            </label>
            <label className="block text-xs">Risk yöntemi (birikim katmanı rengi)
              <NativeSelect className="mt-1 h-8" value={filters.metric} onChange={(e) => setFilters({ ...filters, metric: e.target.value as MapFilters["metric"] })} data-testid="metric-select">
                <option value="index">Bileşik tarama indeksi</option>
                {(Object.keys(FACTOR_META) as (keyof typeof FACTOR_META)[]).map((k) => <option key={k} value={`f_${k}`}>Yalnız: {FACTOR_META[k].label}</option>)}
              </NativeSelect>
            </label>
          </fieldset>

          <div className="space-y-1 text-[11px] text-muted-foreground">
            <div className="font-semibold uppercase">Veri kaynağı ve belirsizlik</div>
            <div>Kot çözünürlüğü: <b className="text-foreground">90 m</b> (Copernicus GLO-90), örnekleme ~550 m. Alınma: {fmtDate(elev?.fetched_at)}.</div>
            <div>Bu çözünürlük ızgara/mazgal konumlarını veya bodrum su derinliğini belirleyemez.</div>
          </div>
        </div>
      )}

      {legends.length > 0 && (
        <div className="absolute bottom-8 left-2 z-10 hidden space-y-2 rounded-lg border border-border bg-popover/90 p-2 text-[11px] sm:block" aria-label="Lejant">
          {legends.map((k) => (
            <div key={k}>
              <div className="font-semibold">{LEGENDS[k]!.title}</div>
              <div className="mt-1 flex gap-1">{LEGENDS[k]!.stops.map(([c, t]) => <div key={t} className="text-center"><div className="h-2.5 w-12 rounded-sm" style={{ background: c }} /><div className="text-muted-foreground">{t}</div></div>)}</div>
            </div>
          ))}
          <div className="flex flex-wrap gap-x-3 gap-y-1">
            {visible.events && <span><span className="mr-1 inline-block h-2 w-3 border-2 border-warning align-middle" />Olay çalışma alanı</span>}
            {visible.candidates && <span><span className="mr-1 inline-block size-2.5 rounded-full bg-critical align-middle" />▲ İnceleme adayı</span>}
            {visible.waterways && <span><span className="mr-1 inline-block h-0.5 w-3 bg-cyan align-middle" />Dere</span>}
            {visible.reports && <span><span className="mr-1 inline-block size-2.5 rounded-full bg-cyan align-middle" />Bildirim (yeşil: doğrulanmış)</span>}
          </div>
        </div>
      )}

      {sel && <DetailPanel sel={sel} onClose={() => setSel(null)} />}
    </div>
  );
}

export default function MapPage() {
  return <Suspense><MapPageInner /></Suspense>;
}
