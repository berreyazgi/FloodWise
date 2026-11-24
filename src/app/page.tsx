import Link from "next/link";
import { ArrowRight, BarChart3, Building2, CloudRain, ExternalLink, FileText, Layers, Users, Waves, Wrench, FlaskConical } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { HISTORICAL_EVENTS } from "@/data/seed";
import { HeroMap } from "@/components/map/hero-map";

const STEPS = [
  { icon: CloudRain, t: "Geçmiş veriler", d: "Doğrulanmış olaylar, ERA5 yağış yeniden analizi" },
  { icon: Layers, t: "Coğrafi analiz", d: "Kot, eğim, çukurluk, dere yakınlığı" },
  { icon: BarChart3, t: "Risk önceliklendirme", d: "Şeffaf tarama indeksi ve belirsizlik" },
  { icon: Wrench, t: "Wilo çözüm adayları", d: "Hidrolik ön kontrol ve ürün aileleri" },
  { icon: Building2, t: "Belediye incelemesi", d: "Senaryo karşılaştırma ve rapor" },
];
const IMPACT = [
  ["Daha bilinçli altyapı yatırımı", "Saha incelemesini en çok gerektiren alanlara odaklanma."],
  ["Erken tespit", "İnceleme gerektiren alanların olaydan önce görünür olması."],
  ["Koordinasyon", "Vatandaş, operatör ve mühendis aynı kanıt tabanında."],
  ["Kanıta dayalı pompa planlama", "Debi değil; basma yüksekliği, su karakteri ve deşarj kısıtlarıyla."],
  ["Vatandaş katılımı", "Gizliliği koruyan, moderasyonlu bildirim akışı."],
];

