"use client";

import { FloodMap } from "./flood-map";

export function HeroMap() {
  return <FloodMap interactive={false} visible={{ districts: true, waterways: true, events: true, roads: true }} />;
}
