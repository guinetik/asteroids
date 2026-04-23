# Radiation Zone Protection — Implementation Plan

**Date:** 2026-04-23
**Spec:** [docs/superpowers/specs/2026-04-23-radiation-zones-design.md](../specs/2026-04-23-radiation-zones-design.md)

## Phase 1 — Zone-based protection (this commit)

### Step 1 — Schema: add three boundaries to `ship-health.json`

```json
{
  "radiationZone1Boundary": 0.55,
  "radiationZone2Boundary": 0.35,
  "radiationZone3Boundary": 0.25
}
```

Catalog units; pre-`ORBIT_SCALE` (consistent with `hotBoundary` / `heatZone2Boundary`).
Zone 3 boundary is aligned with `heatZone3Boundary` (`0.25`) so the lethal heat
and lethal radiation bands engage at the same sun distance — once you're "close
to the Sun" both damage paths fire together, matching player intuition.

### Step 2 — `src/lib/shipHealth.ts`

1. Extend `ShipHealthConfig` with the three new fields (TSDoc each).
2. Drop `radiationProximity` from `tick()`. Replace `radiationArmor: number`
   with `radiationLevel: number` (default `0`).
3. Add a private helper `getRadiationZone(sunDistance: number): 0 | 1 | 2 | 3`.
4. Add a private helper `getRadiationArmor(level: number, zone: number): number`
   returning `0`, `0.5`, or `1` per the tiered table in the spec.
5. Damage formula:
   ```
   radDamage = maxRadiationDamage * (zone / 3) * armor * dt
   ```
6. `getDeathCause()` reads from a recorded "last active radiation zone" field
   instead of `radiationProximity`.
7. Update `damageIntensity` → use `(zone/3) * (1 - armor)` so the vignette
   intensity reflects the actual damage being taken (no flicker when immune).

### Step 3 — `src/views/MapViewController.ts`

Replace the radiation arg passed into `tick()`:

```diff
- getCurrentUpgradeValue('shuttleRadiationResistance'),
+ CURRENT_PLAYER_UPGRADE_LEVELS.shuttleRadiationResistance ?? 0,
```

Also drop the now-unused `radiationProximity` argument from the `tick()` call site.

### Step 4 — `src/data/upgrades.json`

Update `shuttleRadiationResistance.description` to:

> Lvl 1: survives Mercury orbit. Lvl 2: survives between Mercury and Sun. Lvl 3: survives Sun proximity.

`valuesByLevel` retained for catalog parity but no longer consumed by ship health.

### Step 5 — Tests

`src/lib/__tests__/shipHealth.spec.ts`:

1. Update `config` literal with the three new boundaries.
2. Replace the entire `describe('radiation damage')` and `describe('radiationArmor upgrade')`
   blocks with zone-based coverage:
   - Zone 0 (no damage)
   - Zone 1 / Lvl 0 → 5 dmg/s
   - Zone 1 / Lvl 1 → immune
   - Zone 2 / Lvl 1 → 5 dmg/s (partial)
   - Zone 2 / Lvl 2 → immune
   - Zone 3 / Lvl 2 → 7.5 dmg/s (partial)
   - Zone 3 / Lvl 3 → immune
   - Death cause = `'Radiation Exposure'`
3. Update `describe('healing')` and `describe('death')` blocks to use the new
   parameter shape (sunDistance + radiationLevel) instead of proximity.

`src/lib/__tests__/mapThermalZones.spec.ts`: just add the three new fields to
the test config so it type-checks.

### Step 6 — Verify

- `bun run type-check`
- `bun run lint`
- `bun run test:unit`

## Phase 2 — UI + Audio (this commit)

Phase 2 mirrors the gravity-warning HUD pattern verbatim: a per-frame state
push from `MapViewController` to a new HUD banner component, plus a single
looping audio handle owned by `ShuttleAudioDirector`. No new infrastructure.

### Step 1 — `src/lib/ShuttleTelemetry.ts`

Add `RadiationWarningState` next to `GravityWarningState`:

```ts
export interface RadiationWarningState {
  zone: 0 | 1 | 2 | 3
  damageActive: boolean
  visible: boolean
}
```

### Step 2 — `src/components/RadiationWarning.vue`

Copy of `GravityWarning.vue` with three changes:

1. Tier mapping is `zone` based (1 → caution, 2 → danger, 3 → critical) rather
   than continuous proximity.
2. Headline includes `damageActive` suffix (`HULL EXPOSED` vs `SHIELDING NOMINAL`)
   so players can distinguish "I'm safely shielded inside this zone" from
   "I am actively losing HP".
3. Uses the radiation-themed glyph (`☢`) and rose/amber palette to keep the two
   warnings visually distinct.

### Step 3 — `src/assets/css/main.css`

Add `.radiation-warning{,-caution,-danger,-critical}` mirroring the gravity
warning rules but anchored slightly higher (`top-[4.25rem]`) so the two banners
can both be visible without overlap.

### Step 4 — `src/audio/audioManifest.ts`

Register `sfx.geiger`:

```ts
'sfx.geiger': {
  id: 'sfx.geiger',
  src: '/sound/sfx.geiger.mp3',
  category: 'sfx',
  load: 'lazy',
  playback: 'single-instance',
  volume: 0.55,
  effect: 'none',
}
```

Append `'sfx.geiger'` after `'sfx.geyser'` in `AUDIO_SOUND_IDS` and in the
audio manifest spec ordering test.

### Step 5 — `src/audio/ShuttleAudioDirector.ts`

Add a `radiationLoop: AudioHandle = null` field plus `tickRadiationTelemetry`:

```ts
tickRadiationTelemetry(damageActive: boolean): void {
  if (!this.active) return
  if (damageActive) {
    if (this.radiationLoop === null) {
      this.radiationLoop = this.audio.play('sfx.geiger', { loop: true })
    }
    return
  }
  if (this.radiationLoop !== null) {
    this.radiationLoop.stop()
    this.radiationLoop = null
  }
}
```

Tear down the handle in `notifyShuttleDestroyed` and `tearDownLoops`.

### Step 6 — `src/views/MapViewController.ts`

1. Add `onRadiationWarning: ((state: RadiationWarningState) => void) | null`.
2. After every `shipHealth.tick`, snapshot `radiationZone` /
   `isTakingRadiationDamage` and forward to both the HUD callback and
   `shuttleAudio.tickRadiationTelemetry`.
3. Mirror with a "clear" emit on the else branch (sim frozen / shuttle dead)
   so the banner and loop both go silent the moment the player exits the band.

### Step 7 — `src/views/MapView.vue`

1. Reactive `radiationWarning` state mirroring `gravityWarning`.
2. `viewController.onRadiationWarning = (w) => Object.assign(radiationWarning, w)`.
3. `<RadiationWarning>` rendered alongside `<GravityWarning>` with the same
   visibility guards (`!mapOverlay.visible && !mapIntro.controlsLocked && …`).

### Step 8 — Verify

- `bun run type-check`
- `bun run lint`
- `bun run test:unit` — all 1517 tests still green; `audioManifest.spec.ts`
  ordering assertion now includes `'sfx.geiger'`.

### Out of Scope (future)

- Radiation zone bands in `mapThermalZones.ts` overlay (orange tint).
- Per-zone geiger cadence modulation (rate-shifting the loop with zone severity).
- Player-suit Geiger SFX (HUD-internal, post-EVA scope).
