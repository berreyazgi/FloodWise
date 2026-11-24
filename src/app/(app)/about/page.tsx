import { PageHeader, Panel } from "@/components/app/common";
import { HISTORICAL_EVENTS, WILO_PRODUCTS } from "@/data/seed";
import { DEFAULT_WEIGHTS, FACTOR_META, MISSING_INPUTS, MODEL_VERSION } from "@/lib/domain/risk";

export default function AboutPage() {
  return (
    <>
      <PageHeader title="Yöntem, Kaynaklar ve Sınırlamalar" subtitle="FloodWise İstanbul, Water AI Hackathon 2026 için geliştirilmiş bir prototip karar destek aracıdır." />
      <div className="grid gap-4 xl:grid-cols-2">
        <Panel title="Ne değildir">
          <ul className="ml-4 list-disc space-y-1 text-sm">
            <li>Sertifikalı bir taşkın tahmin, erken uyarı veya acil durum sistemi değildir.</li>
            <li>Pompa mühendisliği tasarım aracı değildir; kesin ürün seçimi veya kurulum talimatı üretmez.</li>
            <li>İstanbul Büyükşehir Belediyesi, İSKİ veya Wilo tarafından onaylanmamıştır; belediye yetkisi taşımaz.</li>
            <li>Canlı sensör, SCADA veya gerçek zamanlı yağış verisi kullanmaz.</li>
          </ul>
        </Panel>
        <Panel title={`Risk tarama yöntemi (${MODEL_VERSION})`}>
          <p className="text-sm">İlçe sınırları içinde ~550 m aralıklı ızgara noktalarında Copernicus GLO-90 kotu örneklenir. Açık su yüzeyleri (OSM natural=water) dışlanır. Her hücre için dört faktör 0–1 aralığında puanlanır ve ağırlıklı ortalaması 0–100 indeksine dönüştürülür:</p>
          <ul className="ml-4 mt-2 list-disc space-y-1 text-sm">
            {(Object.keys(FACTOR_META) as (keyof typeof FACTOR_META)[]).map((k) => <li key={k}><b>{FACTOR_META[k].label}</b> (ağırlık {DEFAULT_WEIGHTS[k]}): {FACTOR_META[k].rule}</li>)}
          </ul>
          <p className="mt-2 text-sm">Belirsizlik: ağırlıklar ×U(0,5–1,5) aralığında 200 kez rastgele bozulur (sabit tohum, tekrarlanabilir) ve her hücrenin ilk %10&apos;da kalma oranı raporlanır.</p>
          <p className="mt-2 text-sm"><b>Neden makine öğrenmesi yok?</b> Uygulamada {HISTORICAL_EVENTS.length} doğrulanmış olay var ve ikisi de ilçe/koridor hassasiyetinde. Hücre ölçeğinde pozitif/negatif etiket olmadan eğitilen bir sınıflandırıcı gürültüye uyar; doğruluk metrikleri anlamsız olurdu. Yeterli etiketli veri (ör. İSKİ/AKOM ihbar kayıtları, koordinatlı) sağlandığında mekânsal blok çapraz doğrulamalı lojistik regresyon / gradyan artırma ile karşılaştırma yapılması önerilir.</p>
        </Panel>
        <Panel title="Drenaj simülatörü">
          <p className="text-sm">Toplu depolama su dengesi: Depolama(t+Δt) = max(0, Depolama(t) + Giriş·Δt − Çıkış·Δt). Giriş rasyonel yöntemle Q = C·i·A; çıkış mevcut su, pompa kapasitesi ve deşarj sınırının en küçüğüdür. Ters akış, şebeke hidroliği, yeraltı bağlantıları ve 2B yüzey akışı ihmal edilir.</p>
          <p className="mt-2 text-sm">Pompa ön kontrolü Darcy–Weisbach (Swamee–Jain sürtünme faktörü) ile sistem eğrisini ve toplam dinamik yükü hesaplar; üretici eğrisi olmadan çalışma noktası belirlenemez.</p>
        </Panel>
        <Panel title="Bilinen eksik veriler">
          <ul className="ml-4 list-disc space-y-1 text-sm">{MISSING_INPUTS.map((m) => <li key={m}>{m}</li>)}</ul>
        </Panel>
        <Panel title="Veri kaynakları ve lisanslar" className="xl:col-span-2">
          <ul className="ml-4 list-disc space-y-1 text-sm">
            <li>İlçe sınırları, dereler, su yüzeyleri, binalar ve yollar: © OpenStreetMap katkıcıları (ODbL), Nominatim ve Overpass API üzerinden.</li>
            <li>Altlık harita: © CARTO (Dark Matter), © OpenStreetMap.</li>
            <li>Yükseklik: Copernicus DEM GLO-90 (© DLR e.V. 2010–2014 ve © Airbus Defence and Space GmbH 2014–2018, ESA tarafından sağlanmıştır) — Open-Meteo Elevation API; gölgelendirme için Mapzen/AWS Terrain Tiles.</li>
            <li>Yağış: Open-Meteo Historical Weather API (ERA5 / ERA5-Land yeniden analizi, CC BY 4.0). İstasyon gözlemi değildir.</li>
            <li>Geçmiş olaylar: {HISTORICAL_EVENTS.flatMap((e) => e.sources.map((s) => s.publisher)).filter((v, i, a) => a.indexOf(v) === i).join(", ")}.</li>
            <li>Wilo ürün bilgileri: wilo.com ürün sayfaları ve üretici veri sayfalarının bayi kopyaları ({WILO_PRODUCTS.length} kayıt; doğrulanmamış değerler “veri yok” olarak bırakıldı).</li>
          </ul>
        </Panel>
        <Panel title="Veri köken etiketleri" className="xl:col-span-2">
          <ul className="grid gap-2 text-sm sm:grid-cols-2">
            <li><b>verified</b> — güvenilir kaynakla belgelenmiş gözlem.</li>
            <li><b>estimated</b> — model veya yeniden analizden türetilmiş değer.</li>
            <li><b>user_reported</b> — vatandaş bildirimi; operatör doğrulaması olmadan kanıt sayılmaz.</li>
            <li><b>synthetic_demo</b> — gösterim amaçlı yapay kayıt; her yerde ayrıca etiketlenir.</li>
          </ul>
        </Panel>
      </div>
    </>
  );
}
