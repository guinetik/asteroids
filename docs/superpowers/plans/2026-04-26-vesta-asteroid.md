# Vesta Asteroid Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add 4 Vesta as a playable asteroid, normalize its GLB asset, and make it available from Mars, Jupiter, and Saturn at difficulty 3-5.

**Architecture:** Follow the existing data-driven asteroid pattern. The normalized GLB lives under `public/models/asteroids/`, asteroid facts live in `src/data/asteroids/vesta.json`, and mission selection uses the existing `planetIds` host filter.

**Tech Stack:** Bun scripts, glTF Transform asset pipeline, TypeScript, Vite static JSON imports, Vitest.

---

## Files

- Create `public/models/asteroids/vesta.glb` by running `bun run models:asteroids:normalize` with `ASTEROID_ONLY=vesta`.
- Create `src/data/asteroids/vesta.json`.
- Modify `src/lib/asteroids/catalog.ts` to import and include Vesta.
- Modify `src/data/asteroids/difficulty-map.json` to add Vesta difficulty and host availability.
- Modify `src/lib/asteroids/__tests__/catalog.spec.ts` to include `vesta`.
- Modify `src/lib/missions/__tests__/asteroidMissionGenerator.spec.ts` to cover Vesta host selection.

## Steps

- [ ] Run the normalization pipeline for `3d/asteroids/vesta.glb`.
- [ ] Add `src/data/asteroids/vesta.json` from the approved spec.
- [ ] Import `vestaData` in `src/lib/asteroids/catalog.ts` and include it in `ASTEROID_CATALOG`.
- [ ] Add `{ "asteroidId": "vesta", "minDifficulty": 3, "maxDifficulty": 5, "planetIds": ["mars", "jupiter", "saturn"] }` to `src/data/asteroids/difficulty-map.json`.
- [ ] Add `vesta` to the shared catalog test ID list.
- [ ] Add deterministic mission selector tests for Mars, Jupiter, Saturn, Earth exclusion, and no-host fallback.
- [ ] Run `bun run lint`, `bun run type-check`, and `bun run test:unit`.

## Self-Review

- Spec coverage: asset pipeline, Vesta data, catalog, difficulty, host availability, and tests are covered.
- Placeholder scan: no placeholders remain.
- Type consistency: the plan uses the existing `planetIds` selector behavior added for Eros.
