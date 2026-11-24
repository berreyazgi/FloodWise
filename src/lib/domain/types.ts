export type Provenance = "verified" | "estimated" | "user_reported" | "synthetic_demo";

export const PROVENANCE_LABEL: Record<Provenance, string> = {
  verified: "Doğrulanmış kaynak",
  estimated: "Tahmini / model türevi",
  user_reported: "Vatandaş bildirimi",
  synthetic_demo: "Sentetik demo verisi",
};

export type ReportStatus = "pending" | "under_review" | "verified" | "rejected" | "resolved";
export const REPORT_STATUS_LABEL: Record<ReportStatus, string> = {
  pending: "Beklemede",
  under_review: "İncelemede",
  verified: "Doğrulandı",
  rejected: "Reddedildi",
  resolved: "Çözüldü",
};

export interface SourceRef { title: string; publisher: string; url: string }

export interface HistoricalEvent {
  id: string;
  event_date: string; // ISO date (local)
  time_note: string | null;
  district: string;
  district_ids: string[];
  neighborhood: string | null;
  geographic_precision: "district" | "corridor_approx" | "point";
  rainfall_mm: number | null; // only if verified
  rainfall_note: string | null;
  title: string;
  description: string;
  classification: string;
  consequences: string;
  sources: SourceRef[];
  verified_status: Provenance;
  data_quality: string;
  ingested_at: string;
}

export type WaterType = "clear" | "slightly_dirty" | "sandy" | "sewage";
export const WATER_TYPE_LABEL: Record<WaterType, string> = {
  clear: "Temiz / az kirli su",
  slightly_dirty: "Hafif kirli su (küçük partikül)",
  sandy: "Kum / çakıl içeren su",
  sewage: "Atık su / fekal içerikli",
};

export interface WiloProduct {
  id: string;
  model_name: string;
  family: string;
  category: string;
  application: string;
  water_types: WaterType[];
  installation: ("portable" | "stationary_wet" | "stationary_dry")[];
  submersible: boolean;
  qmax_m3h: number | null;
  hmax_m: number | null;
  power: string | null;
  free_passage_mm: number | null;
  constraints: string[];
  monitoring: string | null;
  documentation_url: string;
  spec_source_url: string | null;
  source_date: string;
  verification_status: "manufacturer_page" | "secondary_datasheet" | "unverified";
  notes: string;
}
