"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FilePlus2 } from "lucide-react";
import { EmptyState, ErrorState, LoadingBlock, LocationSelect, Notice, PageHeader, Panel, ProvenanceBadge, Spinner, fmtDate } from "@/components/app/common";
import { Button } from "@/components/ui/button";
import { useApp } from "@/components/app/providers";
import { api, postJson } from "@/lib/client/api";
import { useLocation } from "@/lib/client/hooks";

export default function ReportsPage() {
  const { role, locationId } = useApp();
  const router = useRouter();
  const qc = useQueryClient();
  const loc = useLocation(locationId);
  const list = useQuery({ queryKey: ["generated-reports", role], queryFn: () => api<{ id: string; location_name: string; report_type: string; created_at: string }[]>("/api/generated-reports"), enabled: role === "operator" });
  const [picked, setPicked] = useState<string[] | null>(null);
  const sims = (loc.data?.scenarios ?? []).filter((s) => s.kind === "simulation");
  const selected = picked ?? sims.map((s) => s.id);
  const gen = useMutation({
    mutationFn: () => postJson<{ id: string }>("/api/generated-reports", { locationId, scenarioIds: selected }),
    onSuccess: (r) => { qc.invalidateQueries(); router.push(`/reports/${r.id}`); },
  });

  if (role !== "operator") {
    return (
      <>
        <PageHeader title="Mühendislik ve Yönetim Raporları" />
        <EmptyState title="Bu bölüm belediye operatörleri içindir">Sağ üstteki demo rol seçiciden “Belediye operatörü (demo)” rolüne geçin. Bu bir kimlik doğrulama değildir.</EmptyState>
      </>
    );
  }

  return (
    <>
      <PageHeader title="Mühendislik ve Yönetim Raporları" subtitle="Ön karar destek raporu: doğrulanmış gözlemleri, model türevi göstergeleri, kullanıcı varsayımlarını ve örnek simülasyon sonuçlarını ayrı ayrı etiketler." />
      <div className="grid gap-4 xl:grid-cols-[24rem_1fr]">
        <Panel title="Yeni ön değerlendirme raporu">
          <div className="space-y-3 text-sm">
            <label className="block">Çalışma alanı<LocationSelect className="mt-1" id="report-location" /></label>
            <div>
              <div className="mb-1">Dahil edilecek simülasyon senaryoları</div>
              {loc.isLoading ? <LoadingBlock rows={2} /> : sims.length === 0 ? <p className="text-xs text-muted-foreground">Bu alanda kayıtlı senaryo yok; rapor senaryosuz oluşturulur.</p> : (
                <ul className="space-y-1">
                  {sims.map((s) => (
                    <li key={s.id}><label className="flex items-center gap-2">
                      <input type="checkbox" className="size-4 accent-[#38BDF8]" checked={selected.includes(s.id)} onChange={(e) => setPicked(e.target.checked ? [...selected, s.id] : selected.filter((x) => x !== s.id))} />
                      <span className="flex-1">{s.scenario_name}</span><ProvenanceBadge p={s.provenance} />
                    </label></li>
                  ))}
                </ul>
              )}
            </div>
            <Button onClick={() => gen.mutate()} disabled={gen.isPending} data-testid="generate-report">{gen.isPending ? <Spinner /> : <FilePlus2 className="size-4" />} Rapor oluştur</Button>
            {gen.isError && <ErrorState error={gen.error} />}
            <Notice>Rapor; çalışma alanı, veri kaynakları, geçmiş olaylar, coğrafi değerlendirme, model açıklaması, belirsizlikler, senaryo karşılaştırması, Wilo adayları, mühendislik kısıtları, öneriler ve kaynakçayı içerir.</Notice>
          </div>
        </Panel>
        <Panel title="Oluşturulan raporlar">
          {list.isLoading ? <LoadingBlock /> : list.isError ? <ErrorState error={list.error} /> : !list.data?.length ? <EmptyState title="Henüz rapor oluşturulmadı" /> : (
            <ul className="divide-y divide-border">
              {list.data.map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-2 py-2 text-sm">
                  <div><div className="font-medium">{r.location_name}</div><div className="text-xs text-muted-foreground">{r.id} · {fmtDate(r.created_at)}</div></div>
                  <Link href={`/reports/${r.id}`} className="text-primary hover:underline">Görüntüle / PDF</Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </>
  );
}
