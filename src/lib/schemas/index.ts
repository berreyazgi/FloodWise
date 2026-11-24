/** Shared zod schemas — used by forms (client) and API validation (server). */
import { z } from "zod";
import { CATEGORIES } from "@/lib/domain/reports-ai";

export const SimInputSchema = z.object({
  areaM2: z.number().positive().max(50_000_000),
  runoffC: z.number().min(0).max(1),
  rainMmPerH: z.array(z.number().min(0).max(300)).min(1).max(500),
  rainStepMin: z.number().int().min(5).max(180),
  initialStorageM3: z.number().min(0),
  storageCapacityM3: z.number().min(0),
  pumpCount: z.number().int().min(0).max(100),
  pumpFlowM3h: z.number().min(0).max(20_000),
  dischargeLimitM3h: z.number().min(0).nullable(),
  durationH: z.number().positive().max(168),
  dtMin: z.number().positive().max(60),
  headM: z.number().min(0).max(200).nullish(),
  efficiency: z.number().min(0.05).max(1).nullish(),
});

export const PlanInputSchema = z.object({
  volumeM3: z.number().positive().max(10_000_000),
  targetHours: z.number().positive().max(240),
  pumpCount: z.number().int().min(1).max(50),
  staticHeadM: z.number().min(0).max(150),
  pipeLengthM: z.number().min(0).max(10_000),
  pipeDiameterMm: z.number().min(20).max(2000),
  roughnessMm: z.number().min(0).max(5),
  minorLossK: z.number().min(0).max(100),
  waterType: z.enum(["clear", "slightly_dirty", "sandy", "sewage"]),
  intervention: z.enum(["temporary", "permanent"]),
  hasPower: z.boolean(),
  hasBackupPower: z.boolean(),
  downstreamCapacityKnown: z.boolean(),
  hasDebris: z.boolean(),
});

export const CitizenReportSchema = z.object({
  district: z.enum(["Başakşehir", "Küçükçekmece", "Diğer"], { message: "İlçe seçin" }),
  neighborhood: z.string().trim().max(80).optional().or(z.literal("")),
  lon: z.number().min(28.4).max(29.5).nullable(),
  lat: z.number().min(40.8).max(41.4).nullable(),
  category: z.enum(Object.keys(CATEGORIES) as [keyof typeof CATEGORIES, ...(keyof typeof CATEGORIES)[]], { message: "Kategori seçin" }),
  observed_at: z.string().min(1, "Gözlem zamanı gerekli"),
  description: z.string().trim().min(15, "Açıklama en az 15 karakter olmalı").max(2000),
  water_depth_cm: z.number().int().min(0).max(500).nullable(),
  building_affected: z.boolean(),
  road_affected: z.boolean(),
  display_name: z.string().trim().max(40).optional().or(z.literal("")),
  consent: z.literal(true, { message: "Veri kullanım onayı gerekli" }),
});
export type CitizenReportInput = z.infer<typeof CitizenReportSchema>;
