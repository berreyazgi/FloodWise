"use client";

import type { ReactNode, SelectHTMLAttributes } from "react";
import { AlertTriangle, CheckCircle2, CircleDashed, FlaskConical, Info, Loader2, User, XCircle, Clock, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { PROVENANCE_LABEL, REPORT_STATUS_LABEL, type Provenance, type ReportStatus } from "@/lib/domain/types";
import { Skeleton } from "@/components/ui/skeleton";
import { useApp } from "./providers";
import { useLocations } from "@/lib/client/hooks";

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-1 max-w-3xl text-sm text-muted-foreground">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Panel({ title, children, className, actions, id }: { title?: ReactNode; children: ReactNode; className?: string; actions?: ReactNode; id?: string }) {
  return (
    <section id={id} className={cn("rounded-xl border border-border bg-card p-4 shadow-sm shadow-black/20 sm:p-5", className)}>
      {(title || actions) && (
        <div className="mb-4 flex items-start justify-between gap-3">
          {title && <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{title}</h2>}
          {actions}
        </div>
      )}
      {children}
    </section>
  );
}

export function StatTile({ label, value, hint, tone = "default" }: { label: string; value: ReactNode; hint?: string; tone?: "default" | "warning" | "success" }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="text-xs font-medium text-muted-foreground">{label}</div>
      <div className={cn("mt-1 text-2xl font-semibold tabular-nums", tone === "warning" && "text-warning", tone === "success" && "text-success")}>{value}</div>
      {hint && <div className="mt-1 text-xs text-muted-foreground">{hint}</div>}
    </div>
  );
}

const PROV_STYLE: Record<Provenance, { cls: string; icon: ReactNode }> = {
  verified: { cls: "border-success/40 bg-success/10 text-success", icon: <CheckCircle2 className="size-3" /> },
  estimated: { cls: "border-primary/40 bg-primary/10 text-primary", icon: <CircleDashed className="size-3" /> },
  user_reported: { cls: "border-cyan/40 bg-cyan/10 text-cyan", icon: <User className="size-3" /> },
  synthetic_demo: { cls: "border-warning/50 bg-warning/10 text-warning", icon: <FlaskConical className="size-3" /> },
};
export function ProvenanceBadge({ p }: { p: Provenance | string }) {
  const s = PROV_STYLE[p as Provenance] ?? PROV_STYLE.estimated;
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] font-medium", s.cls)}>
      {s.icon}
      {PROVENANCE_LABEL[p as Provenance] ?? p}
    </span>
  );
}

const STATUS_ICON: Record<ReportStatus, ReactNode> = {
  pending: <Clock className="size-3" />,
  under_review: <Search className="size-3" />,
  verified: <CheckCircle2 className="size-3" />,
  rejected: <XCircle className="size-3" />,
  resolved: <CheckCircle2 className="size-3" />,
};
const STATUS_CLS: Record<ReportStatus, string> = {
  pending: "border-warning/50 text-warning",
  under_review: "border-primary/50 text-primary",
  verified: "border-success/50 text-success",
  rejected: "border-critical/50 text-critical",
  resolved: "border-muted-foreground/50 text-muted-foreground",
};
export function StatusBadge({ s }: { s: ReportStatus }) {
  return <span className={cn("inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] font-medium", STATUS_CLS[s])}>{STATUS_ICON[s]}{REPORT_STATUS_LABEL[s]}</span>;
}

/** Index band with icon + text (not colour alone). */
export function BandBadge({ index }: { index: number }) {
  const band = index >= 60 ? { t: "Öncelikli inceleme", c: "border-critical/50 text-critical", i: <AlertTriangle className="size-3" /> }
    : index >= 40 ? { t: "İzlenmeli", c: "border-warning/50 text-warning", i: <Info className="size-3" /> }
    : { t: "Düşük öncelik", c: "border-success/50 text-success", i: <CheckCircle2 className="size-3" /> };
  return <span className={cn("inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] font-medium", band.c)}>{band.i}{band.t}</span>;
}

export function Notice({ tone = "info", children, className }: { tone?: "info" | "warning" | "critical"; children: ReactNode; className?: string }) {
  const cls = tone === "warning" ? "border-warning/40 bg-warning/5 text-warning" : tone === "critical" ? "border-critical/40 bg-critical/5 text-critical" : "border-primary/30 bg-primary/5 text-primary";
  return (
    <div role={tone === "info" ? "note" : "alert"} className={cn("flex gap-2 rounded-lg border px-3 py-2 text-sm", cls, className)}>
      {tone === "info" ? <Info className="mt-0.5 size-4 shrink-0" /> : <AlertTriangle className="mt-0.5 size-4 shrink-0" />}
      <div className="text-foreground/90">{children}</div>
    </div>
  );
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border px-4 py-10 text-center">
      <CircleDashed className="mb-2 size-6 text-muted-foreground" />
      <div className="font-medium">{title}</div>
      {children && <div className="mt-1 max-w-md text-sm text-muted-foreground">{children}</div>}
    </div>
  );
}

export function ErrorState({ error }: { error: unknown }) {
  return <Notice tone="critical">{error instanceof Error ? error.message : "Beklenmeyen bir hata oluştu."}</Notice>;
}

export function LoadingBlock({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-2" aria-busy="true" aria-label="Yükleniyor">
      {Array.from({ length: rows }, (_, i) => <Skeleton key={i} className="h-10 w-full" />)}
    </div>
  );
}

export function Spinner() {
  return <Loader2 className="size-4 animate-spin" aria-hidden />;
}

export function NativeSelect({ className, children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn("h-9 w-full rounded-lg border border-input bg-secondary px-2.5 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50", className)}
      {...props}
    >
      {children}
    </select>
  );
}

export function LocationSelect({ className, id = "location-select" }: { className?: string; id?: string }) {
  const { locationId, setLocationId } = useApp();
  const { data } = useLocations();
  return (
    <NativeSelect id={id} aria-label="Çalışma alanı" className={className} value={locationId} onChange={(e) => setLocationId(e.target.value)}>
      {!data && <option value={locationId}>Yükleniyor…</option>}
      {data?.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
    </NativeSelect>
  );
}

export const ENGINEERING_DISCLAIMER = "Bu simülasyon eğitim ve ön fizibilite amaçlıdır. Gerçek saha tasarımı için yetkili mühendislik çalışmaları ve doğrulanmış hidrolik veriler gereklidir.";
export const BUILDING_SCALE_MSG = "Bu konum için bina veya cadde ölçeğinde güvenilir tahmin üretmeye yeterli veri bulunmuyor.";

export const fmtDate = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleString("tr-TR", { dateStyle: "medium", timeStyle: iso.length > 10 ? "short" : undefined }) : "—");
export const fmtNum = (v: number | null | undefined, d = 1) => (v == null ? "—" : v.toLocaleString("tr-TR", { maximumFractionDigits: d }));
