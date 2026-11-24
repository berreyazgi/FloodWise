"use client";

import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ReferenceLine, ResponsiveContainer, Scatter, ComposedChart, Tooltip, XAxis, YAxis, Area } from "recharts";

const AXIS = { stroke: "#94A3B8", fontSize: 11 };
const GRID = <CartesianGrid stroke="rgba(148,163,184,0.12)" vertical={false} />;
const TIP = { contentStyle: { background: "#10243A", border: "1px solid rgba(148,163,184,0.25)", borderRadius: 8, fontSize: 12 }, labelStyle: { color: "#F8FAFC" } };

export function AnnualMaxChart({ data }: { data: { year: number; max_mm: number; complete: boolean }[] }) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} margin={{ left: -10, right: 8, top: 8 }}>
        {GRID}
        <XAxis dataKey="year" tick={AXIS} tickLine={false} interval={4} />
        <YAxis tick={AXIS} tickLine={false} axisLine={false} unit=" mm" width={60} />
        <Tooltip {...TIP} formatter={(v) => [`${v} mm`, "Yıllık en yüksek günlük yağış"]} />
        <ReferenceLine x={2009} stroke="#F59E0B" strokeDasharray="3 3" label={{ value: "2009", fill: "#F59E0B", fontSize: 10, position: "top" }} />
        <ReferenceLine x={2023} stroke="#F59E0B" strokeDasharray="3 3" label={{ value: "2023", fill: "#F59E0B", fontSize: 10, position: "top" }} />
        <Bar dataKey="max_mm" fill="#38BDF8" radius={[3, 3, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function HourlyRainChart({ series }: { series: { name: string; points: { t: string; mm: number | null }[] }[] }) {
  const merged = series[0]?.points.map((p, i) => Object.fromEntries([["t", p.t.slice(5, 13).replace("T", " ")], ...series.map((s) => [s.name, s.points[i]?.mm ?? null])])) ?? [];
  const colors = ["#38BDF8", "#22D3EE", "#F59E0B"];
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={merged} margin={{ left: -10, right: 8, top: 8 }}>
        {GRID}
        <XAxis dataKey="t" tick={AXIS} tickLine={false} interval={11} />
        <YAxis tick={AXIS} tickLine={false} axisLine={false} unit=" mm" width={55} />
        <Tooltip {...TIP} />
        <Legend wrapperStyle={{ fontSize: 11 }} />
        {series.map((s, i) => <Bar key={s.name} dataKey={s.name} fill={colors[i % 3]} />)}
      </BarChart>
    </ResponsiveContainer>
  );
}

export function StorageChart({ data, keys }: { data: Record<string, number>[]; keys: { key: string; label: string; color: string; dash?: string }[] }) {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <LineChart data={data} margin={{ left: 0, right: 8, top: 8 }}>
        {GRID}
        <XAxis dataKey="tH" type="number" domain={["dataMin", "dataMax"]} tick={AXIS} tickLine={false} unit=" sa" />
        <YAxis tick={AXIS} tickLine={false} axisLine={false} width={70} unit=" m³" />
        <Tooltip {...TIP} labelFormatter={(v) => `t = ${v} sa`} formatter={(v) => `${Number(v).toLocaleString("tr-TR")} m³`} />
        <Legend wrapperStyle={{ fontSize: 11 }} />
        {keys.map((k) => <Line key={k.key} dataKey={k.key} name={k.label} stroke={k.color} strokeDasharray={k.dash} dot={false} strokeWidth={2} isAnimationActive={false} />)}
      </LineChart>
    </ResponsiveContainer>
  );
}

export function FlowChart({ data }: { data: { tH: number; inflowM3h: number; outflowM3h: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <ComposedChart data={data} margin={{ left: 0, right: 8, top: 8 }}>
        {GRID}
        <XAxis dataKey="tH" type="number" domain={["dataMin", "dataMax"]} tick={AXIS} tickLine={false} unit=" sa" />
        <YAxis tick={AXIS} tickLine={false} axisLine={false} width={70} unit=" m³/h" />
        <Tooltip {...TIP} labelFormatter={(v) => `t = ${v} sa`} />
        <Legend wrapperStyle={{ fontSize: 11 }} />
        <Area dataKey="inflowM3h" name="Giriş (yüzey akışı)" stroke="#38BDF8" fill="rgba(56,189,248,0.2)" isAnimationActive={false} />
        <Line dataKey="outflowM3h" name="Çıkış (pompa)" stroke="#22C55E" dot={false} strokeWidth={2} isAnimationActive={false} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

/** System curve with the requested duty point; pump Qmax/Hmax shown as curve endpoints only. */
export function SystemCurveChart({ curve, duty, endpoints }: { curve: { q: number; h: number }[]; duty: { q: number; h: number }; endpoints: { name: string; q: number; h: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={240}>
      <ComposedChart margin={{ left: 0, right: 12, top: 8 }}>
        {GRID}
        <XAxis dataKey="q" type="number" tick={AXIS} tickLine={false} unit=" m³/h" domain={[0, "dataMax"]} />
        <YAxis dataKey="h" type="number" tick={AXIS} tickLine={false} axisLine={false} unit=" m" width={50} />
        <Tooltip {...TIP} />
        <Legend wrapperStyle={{ fontSize: 11 }} />
        <Line data={curve} dataKey="h" name="Sistem eğrisi (hesap)" stroke="#38BDF8" dot={false} strokeWidth={2} isAnimationActive={false} />
        <Scatter data={[duty]} dataKey="h" name="İstenen çalışma noktası" fill="#F59E0B" />
        {endpoints.flatMap((e) => [
          <Scatter key={e.name + "q"} data={[{ q: e.q, h: 0 }, { q: 0, h: e.h }]} dataKey="h" name={`${e.name} Qmax/Hmax uçları`} fill="#22C55E" shape="diamond" />,
        ])}
      </ComposedChart>
    </ResponsiveContainer>
  );
}

export function FactorBars({ data }: { data: { label: string; value: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={Math.max(120, data.length * 34)}>
      <BarChart data={data} layout="vertical" margin={{ left: 10, right: 16 }}>
        <XAxis type="number" domain={[0, "dataMax"]} tick={AXIS} tickLine={false} />
        <YAxis type="category" dataKey="label" tick={{ ...AXIS, fill: "#F8FAFC" }} width={170} tickLine={false} axisLine={false} />
        <Tooltip {...TIP} />
        <Bar dataKey="value" name="Katkı" fill="#22D3EE" radius={[0, 3, 3, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
