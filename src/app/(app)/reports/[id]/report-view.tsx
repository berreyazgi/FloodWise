"use client";

import { use } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Download, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ErrorState, LoadingBlock, fmtDate } from "@/components/app/common";
import { api } from "@/lib/client/api";
import { SECTION_KIND_LABEL, type ReportContent, type SectionKind } from "@/lib/domain/report";

const KIND_CLS: Record<SectionKind, string> = {
  verified: "border-success/50 text-success",
  model: "border-primary/50 text-primary",
  assumption: "border-cyan/50 text-cyan",
  illustrative: "border-warning/50 text-warning",
  guidance: "border-muted-foreground/50 text-muted-foreground",
};

export function ReportView({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const q = useQuery({ queryKey: ["generated-report", id], queryFn: () => api<{ id: string; created_at: string; content: ReportContent }>(`/api/generated-reports/${id}`) });
  if (q.isLoading) return <LoadingBlock rows={8} />;
  if (q.isError) return <ErrorState error={q.error} />;
  const c = q.data!.content;
  return (
    <div className="mx-auto max-w-4xl">
      <div className="no-print mb-4 flex flex-wrap items-center justify-between gap-2">
        <Link href="/reports" className="inline-flex items-center gap-1 text-sm text-primary hover:underline"><ArrowLeft className="size-4" />Raporlar</Link>
        <Button onClick={() => window.print()} data-testid="print-pdf"><Download className="size-4" /> PDF olarak kaydet</Button>
      </div>
      <article className="print-page rounded-xl border border-border bg-card p-6 sm:p-10" data-testid="report-article">
        <header className="mb-6 border-b border-border pb-4">
          <div className="text-xs uppercase tracking-wider text-warning">{c.subtitle}</div>
          <h1 className="mt-1 text-2xl font-semibold">{c.heading}</h1>
          <div className="mt-2 grid gap-1 text-sm text-muted-foreground sm:grid-cols-2">
            <div>Çalışma alanı: <b className="text-foreground">{c.location}</b></div>
            <div>Analiz/rapor tarihi: {fmtDate(c.generatedAt)}</div>
            <div>Rapor kimliği: {q.data!.id}</div>
          </div>
          <p className="mt-3 rounded-md border border-warning/40 p-2 text-xs">{c.disclaimer}</p>
          <div className="mt-3 flex flex-wrap gap-1.5 text-[11px]">
            {(Object.keys(SECTION_KIND_LABEL) as SectionKind[]).map((k) => <span key={k} className={`rounded border px-1.5 py-0.5 ${KIND_CLS[k]}`}>{SECTION_KIND_LABEL[k]}</span>)}
          </div>
        </header>
        {c.sections.map((s) => (
          <section key={s.title} className="mb-6 break-inside-avoid-page">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-semibold">{s.title}</h2>
              <span className={`rounded border px-1.5 py-0.5 text-[11px] ${KIND_CLS[s.kind]}`}>{SECTION_KIND_LABEL[s.kind]}</span>
            </div>
            {s.paragraphs.map((p, i) => <p key={i} className="mb-1.5 text-sm leading-relaxed">{p}</p>)}
            {s.table && (
              <div className="mt-2 overflow-x-auto">
                <table className="w-full border-collapse text-xs">
                  <thead><tr>{s.table.head.map((h) => <th key={h} className="border border-border bg-secondary/50 px-2 py-1 text-left">{h}</th>)}</tr></thead>
                  <tbody>{s.table.rows.map((r, i) => <tr key={i}>{r.map((v, j) => <td key={j} className="border border-border px-2 py-1 align-top">{String(v).startsWith("http") ? <a href={String(v)} className="break-all text-primary">{String(v)}</a> : v}</td>)}</tr>)}</tbody>
                </table>
              </div>
            )}
          </section>
        ))}
        <section>
          <h2 className="mb-2 text-lg font-semibold">Kaynakça</h2>
          <ol className="ml-5 list-decimal space-y-0.5 text-xs">{c.references.map((r) => <li key={r.url}>{r.title} — <span className="break-all">{r.url}</span></li>)}</ol>
        </section>
      </article>
    </div>
  );
}
