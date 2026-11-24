"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Suspense, useState, type ReactNode } from "react";
import { BarChart3, BookOpen, Building2, CloudRain, Database, FileText, FlaskConical, History, LayoutDashboard, Map, Menu, MessageSquareText, Search, ShieldCheck, Waves, Wrench } from "lucide-react";
import { cn } from "@/lib/utils";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { useMeta } from "@/lib/client/hooks";
import { LocationSelect, NativeSelect, fmtDate } from "./common";
import { useApp } from "./providers";
import { AssistantButton } from "./assistant";

export const NAV = [
  { href: "/dashboard", label: "Genel Bakış", icon: LayoutDashboard },
  { href: "/map", label: "Taşkın Haritası", icon: Map },
  { href: "/historical-events", label: "Geçmiş Olaylar", icon: History },
  { href: "/risk-analysis", label: "Risk Analizi", icon: BarChart3 },
  { href: "/pump-planning", label: "Wilo Pompa Planlama", icon: Wrench },
  { href: "/simulation", label: "Tahliye Simülasyonu", icon: Waves },
  { href: "/reports", label: "Raporlar", icon: FileText, operator: true },
  { href: "/citizen-report", label: "Vatandaş Bildirimi", icon: CloudRain },
  { href: "/admin", label: "Belediye Paneli", icon: ShieldCheck, operator: true },
  { href: "/about", label: "Yöntem ve Kaynaklar", icon: BookOpen },
] as const;

function NavLinks({ onNavigate, path }: { onNavigate?: () => void; path: string }) {
  const { role } = useApp();
  return (
    <nav aria-label="Ana menü" className="flex flex-col gap-0.5">
      {NAV.map((n) => {
        const active = path === n.href || path.startsWith(n.href + "/");
        const Icon = n.icon;
        return (
          <Link
            key={n.href}
            href={n.href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors",
              active ? "bg-sidebar-accent text-foreground" : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground",
            )}
          >
            <Icon className={cn("size-4", active && "text-primary")} />
            <span className="flex-1">{n.label}</span>
            {"operator" in n && n.operator && role !== "operator" && <span className="text-[10px] text-muted-foreground">operatör</span>}
          </Link>
        );
      })}
    </nav>
  );
}

function LiveNav({ onNavigate }: { onNavigate?: () => void }) {
  return <NavLinks onNavigate={onNavigate} path={usePathname()} />;
}

/** usePathname is request data on dynamic routes → static fallback keeps the shell prerenderable. */
function NavList({ onNavigate }: { onNavigate?: () => void }) {
  return <Suspense fallback={<NavLinks onNavigate={onNavigate} path="" />}><LiveNav onNavigate={onNavigate} /></Suspense>;
}

function Brand() {
  return (
    <Link href="/" className="flex items-center gap-2 px-2 py-1">
      <span className="grid size-8 place-items-center rounded-lg bg-primary/15 text-primary"><Waves className="size-4" /></span>
      <span className="leading-tight">
        <span className="block text-sm font-semibold">FloodWise İstanbul</span>
        <span className="block text-[11px] text-muted-foreground">Karar destek prototipi</span>
      </span>
    </Link>
  );
}

function DataStatus() {
  const { data, isError } = useMeta();
  const snaps = data?.snapshots ?? [];
  const ok = snaps.length > 0 && snaps.every((s) => s.available);
  const latest = snaps.map((s) => s.fetched_at).filter(Boolean).sort().at(-1) ?? null;
  return (
    <div className="rounded-lg border border-sidebar-border p-3 text-xs">
      <div className="mb-1 flex items-center gap-1.5 font-medium">
        <Database className="size-3.5" /> Veri kaynakları
      </div>
      {isError ? <div className="text-critical">Durum alınamadı</div> : (
        <>
          <div className={ok ? "text-success" : "text-warning"}>{ok ? "● Anlık görüntüler mevcut" : "▲ Eksik anlık görüntü"}</div>
          <div className="mt-0.5 text-muted-foreground">Veri zamanı: {fmtDate(latest)}</div>
          <div className="text-muted-foreground">Canlı sensör verisi yok</div>
        </>
      )}
    </div>
  );
}

function RoleSwitch() {
  const { role, setRole } = useApp();
  return (
    <label className="flex items-center gap-2 text-xs text-muted-foreground">
      <Building2 className="size-4" />
      <span className="sr-only">Demo rolü</span>
      <NativeSelect data-testid="role-switch" className="h-8 w-auto" value={role} onChange={(e) => setRole(e.target.value as "citizen" | "operator")}>
        <option value="citizen">Vatandaş (demo)</option>
        <option value="operator">Belediye operatörü (demo)</option>
      </NativeSelect>
    </label>
  );
}

function SearchBox() {
  const router = useRouter();
  const [q, setQ] = useState("");
  return (
    <form role="search" className="relative hidden md:block" onSubmit={(e) => { e.preventDefault(); if (q.trim()) router.push(`/map?q=${encodeURIComponent(q.trim())}`); }}>
      <Search className="pointer-events-none absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
      <input aria-label="Konum ara" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Konum ara (ör. İkitelli)" className="h-9 w-56 rounded-lg border border-input bg-secondary pl-8 pr-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring" />
    </form>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex min-h-screen">
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col gap-4 border-r border-sidebar-border bg-sidebar p-3 lg:flex">
        <Brand />
        <NavList />
        <div className="mt-auto"><DataStatus /></div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex flex-wrap items-center gap-2 border-b border-border bg-background/90 px-3 py-2 backdrop-blur sm:px-4">
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger className="rounded-lg p-2 hover:bg-accent lg:hidden" aria-label="Menüyü aç" data-testid="mobile-menu"><Menu className="size-5" /></SheetTrigger>
            <SheetContent side="left" className="w-72 bg-sidebar p-3">
              <SheetTitle className="sr-only">Menü</SheetTitle>
              <Brand />
              <div className="mt-4"><NavList onNavigate={() => setOpen(false)} /></div>
              <div className="mt-4"><DataStatus /></div>
            </SheetContent>
          </Sheet>
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <LocationSelect className="h-8 max-w-[16rem] sm:max-w-xs" id="topbar-location" />
            <span className="hidden items-center gap-1 rounded-md border border-warning/50 bg-warning/10 px-2 py-1 text-xs font-medium text-warning sm:inline-flex" data-testid="demo-badge">
              <FlaskConical className="size-3.5" /> Demo / Ön Fizibilite
            </span>
          </div>
          <SearchBox />
          <AssistantButton />
          <RoleSwitch />
        </header>
        <div className="border-b border-warning/30 bg-warning/10 px-4 py-1 text-center text-xs text-warning sm:hidden">Demo / Ön Fizibilite</div>
        <main className="mx-auto w-full max-w-[1400px] flex-1 p-3 sm:p-5">{children}</main>
        <footer className="border-t border-border px-4 py-3 text-center text-[11px] text-muted-foreground">
          Prototip karar destek aracıdır; sertifikalı taşkın tahmini, erken uyarı veya pompa mühendisliği sistemi değildir. Belediye onayı içermez. Harita © OpenStreetMap katkıcıları, © CARTO.
        </footer>
      </div>
    </div>
  );
}