export default function Landing() {
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 border-b border-border bg-background/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3">
          <Link href="/" className="flex items-center gap-2 font-semibold"><span className="grid size-8 place-items-center rounded-lg bg-primary/15 text-primary"><Waves className="size-4" /></span>FloodWise İstanbul</Link>
          <nav className="flex items-center gap-2 text-sm" aria-label="Üst menü">
            <span className="hidden items-center gap-1 rounded-md border border-warning/50 bg-warning/10 px-2 py-1 text-xs font-medium text-warning sm:inline-flex"><FlaskConical className="size-3.5" />Demo / Ön Fizibilite</span>
            <Link href="/about" className="hidden px-2 text-muted-foreground hover:text-foreground sm:inline">Yöntem</Link>
            <Link href="/citizen-report" className="px-2 text-muted-foreground hover:text-foreground">Bildirim yap</Link>
            <Link href="/dashboard" className={buttonVariants({ size: "sm" })}>Platforma gir</Link>
          </nav>
        </div>
      </header>

      <section className="mx-auto grid max-w-7xl items-center gap-8 px-4 py-12 lg:grid-cols-2 lg:py-20">
        <div>
          <p className="text-sm font-medium text-cyan">Yapay Zekâ Destekli Kentsel Sel Riski Analizi ve Akıllı Su Tahliye Planlama Platformu</p>
          <h1 className="mt-3 text-4xl font-semibold leading-tight tracking-tight sm:text-5xl">İstanbul&apos;un Sel Riskini Verilerle Anlayın.</h1>
          <p className="mt-4 max-w-xl text-lg text-muted-foreground">Geçmiş yağışları, kentsel taşkın kayıtlarını ve altyapı verilerini bir araya getirerek riskli bölgeleri değerlendiren yapay zekâ destekli karar platformu.</p>
          <p className="mt-3 text-sm italic text-muted-foreground">“Sel gerçekleşmeden önce riskleri görün, müdahaleyi doğru yerde planlayın.”</p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link href="/map" className={buttonVariants({ size: "lg" })} data-testid="cta-map">Risk Haritasını Keşfet <ArrowRight className="size-4" /></Link>
            <a href="#nasil" className={buttonVariants({ size: "lg", variant: "secondary" })}>Platform Nasıl Çalışır?</a>
          </div>
        </div>
        <div className="relative h-80 overflow-hidden rounded-2xl border border-border shadow-2xl shadow-black/40 sm:h-[26rem]">
          <HeroMap />
          <div className="pointer-events-none absolute bottom-2 left-2 right-2 rounded-md bg-background/85 px-2 py-1 text-[11px] text-muted-foreground">
            Gösterim: pilot ilçe sınırları, OSM dere hatları ve 2009/2023 olaylarıyla ilişkili yaklaşık çalışma alanları. Risk bölgesi beyanı değildir.
          </div>
        </div>
      </section>

      <section className="border-y border-border bg-secondary/40">
        <div className="mx-auto max-w-7xl px-4 py-12">
          <h2 className="text-2xl font-semibold">Sorun: yağış tek başına nerede taşkın olacağını söylemez</h2>
          <p className="mt-2 max-w-3xl text-muted-foreground">Bodrumlar, yer altı otoparkları, alt geçitler ve dere yatakları; kot, eğim, yüzey geçirimsizliği ve drenaj kapasitesinin birleşimine bağlı olarak etkilenir. Aşağıdaki olaylar kaynaklarıyla birlikte doğrulanmıştır.</p>
          <div className="mt-6 grid gap-4 md:grid-cols-2">
            {HISTORICAL_EVENTS.map((e) => (
              <article key={e.id} className="rounded-xl border border-border bg-card p-5">
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                  <time dateTime={e.event_date}>{new Date(e.event_date).toLocaleDateString("tr-TR", { dateStyle: "long" })}</time>
                  <span className="rounded border border-success/50 px-1.5 py-0.5 text-success">Doğrulanmış · {e.geographic_precision === "district" ? "ilçe düzeyi" : "yaklaşık koridor"}</span>
                </div>
                <h3 className="mt-1 text-lg font-semibold">{e.title}</h3>
                <div className="text-sm text-muted-foreground">{e.district}</div>
                <p className="mt-2 text-sm">{e.description}</p>
                <p className="mt-2 text-sm">{e.consequences}</p>
                <ul className="mt-3 space-y-0.5 text-xs">{e.sources.slice(0, 2).map((s) => <li key={s.url}><a href={s.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">{s.publisher}<ExternalLink className="size-3" /></a></li>)}</ul>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="nasil" className="mx-auto max-w-7xl scroll-mt-20 px-4 py-12">
        <h2 className="text-2xl font-semibold">Çözüm: kanıttan müdahaleye tek akış</h2>
        <ol className="mt-6 grid gap-3 md:grid-cols-5">
          {STEPS.map((s, i) => (
            <li key={s.t} className="relative rounded-xl border border-border bg-card p-4">
              <span className="text-xs text-muted-foreground">{i + 1}</span>
              <s.icon className="mt-1 size-5 text-primary" />
              <div className="mt-2 font-medium">{s.t}</div>
              <div className="text-xs text-muted-foreground">{s.d}</div>
              {i < STEPS.length - 1 && <ArrowRight className="absolute -right-3 top-1/2 hidden size-4 -translate-y-1/2 text-muted-foreground md:block" aria-hidden />}
            </li>
          ))}
        </ol>
      </section>

      <section className="mx-auto max-w-7xl px-4 pb-12">
        <h2 className="text-2xl font-semibold">Olası faydalar</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {IMPACT.map(([t, d]) => <div key={t} className="rounded-xl border border-border bg-card p-4"><div className="font-medium">{t}</div><div className="mt-1 text-sm text-muted-foreground">{d}</div></div>)}
        </div>
        <p className="mt-4 text-xs text-muted-foreground">Etkiler ölçülmemiştir; platform taşkınları önlediğini iddia etmez.</p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link href="/dashboard" className={buttonVariants()}><BarChart3 className="size-4" />Genel bakış</Link>
          <Link href="/citizen-report" className={buttonVariants({ variant: "secondary" })}><Users className="size-4" />Vatandaş bildirimi</Link>
          <Link href="/about" className={buttonVariants({ variant: "secondary" })}><FileText className="size-4" />Yöntem ve kaynaklar</Link>
        </div>
      </section>
      <footer className="border-t border-border px-4 py-4 text-center text-[11px] text-muted-foreground">
        Water AI Hackathon 2026 prototipi. Sertifikalı taşkın tahmini, erken uyarı veya pompa mühendisliği sistemi değildir; belediye onayı içermez.
      </footer>
    </div>
  );
}
