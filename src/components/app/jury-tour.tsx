"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { postJson } from "@/lib/client/api";

const TOUR = [
  ["Taşkın Haritası", "Geçmiş olay alanları, dereler ve su birikimi göstergesi"],
  ["Risk Analizi", "İnceleme önceliği taşıyan hücreler ve gerekçeleri"],
  ["Wilo Pompa Planlama", "Gereken debi, basma yüksekliği ve ürün aileleri"],
  ["Tahliye Simülasyonu", "Pompasız ve pompalı senaryoların karşılaştırması"],
  ["Raporlar", "Ön fizibilite raporu ve PDF çıktısı"],
] as const;

/** Jüri ve ziyaretçiler için: demo belediye rolüne geçip turun ilk adımına götürür (kimlik doğrulama değildir). */
export function JuryTour() {
  const router = useRouter();
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);

  async function start() {
    setBusy(true);
    try {
      await postJson("/api/session", { role: "operator" });
      await qc.invalidateQueries();
      router.push("/map");
    } catch {
      setBusy(false);
    }
  }

  return (
    <section id="jury-tour" className="mx-auto max-w-7xl scroll-mt-20 px-4 pb-12" aria-labelledby="jury-tour-title">
      <div className="rounded-xl border border-primary/40 bg-primary/5 p-5">
        <h2 id="jury-tour-title"className="text-2xl font-semibold">Jüri için 5 dakikalık tur</h2>
        <p className="mt-1 text-sm text-muted-foreground">Belediye ekibinin göreceği ekranlarla başlayın. Raporlar ve Belediye Paneli bu görünümde açılır.</p>
        <ol className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
          {TOUR.map(([t, d], i) => (
            <li key={t} className="rounded-lg border border-border bg-card p-3">
              <span className="text-xs text-muted-foreground">{i + 1}</span>
              <div className="font-medium">{t}</div>
              <div className="text-xs text-muted-foreground">{d}</div>
            </li>
          ))}
        </ol>
        <Button className="mt-4" size="lg" onClick={start} disabled={busy} data-testid="jury-tour-start">
          {busy ? <Loader2 className="size-4 animate-spin" /> : null}
          Belediye görünümüyle başla <ArrowRight className="size-4" />
        </Button>
      </div>
    </section>
  );
}
