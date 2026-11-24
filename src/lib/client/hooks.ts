"use client";
import { useQuery } from "@tanstack/react-query";
import { api } from "./api";
import type { HistoricalEvent, WiloProduct } from "@/lib/domain/types";
import type { AnalysisExplanation, AnalysisUncertainty } from "@/lib/domain/report";

export interface Meta {
  demoMode: boolean; llmConfigured: boolean; historicalEvents: number; verifiedEvents: number; citizenReports: number; demoReports: number;
  pendingReports: number; verifiedReports: number; studyLocations: number; analyses: number; scenarios: number; generatedReports: number;
  investigationCandidates: number; snapshots: { key: string; available: boolean; source: string | null; fetched_at: string | null; license: string | null }[];
}
export interface LocationItem { id: string; name: string; district: string; kind: string; geographic_precision: string; provenance: string; notes: string | null; geometry: { type: string; coordinates: unknown } }
export interface Analysis { id: string; location_id: string; model_version: string; risk_index: number; created_at: string; input_snapshot: Record<string, unknown>; explanation: Omit<AnalysisExplanation, "candidates"> & { candidates: (AnalysisExplanation["candidates"][number] & { elev: number; slopeDeg: number; tpiM: number; waterDistM: number; factors: Record<string, number>; stabilityLabel: string; band: string; district_id: string })[]; historicalEvidence: { id: string; date: string; title: string; precision: string }[] }; uncertainty: AnalysisUncertainty & { completenessRatio: number } }
export interface Scenario { id: string; location_id: string; scenario_name: string; kind: string; assumptions: Record<string, unknown>; results: Record<string, number | null>; provenance: string; created_at: string }
export interface LocationDetail extends LocationItem { analysis: Analysis | null; events: HistoricalEvent[]; scenarios: Scenario[]; climatology: { district_id: string; source?: string; grid?: { lat: number; lon: number }; annualMax?: { year: number; max_mm: number; date: string; complete: boolean }[] }[] }

export const useMeta = () => useQuery({ queryKey: ["meta"], queryFn: () => api<Meta>("/api/meta") });
export const useLocations = () => useQuery({ queryKey: ["locations"], queryFn: () => api<LocationItem[]>("/api/locations") });
export const useLocation = (id: string) => useQuery({ queryKey: ["location", id], queryFn: () => api<LocationDetail>(`/api/locations/${id}`), enabled: !!id });
export const useEvents = () => useQuery({ queryKey: ["events"], queryFn: () => api<HistoricalEvent[]>("/api/events") });
export const useProducts = () => useQuery({ queryKey: ["products"], queryFn: () => api<WiloProduct[]>("/api/products") });
