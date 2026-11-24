import "server-only";
import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { seedIfEmpty } from "./seed";

// shortcut: SQLite (node:sqlite, zero native deps) with GeoJSON text geometry; upgrade to PostGIS when
// spatial queries move server-side (schema maps 1:1, see docs/ARCHITECTURE.md).
const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY, role TEXT NOT NULL CHECK (role IN ('citizen','operator')),
  display_name TEXT NOT NULL, email TEXT, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS locations (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, district TEXT NOT NULL, neighborhood TEXT,
  geometry TEXT NOT NULL, geographic_precision TEXT NOT NULL, provenance TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'study_area', notes TEXT, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS historical_events (
  id TEXT PRIMARY KEY, location_id TEXT REFERENCES locations(id), event_date TEXT NOT NULL,
  description TEXT NOT NULL, severity_observed TEXT, source_url TEXT NOT NULL,
  verified_status TEXT NOT NULL, geometry TEXT, data_quality TEXT, data TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS ix_events_date ON historical_events(event_date);
CREATE TABLE IF NOT EXISTS rainfall_observations (
  id INTEGER PRIMARY KEY AUTOINCREMENT, location_id TEXT NOT NULL REFERENCES locations(id),
  observed_at TEXT NOT NULL, rainfall_mm REAL, source TEXT NOT NULL, observation_type TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS ix_rain_loc_time ON rainfall_observations(location_id, observation_type, observed_at);
CREATE TABLE IF NOT EXISTS citizen_reports (
  id TEXT PRIMARY KEY, location_id TEXT REFERENCES locations(id), district TEXT NOT NULL, neighborhood TEXT,
  lon REAL, lat REAL, reported_at TEXT NOT NULL, observed_at TEXT, category TEXT NOT NULL,
  description TEXT NOT NULL, photo_path TEXT, water_depth_cm INTEGER, building_affected INTEGER NOT NULL,
  road_affected INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'pending', verification_notes TEXT,
  provenance TEXT NOT NULL, ai_suggestions TEXT, display_name TEXT);
CREATE INDEX IF NOT EXISTS ix_reports_status ON citizen_reports(status);
CREATE TABLE IF NOT EXISTS risk_analyses (
  id TEXT PRIMARY KEY, location_id TEXT NOT NULL REFERENCES locations(id), model_version TEXT NOT NULL,
  risk_index REAL NOT NULL, input_snapshot TEXT NOT NULL, explanation TEXT NOT NULL, uncertainty TEXT NOT NULL,
  created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS wilo_products (
  id TEXT PRIMARY KEY, model_name TEXT NOT NULL, category TEXT NOT NULL, specifications TEXT NOT NULL,
  application TEXT NOT NULL, documentation_url TEXT NOT NULL, verification_status TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS intervention_scenarios (
  id TEXT PRIMARY KEY, location_id TEXT NOT NULL REFERENCES locations(id), scenario_name TEXT NOT NULL,
  kind TEXT NOT NULL, assumptions TEXT NOT NULL, product_id TEXT REFERENCES wilo_products(id),
  results TEXT NOT NULL, provenance TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS generated_reports (
  id TEXT PRIMARY KEY, analysis_id TEXT REFERENCES risk_analyses(id), location_id TEXT NOT NULL,
  report_type TEXT NOT NULL, content TEXT NOT NULL, created_at TEXT NOT NULL, file_path TEXT);
CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT, at TEXT NOT NULL, actor TEXT NOT NULL, action TEXT NOT NULL, target TEXT);
`;

let db: DatabaseSync | null = null;

export function getDb(): DatabaseSync {
  if (db) return db;
  const file = process.env.DATABASE_PATH || path.join(process.cwd(), "data", "floodwise.db");
  if (file !== ":memory:") mkdirSync(path.dirname(file), { recursive: true });
  db = new DatabaseSync(file);
  db.exec("PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;");
  db.exec(SCHEMA);
  seedIfEmpty(db);
  return db;
}

/** Test helper: drop the singleton so a fresh DATABASE_PATH is used. */
export function resetDbForTests() { db?.close(); db = null; }

export { json, nowIso, newId } from "./util";
