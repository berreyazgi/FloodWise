"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Bot, ExternalLink, Send } from "lucide-react";
import { Sheet, SheetContent, SheetTitle, SheetTrigger, SheetDescription } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { postJson } from "@/lib/client/api";
import type { AssistantAnswer } from "@/lib/domain/assistant";
import { useApp } from "./providers";
import { Notice, Spinner } from "./common";

type Reply = AssistantAnswer & { text: string | null; mode: "llm" | "deterministic"; llmError?: string };
const EXAMPLES = [
  "Bu bölge neden inceleme önceliği taşıyor?",
  "Bu ilçede hangi geçmiş taşkın kayıtları var?",
  "Hangi veriler eksik?",
  "Bu konumda hangi Wilo çözümleri değerlendirilebilir?",
  "İki tahliye senaryosu arasındaki fark nedir?",
];

function ReplyView({ r }: { r: Reply }) {
  return (
    <div className="space-y-2 text-sm">
      {r.text && <p className="whitespace-pre-wrap">{r.text}</p>}
      {(!r.text || r.mode === "deterministic") && r.facts.length > 0 && (
        <div>
          <div className="text-[11px] font-semibold uppercase text-success">Kayıtlara dayalı bilgiler</div>
          <ul className="ml-4 list-disc space-y-1">{r.facts.map((f, i) => <li key={i}>{f}</li>)}</ul>
        </div>
      )}
      {r.assumptions.length > 0 && (
        <div>
          <div className="text-[11px] font-semibold uppercase text-primary">Varsayımlar</div>
          <ul className="ml-4 list-disc space-y-1">{r.assumptions.map((f, i) => <li key={i}>{f}</li>)}</ul>
        </div>
      )}
      {r.uncertainty.length > 0 && (
        <div>
          <div className="text-[11px] font-semibold uppercase text-warning">Belirsizlik</div>
          <ul className="ml-4 list-disc space-y-1">{r.uncertainty.map((f, i) => <li key={i}>{f}</li>)}</ul>
        </div>
      )}
      {r.citations.length > 0 && (
        <div>
          <div className="text-[11px] font-semibold uppercase text-muted-foreground">Kaynaklar</div>
          <ul className="space-y-0.5">
            {r.citations.map((c, i) => (
              <li key={i} className="text-xs">
                {c.url ? <a className="inline-flex items-center gap-1 text-primary hover:underline" href={c.url} target="_blank" rel="noreferrer">{c.label}<ExternalLink className="size-3" /></a> : <span>{c.label}{c.recordId ? ` (${c.recordId})` : ""}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="text-[10px] text-muted-foreground">{r.mode === "llm" ? "Claude ile ifade edildi; içerik uygulama kayıtlarıyla sınırlıdır." : "Deterministik yanıt (LLM kullanılmadı)."}{r.llmError ? ` ${r.llmError}` : ""}</div>
    </div>
  );
}

export function AssistantButton() {
  const { locationId } = useApp();
  const [q, setQ] = useState("");
  const [log, setLog] = useState<{ q: string; r?: Reply; err?: string }[]>([]);
  const m = useMutation({
    mutationFn: (question: string) => postJson<Reply>("/api/assistant", { question, locationId }),
    onMutate: (question) => setLog((l) => [...l, { q: question }]),
    onSuccess: (r) => setLog((l) => l.map((x, i) => (i === l.length - 1 ? { ...x, r } : x))),
    onError: (e) => setLog((l) => l.map((x, i) => (i === l.length - 1 ? { ...x, err: (e as Error).message } : x))),
  });
  const send = (text: string) => { if (text.trim().length >= 3 && !m.isPending) { m.mutate(text.trim()); setQ(""); } };

  return (
    <Sheet>
      <SheetTrigger className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-primary/40 bg-primary/10 px-2.5 text-xs font-medium text-primary hover:bg-primary/20" data-testid="assistant-open">
        <Bot className="size-4" /> <span className="hidden sm:inline">FloodWise Asistan</span>
      </SheetTrigger>
      <SheetContent side="right" className="flex w-full flex-col gap-3 bg-popover p-4 sm:max-w-md">
        <div>
          <SheetTitle>FloodWise Asistan</SheetTitle>
          <SheetDescription>Uygulamadaki kayıtlara dayanarak yanıt verir; kaynak gösterir, varsayımları ayırır.</SheetDescription>
        </div>
        <Notice tone="warning">Acil durumda 112&apos;yi arayın. Asistan hayati güvenlik talimatı vermez ve belediye yetkisi taşımaz.</Notice>
        <div className="flex-1 space-y-4 overflow-y-auto pr-1" aria-live="polite">
          {log.length === 0 && (
            <div className="flex flex-wrap gap-1.5">
              {EXAMPLES.map((e) => <button key={e} onClick={() => send(e)} className="rounded-full border border-border px-2.5 py-1 text-left text-xs hover:bg-accent">{e}</button>)}
            </div>
          )}
          {log.map((x, i) => (
            <div key={i} className="space-y-2">
              <div className="ml-auto w-fit max-w-[85%] rounded-lg bg-primary/15 px-3 py-1.5 text-sm">{x.q}</div>
              <div className="rounded-lg border border-border bg-card p-3" data-testid="assistant-reply">
                {x.r ? <ReplyView r={x.r} /> : x.err ? <span className="text-sm text-critical">{x.err}</span> : <Spinner />}
              </div>
            </div>
          ))}
        </div>
        <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); send(q); }}>
          <input aria-label="Soru" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Sorunuzu yazın…" className="h-9 flex-1 rounded-lg border border-input bg-secondary px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring" />
          <Button type="submit" size="icon" aria-label="Gönder" disabled={m.isPending}><Send className="size-4" /></Button>
        </form>
      </SheetContent>
    </Sheet>
  );
}
