# Architecture

## Stack
Next.js 16 App Router (Cache Components), React 19, TypeScript, Tailwind v4 + shadcn (Base UI), TanStack Query, React Hook Form + zod (schemas shared client/server), MapLibre GL + CARTO Dark Matter basemap, Recharts, `node:sqlite`, optional `@anthropic-ai/sdk`.

## Layout
```
scripts/ingest*.mjs        one-off fetchers → data/snapshots/*.json (committed, dated)
src/lib/domain/            pure logic, no I/O — unit tested
  rainfall, risk, simulation, hydraulics, pumps, photo, reports-ai, report, assistant, geo
src/lib/server/            db (schema + seed), snapshots loader, repo, risk-service, auth (demo role cookie, rate limits)
src/app/api/**/route.ts    JSON API; every write validates with zod and recomputes results server-side
src/app/(app)/*            pages (client components, data via TanStack Query)
src/data/seed.ts           curated historical events + Wilo products with source URLs
tests/{unit,integration,e2e}
```

## Data flow
1. `ingest` snapshots OSM, Copernicus DEM (Open-Meteo), ERA5 → JSON with `fetched_at`.
2. On first DB open: seed events, products, rainfall rows, demo records; run `runAnalysis` for 3 study areas.
3. `risk-service` computes the screening grid per district once (memoized): TPI depression, flatness, distance to OSM waterways, lowland percentile → weighted 0–100 index; 200 seeded weight perturbations → top-decile stability.
4. Pages read the API; simulations run client-side for interactivity and are recomputed on the server when saved.

## Security & privacy
- Roles: `fw_role` HttpOnly cookie set by a demo switch. **Not authentication.** All operator endpoints check it server-side; production needs real SSO.
- Citizen reports: zod validation, 5 per 10 min per IP (in-memory), JPEG/PNG magic-byte check, EXIF/metadata stripping, server-generated filenames, photos only via operator endpoint with `nosniff`. Public view: verified/resolved only, coordinates rounded to ~100 m, no notes or names.
- AI suggestions on reports (category, missing info, duplicates) never change status; unverified reports are never training labels.

## Deployment
- **Docker / VM (recommended):** `docker compose up --build`. DB and uploads live in volumes.
- **Vercel/serverless:** works read-only for demo, but SQLite and uploads on the function filesystem are ephemeral — writes are lost. Use Postgres (below) before deploying there.
- Set `ANTHROPIC_API_KEY` only on the server.

## PostGIS upgrade path
`node:sqlite` stores geometry as GeoJSON text and does geometry ops in JS (`src/lib/domain/geo.ts`).
`shortcut: SQLite + JS geometry is fine for 2 districts / ~1k cells; move to PostGIS for city-wide grids or concurrent writers.`
Steps: replicate the schema in `src/lib/server/db.ts` with `geometry(Geometry, 4326)` columns, replace `repo.ts` queries 1:1 (they are plain SQL), move `pointInGeometry`/distance calls to `ST_Contains`/`ST_Distance` on `geography`.

## Known limitations
- Grid spacing ~550 m on a 90 m DEM: area screening only; no building/street-scale output.
- ERA5 reanalysis underestimates convective rainfall (2023 event: ~5 mm in ERA5 vs. reported extreme local totals).
- Only 2 verified events → no supervised model, no validation metrics.
- Simulator: lumped storage, rational method, no routing/backwater/network hydraulics; pump flow independent of head.
- Wilo: no numeric pump curves; Qmax/Hmax are curve endpoints only. Some families have no verified Q/H.
- Rate limiting and geocode cache are in-memory (single instance).
- No live data of any kind.
