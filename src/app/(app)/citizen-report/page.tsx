"use client";

import { useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Send } from "lucide-react";
import { CitizenReportSchema, type CitizenReportInput } from "@/lib/schemas";
import { CATEGORIES } from "@/lib/domain/reports-ai";
import { MAX_PHOTO_BYTES } from "@/lib/domain/photo";
import { NativeSelect, Notice, PageHeader, Panel, Spinner } from "@/components/app/common";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { FloodMap } from "@/components/map/flood-map";
import type { Map as MLMap } from "maplibre-gl";

interface SubmitResult { id: string; status: string; ai: { suggestedCategory: string; matchedKeywords: string[]; missing: string[]; possibleDuplicates: { id: string }[]; note: string } }

function Field({ label, error, children, hint }: { label: string; error?: string; children: React.ReactNode; hint?: string }) {
  return (
    <div className="space-y-1 text-sm">
      <label className="block">{label}{children}</label>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      {error && <p className="text-xs text-critical" role="alert">{error}</p>}
    </div>
  );
}

export default function CitizenReportPage() {
  const qc = useQueryClient();
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoErr, setPhotoErr] = useState<string | null>(null);
  const { register, handleSubmit, control, setValue, watch, reset, formState: { errors } } = useForm<CitizenReportInput>({
    resolver: zodResolver(CitizenReportSchema),
    defaultValues: { district: undefined, neighborhood: "", lon: null, lat: null, category: undefined, observed_at: "", description: "", water_depth_cm: null, building_affected: false, road_affected: false, display_name: "", consent: undefined as unknown as true },
  });
  const lon = watch("lon"), lat = watch("lat");
  const submit = useMutation({
    mutationFn: async (d: CitizenReportInput) => {
      const fd = new FormData();
      fd.set("data", JSON.stringify(d));
      if (photo) fd.set("photo", photo);
      const res = await fetch("/api/reports", { method: "POST", body: fd });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Gönderilemedi");
      return body as SubmitResult;
    },
    onSuccess: () => { qc.invalidateQueries(); reset(); setPhoto(null); },
  });

  const onMapReady = (m: MLMap) => {
    m.on("click", (e) => {
      setValue("lon", Math.round(e.lngLat.lng * 1e4) / 1e4, { shouldValidate: true });
      setValue("lat", Math.round(e.lngLat.lat * 1e4) / 1e4, { shouldValidate: true });
    });
  };

  if (submit.isSuccess) {
    const r = submit.data;
    return (
      <div className="mx-auto max-w-2xl">
        <Panel>
          <div className="flex items-start gap-3" role="status">
            <CheckCircle2 className="size-6 text-success" />
            <div className="space-y-2 text-sm">
              <h1 className="text-lg font-semibold">Bildiriminiz alındı</h1>
              <p>Takip numarası: <b className="font-mono">{r.id}</b> — durum: <b>Beklemede</b>. Bildirim, belediye operatörünün inceleme kuyruğuna eklendi.</p>
              <p className="text-muted-foreground">{r.ai.note}</p>
              {r.ai.missing.length > 0 && <p>Eksik bilgiler: {r.ai.missing.join(", ")}.</p>}
              {r.ai.possibleDuplicates.length > 0 && <p>Benzer {r.ai.possibleDuplicates.length} bildirim bulundu; operatör birlikte değerlendirecek.</p>}
              <Button variant="secondary" onClick={() => submit.reset()}>Yeni bildirim</Button>
            </div>
          </div>
        </Panel>
      </div>
    );
  }

  return (
    <>
      <PageHeader title="Vatandaş Su Baskını Bildirimi" subtitle="Gözlemlediğiniz su birikmesini veya taşkını bildirin. Bildirimler incelenmeden yayımlanmaz ve doğrulanmış taşkın kaydı sayılmaz." />
      <Notice tone="warning" className="mb-4">Acil durumlarda bu formu değil, 112 Acil Çağrı Merkezini kullanın.</Notice>
      <form onSubmit={handleSubmit((d) => submit.mutate(d))} className="grid gap-4 xl:grid-cols-2" noValidate>
        <Panel title="Gözlem bilgileri">
          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="İlçe *" error={errors.district?.message}>
                <NativeSelect className="mt-1" {...register("district")} defaultValue="" aria-invalid={!!errors.district}>
                  <option value="" disabled>Seçin</option><option>Başakşehir</option><option>Küçükçekmece</option><option>Diğer</option>
                </NativeSelect>
              </Field>
              <Field label="Mahalle" error={errors.neighborhood?.message}><Input className="mt-1" {...register("neighborhood")} autoComplete="off" /></Field>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Olay türü *" error={errors.category?.message}>
                <NativeSelect className="mt-1" {...register("category")} defaultValue="" aria-invalid={!!errors.category}>
                  <option value="" disabled>Seçin</option>
                  {Object.entries(CATEGORIES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </NativeSelect>
              </Field>
              <Field label="Gözlem tarihi ve saati *" error={errors.observed_at?.message}><Input type="datetime-local" className="mt-1" {...register("observed_at")} aria-invalid={!!errors.observed_at} /></Field>
            </div>
            <Field label="Açıklama *" error={errors.description?.message} hint="Ne gördüğünüzü yazın. Lütfen tam ev adresi veya kişisel bilgi paylaşmayın.">
              <Textarea className="mt-1" rows={4} {...register("description")} aria-invalid={!!errors.description} />
            </Field>
            <Field label="Tahmini su derinliği (cm)" error={errors.water_depth_cm?.message}>
              <Input type="number" min={0} max={500} className="mt-1" {...register("water_depth_cm", { setValueAs: (v) => (v === "" || v == null ? null : Number(v)) })} />
            </Field>
            <div className="flex flex-wrap gap-4 text-sm">
              <Controller control={control} name="building_affected" render={({ field }) => <label className="flex items-center gap-2"><Switch checked={field.value} onCheckedChange={field.onChange} />Bina / bodrum etkilendi</label>} />
              <Controller control={control} name="road_affected" render={({ field }) => <label className="flex items-center gap-2"><Switch checked={field.value} onCheckedChange={field.onChange} />Yol etkilendi</label>} />
            </div>
            <Field label="Fotoğraf (isteğe bağlı, JPEG/PNG, en çok 5 MB)" error={photoErr ?? undefined} hint="Konum (EXIF/GPS) ve diğer üst veriler sunucuda silinir.">
              <Input type="file" accept="image/jpeg,image/png" className="mt-1" onChange={(e) => {
                const f = e.target.files?.[0] ?? null;
                setPhotoErr(f && f.size > MAX_PHOTO_BYTES ? "Fotoğraf 5 MB sınırını aşıyor." : f && !["image/jpeg", "image/png"].includes(f.type) ? "Yalnızca JPEG veya PNG." : null);
                setPhoto(f && f.size <= MAX_PHOTO_BYTES ? f : null);
              }} />
            </Field>
            <Field label="Görünen ad (isteğe bağlı, takma ad olabilir)"><Input className="mt-1" {...register("display_name")} autoComplete="off" /></Field>
          </div>
        </Panel>
        <div className="space-y-4">
          <Panel title="Yaklaşık konum (haritaya tıklayın)">
            <div className="relative h-72 overflow-hidden rounded-lg border border-border">
              <FloodMap visible={{ districts: true, roads: true, buildings: true }} onReady={onMapReady} reportsUrl="/api/geo/citizen-reports" />
            </div>
            <p className="mt-2 text-xs text-muted-foreground" aria-live="polite">{lon != null && lat != null ? `Seçilen: ${lat}, ${lon} (kamuya açık görünümde ~100 m'ye yuvarlanır)` : "Konum seçilmedi — isteğe bağlı ama önerilir."}</p>
            {(errors.lon || errors.lat) && <p className="text-xs text-critical">Konum İstanbul sınırları içinde olmalı.</p>}
          </Panel>
          <Panel title="Veri kullanımı ve gizlilik">
            <ul className="ml-4 list-disc space-y-1 text-xs text-muted-foreground">
              <li>Yalnızca bu formdaki bilgiler toplanır; ad zorunlu değildir, e-posta/telefon istenmez.</li>
              <li>Bildirimler operatör incelemesinden önce yayımlanmaz; yayımlanan konumlar ~100 m&apos;ye yuvarlanır.</li>
              <li>Fotoğraflar yalnızca operatörlere gösterilir; üst veriler silinir.</li>
              <li>Doğrulanmamış bildirimler model eğitim etiketi olarak kullanılmaz.</li>
              <li>Demo prototipte kayıtlar yerel veritabanında tutulur; üretimde saklama süresi belediye politikasına göre belirlenmelidir.</li>
              <li>Kötüye kullanımı önlemek için IP başına 10 dakikada 5 bildirim sınırı uygulanır.</li>
            </ul>
            <label className="mt-3 flex items-start gap-2 text-sm">
              <input type="checkbox" className="mt-0.5 size-4 accent-[#38BDF8]" {...register("consent", { setValueAs: (v) => v === true || v === "on" || undefined })} />
              Bilgilerimin yukarıda açıklanan şekilde işlenmesini kabul ediyorum. *
            </label>
            {errors.consent && <p className="text-xs text-critical" role="alert">{errors.consent.message}</p>}
            <Button type="submit" className="mt-4 w-full" disabled={submit.isPending || !!photoErr} data-testid="submit-report">{submit.isPending ? <Spinner /> : <Send className="size-4" />} Bildirimi gönder</Button>
            {submit.isError && <p className="mt-2 text-sm text-critical" role="alert">{(submit.error as Error).message}</p>}
          </Panel>
        </div>
      </form>
    </>
  );
}
