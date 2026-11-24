# FloodWise İstanbul

AI-assisted urban flood-risk screening and Wilo pump-deployment **pre-feasibility** prototype — Water AI Hackathon 2026.
Pilot area: **Başakşehir & Küçükçekmece** (Ayamama corridor). UI is Turkish.

> Prototype decision-support tool. Not a certified flood forecast, early-warning, emergency or pump-engineering system. Not endorsed by İBB, İSKİ or Wilo.

## Quick start

Requires **Node ≥ 22.5** (uses built-in `node:sqlite`).

```bash
npm install            # postinstall copies the MapLibre worker into public/
cp .env.example .env   # optional: ANTHROPIC_API_KEY for the LLM-phrased assistant
npm run dev            # http://localhost:3000
```

The SQLite DB (`data/floodwise.db`) is created and seeded on first request. `npm run db:reset` deletes it so it reseeds.

Docker:

```bash
docker compose up --build   # http://localhost:3000, DB + uploads in named volumes
```

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` / `build` / `start` | Next.js 16 |
| `npm test` | Vitest: 35 unit + 10 integration tests (route handlers on in-memory DB) |
| `npm run test:e2e` | Playwright (uses installed Google Chrome; `PW_CHANNEL=chromium` after `npx playwright install chromium`). Reuses a dev server on `E2E_PORT` (default 3100) or starts one. Writes test records into the dev DB. |
| `npm run ingest` | Re-fetches all real data snapshots into `data/snapshots/` (~15 min, rate-limited public APIs), then `npm run db:reset` |
| `npm run lint` | ESLint |

## What is real, estimated, or synthetic

Every record carries a provenance tag: `verified`, `estimated`, `user_reported`, `synthetic_demo`.

| Data | Status | Source |
|---|---|---|
| District boundaries, waterways, water bodies | real, snapshot 2026-11-24 | OpenStreetMap (Nominatim, Overpass) |
| Elevation grid (~550 m spacing sampled from 90 m DEM) | real | Copernicus GLO-90 via Open-Meteo Elevation API |
| Rainfall 1995–2025 daily, event-window hourly | real **reanalysis** (not gauges) | ERA5 via Open-Meteo archive |
| Historical events (09.09.2009, 05.09.2023) | verified, with sources; district / corridor precision only — no invented coordinates | Wikipedia, Bianet, Al Jazeera, NASA, Cumhuriyet, İPA reports |
| Wilo products (7) | manufacturer pages / dealer copies of datasheets; Q/H left empty where unverified | wilo.com |
| Screening index, simulations, hydraulics | estimated (model output) | this app |
| 3 citizen reports, 3 scenarios, design-storm presets | `synthetic_demo`, labelled everywhere | seed |

Honesty notes:
- **No ML model.** Only 2 verified events, both district-scale → no cell-level labels. The app uses a transparent weighted screening index (`screening-index-v1`) with seeded weight-sensitivity analysis, and shows no accuracy metrics.
- ERA5 shows ~43 mm for 2009 and only ~5 mm (Başakşehir) for 2023 — reanalysis smooths convective cells. This is shown in the UI, not hidden.
- Building/street-scale prediction is refused: *"Bu konum için bina veya cadde ölçeğinde güvenilir tahmin üretmeye yeterli veri bulunmuyor."*
- Pump screening never says "suitable"; it returns *investigate / data missing / not recommended* plus *"Kesin pompa seçimi için ilave hidrolik ve saha verileri gereklidir."*

## Needs external data / API access to go further

- İSKİ drainage network, manholes, pump stations, capacities (layers are present but disabled in the map with that reason)
- AKOM / İSKİ geocoded flood complaint history → would enable supervised ML with spatial block CV
- MGM / AKOM gauge or radar rainfall (ERA5 underestimates convective events)
- Higher-resolution DEM (1–5 m LiDAR) for street-scale ponding
- Wilo numeric pump curves (Wilo Select / datasheets) for operating-point checks
- Real authentication (e-Devlet / municipal SSO); the role switch is a demo cookie only
- Live sensor/SCADA feeds — **none are integrated**

## Optional LLM

With `ANTHROPIC_API_KEY`, FloodWise Asistan rephrases the deterministic, citation-backed answer using Claude (`claude-opus-5-5`, override with `ANTHROPIC_MODEL`). Server-side fallbacks are enabled, so if the primary model declines a request, a fallback model may answer it instead. Without a key, or on any error, the deterministic answer is shown. Life-safety questions always get the fixed "call 112" response.

## Docs

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — structure, data flow, deployment, PostGIS upgrade path, known limitations
- [docs/DEMO.md](docs/DEMO.md) — 5-minute demo script
