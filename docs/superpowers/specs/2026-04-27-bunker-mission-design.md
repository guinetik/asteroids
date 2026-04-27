# Bunker Mission Design

**Date:** 2026-04-27
**Author:** guinetik
**Status:** Draft — slice 1 spec

## Intent

A new **Bunker** asteroid mission type. Each non-Earth planet's local faction has a secret asteroid bunker, now overrun by viroids. The pilot lands on the asteroid, descends through a hatch, and clears wave-based combat in a dungeon-styled interior before extracting. Genre touchstone is Bloodborne's chalice dungeons — short, hand-built, faction-flavored side-rooms parallel to the main mission flow.

This spec covers the full Bunker mission design but flags an **implementation slice 1** that ships a playable end-to-end experience with the smallest possible interior. Loot chests, switch puzzles, vault defense, free-upgrade rewards, and procedural multi-room dungeons are designed-but-deferred to subsequent slices.

## Scope (slice 1 — this delivery)

- Mission template authoring + giver wiring for four planet factions: Cinderline (Mercury), Lucas Maverick (Venus), Martian Marines (Mars), Jovian Society (Jupiter).
- Surface "bunker hatch" prop + EVA interaction.
- Sub-state in the existing `/level` state machine that swaps the active simulation root from the asteroid surface to a bunker interior.
- Procedurally-built interior (antechamber + corridor + arena) with faction-tinted wireframe-grid walls, all built from primitive Three.js geometry.
- Wave-based combat in the arena — designer-authored skeletons + 1–3 random fill units per wave.
- Exit hatch handoff that returns the player to the surface beside the bunker entrance.
- HUD gating: ObjectiveTracker persists across the scene swap, surface-only overlays (compass, etc.) hide while inside.

## Sliced out (designed, deferred to slice 2/3)

- A damageable vault entity in the arena (defend-target with HP, no regen).
- Loot chests dropping random tradeable items into shuttle inventory.
- Switch puzzles in the antechamber or corridor.
- "Free upgrade not yet installed" reward for completing the bunker.
- Procedurally-generated multi-room dungeon layouts.
- Per-faction wave rosters (slice 1 reuses one shared roster set across all four factions).

## Architecture (locked decisions)

| Decision | Locked answer |
|---|---|
| Bunker interior hosting | Sub-state inside the existing `/level` state machine, isolated `BunkerSceneController`. Asteroid scene root hides; no whole-simulation tear-down, no new Vue route. |
| Mission system fit | New `'bunker'` ObjectiveType inside the existing asteroid mission generator. Single-objective bunker missions reuse the entire pipeline (giver catalog, accept, waypoint, briefing UI, completion bonus, minigame factory). |
| Slice 1 givers | Cinderline, Lucas Maverick, Martian Marines, Jovian Society. Per-giver `planetIds` anchors them to their faction planet. |
| Wave composition | Designer-authored skeleton + 1–3 random fill units per wave (option C from brainstorm). |
| Room layout | Antechamber + corridor + arena (option B from brainstorm). |
| Failure | Pure mission fail → page-reload, reuses Rescue's "all survivors lost" flow. |
| Difficulty mapping | Mission difficulty 1–4 → easy (3 waves), 5–7 → medium (5 waves), 8–10 → hard (7 waves). |
| Player loadout on entry | Carried over verbatim — HP, ammo, charges, consumables unchanged. |

## Player-facing flow

```
[shuttle board at non-Earth planet]
  └─ accept "BUNKER" mission from local faction (Cinderline / Lucas / MMC / Jovian)

[/map]
  └─ fly to asteroid waypoint  →  enter atmosphere

[/level — surface]
  ├─ Lander spawns near hatch on the flat zone
  ├─ Hatch prop sits where Rescue's virus / Exterminate's nest would sit
  ├─ Land lander, exit on EVA, walk to hatch
  └─ Prompt: "[E] DESCEND"
        ↓ (fade ~0.5s)

[/level — bunker-interior sub-state]
  ├─ Player spawns in antechamber, faction-tinted grid walls
  ├─ Arena door closed
  └─ Prompt: "[E] BEGIN ASSAULT"
        ↓ (player presses E → arena door opens, waves start)

[arena — wave loop]
  ├─ HUD: "WAVE 1 OF 5", live enemy count, suit HP
  ├─ ~3s breather between waves; door stays open, no spawns during breather
  ├─ Final wave clears → arena door slams open permanently, antechamber hatch unlocks
  └─ Prompt: "[E] EXTRACT"
        ↓ (fade ~0.5s)

[/level — surface]
  ├─ Player respawned standing right next to the surface hatch
  ├─ Mission step "Clear the bunker" complete
  └─ Standard "return to giver planet for delivery" flow takes over
```

### HUD step list (`ObjectiveTracker`)

1. Travel to the asteroid
2. Land in the bunker zone
3. Enter the bunker
4. Clear the waves *(progress = waves cleared / total)*
5. Extract from the bunker
6. *(implicit, off-asteroid)* Return to the giver planet

### HUD gating in `bunker-interior`

| Overlay | Surface | Bunker |
|---|---|---|
| `ObjectiveTracker` | shown | **shown** (mission steps continue) |
| `FpsHud` (HP, ammo, multitool) | shown | **shown** |
| Helmet visor effect | shown | shown |
| Death/respawn fade | active | active |
| `DebugHud` | active | active |
| `FpsCompass` | shown | **hidden** |
| Low-O₂ warning, asteroid name plate, surface-only chrome | shown | **hidden** |
| Lander HUD / landing warnings | gated by lander state | naturally hidden |
| `BunkerWaveHud` (wave label + counter, new) | hidden | **shown** |

Wiring: a reactive `inBunker = computed(() => state.value === 'bunker-interior')` in `LevelView.vue`; each surface-only overlay's `v-if` gets `&& !inBunker`.

## Mission system integration

### Type changes (`src/lib/missions/types.ts`)

```ts
export type ObjectiveType =
  | 'gather'
  | 'exterminate'
  | 'rescue'
  | 'survey'
  | 'photometry'
  | 'collect'
  | 'bunker' // new

export interface BunkerScalableParams {
  type: 'bunker'
  // No per-template knobs in slice 1 — wave count is purely a function of
  // rolled mission difficulty (band: 1–4 / 5–7 / 8–10 → 3 / 5 / 7 waves).
}

export interface ConcreteObjective {
  // ... existing fields ...
  /** For bunker: number of waves to clear, stamped from rolled difficulty band. */
  waveCount?: number
}

export interface MissionGiverTemplate {
  // ... existing fields ...
  /** Optional planet-id allowlist. When set, this template only rolls when the
   *  asteroid mission is generated at one of these planets. Templates without
   *  planetIds remain globally available (current default behavior). */
  planetIds?: string[]
}
```

### Giver authoring

Four giver entries — three new files plus an in-place extension. All bunker pools use the `planetIds` filter so they only post at their faction's planet.

| File | Giver id | Anchored planet | objectiveTypes | Templates |
|---|---|---|---|---|
| `src/data/missions/givers/cinderline.json` *(new)* | `cinderline` | `mercury` | `['bunker']` | 1 bunker template — voice = ash-and-ritual ("a seat will be kept", "the work"). Lore alignment with `src/data/contracts/the-cinderline.json`. |
| `src/data/missions/givers/lucas-maverick.json` *(new)* | `lucas-maverick` | `venus` | `['bunker']` | 1 bunker template — voice = trading-floor ("ante up", "house rule", "fly clean"). Lore alignment with `src/data/contracts/venusian-zeppelin-trade-loop.json`. Establishes Venus as a new asteroid-mission-giving planet. |
| `src/data/missions/givers/martian-marines-bunker.json` *(new)* | `martian-marines-bunker` | `mars` | `['bunker']` | 1 bunker template — voice = clipped MMC tone, parallel to but separate from the existing `martian-marines` turret-mining giver to keep concerns split. |
| `src/data/missions/givers/jovian-society.json` *(extend in place)* | `jovian-society` | n/a giver-level (kept global for photometry); per-template `planetIds: ['jupiter']` for bunker entries | `['photometry', 'bunker']` | Append 1 bunker template with `planetIds: ['jupiter']`. Photometry templates remain global. |

### Generator changes (`src/lib/missions/asteroidMissionGenerator.ts`)

1. **Per-template `planetIds` filter.** Inside the per-giver template-selection loop, add a check: if `template.planetIds` is set and does not include the host planet id, skip the template. Templates without `planetIds` are unaffected (current default).
2. **Bunker objective materialization.** Add a switch arm that picks the difficulty band (1–4 / 5–7 / 8–10) and stamps `waveCount` (3 / 5 / 7) on the `ConcreteObjective`.
3. **Venus pool.** Today no givers anchor at Venus; with `lucas-maverick.json` shipped, the existing pool-construction logic naturally picks him up — no special-case needed.

### Reward & delivery

Standard asteroid-mission pipeline, no new economy code. Per-objective reward range × difficulty interpolation + completion bonus, exactly as gather/rescue/exterminate behave today.

### Minigame factory dispatch

Whichever level-side facade dispatches by `objective.type` today (e.g. `LevelMinigameFacade`) gets one new branch: `case 'bunker': return BunkerMinigame.create(...)`.

## Code architecture

Three new layers, mirroring how Rescue is split:

### Pure-domain lib — `src/lib/bunker/`

No Three.js, no Vue. Fully unit-testable.

- **`bunkerWaveSchedule.ts`** — given `(tier: 'easy' | 'medium' | 'hard', waveIndex, seed)` returns the wave roster. Loads authored skeletons from `src/data/missions/bunker-waves.json` (Vite static import) and applies the fill-roll. Pure function.
- **`bunkerSceneState.ts`** — sub-FSM for the interior:
  ```
  entering → antechamber-idle → wave-active ⇄ wave-breather → final-clear → exit-prompt → exiting
  ```
  Owns the breather and fade timers, emits transition events. No rendering deps.
- **`__tests__/`** — roster determinism, FSM transitions, difficulty-band → tier mapping, fill-roll bounds.

### Three.js layer — `src/three/bunker/`

- **`BunkerSceneController.ts`** — owns one root `THREE.Group`. Children: `wallsRoot`, `lightsRoot`, `propsRoot` (hatch + arena door), `enemiesRoot`. API: `activate(scene, factionTint)`, `tick(dt, player)`, `deactivate()`, `dispose()`. Holds the bunker-side `EnemyDirector` instance — separate from any surface director.
- **`BunkerWallBuilder.ts`** — procedural geometry for antechamber + corridor + arena. All `BoxGeometry`, merged into a single `BufferGeometry` per room.
- **`BunkerGridMaterial.ts`** — single `ShaderMaterial`. Uniforms: `uColorBase` (`#0a0e14`), `uColorGrid` (faction tint), `uCellSize` (`2.0`), `uLineWidth` (`0.04`), `uTime` (subtle ~0.5Hz brightness breathing), `uEmissiveIntensity` (`1.6`). World-space-UV grid SDF; emissive output goes through the existing post-FX bloom.
- **`BunkerHatchModel.ts`** — recessed circular hatch with two animated radial leaves. Reused for both the surface hatch (closed → opens on interact, transitions player into bunker) and the antechamber's exit hatch (mirrored).
- **`BunkerDoorController.ts`** — vertical slider on the arena entrance. 3m × 4m, slides up into the wall (0.8s ease-out tween). Closed-state has a thin animated horizontal scanline across the seam (faction-tinted).

### Minigame class — `src/lib/minigame/BunkerMinigame.ts`

Implements `MiniGame`, `MiniGameEvents`. Mirrors `RescueMinigame`'s shape exactly:

- 6 steps (Travel / Land / Enter / Clear waves / Extract / Return) maintained in the standard `_steps` array, advanced via `advanceStep(index)`.
- A reference to `BunkerSceneController` (instantiated on `activate`).
- The wave scheduler from `src/lib/bunker/`, advancing on `EnemyDirector.aliveCount() === 0`.
- The interaction state for surface hatch + arena door + antechamber exit hatch.
- All standard callbacks: `onPrompt`, `onStepChange`, `onComplete`, `onFail`, `onKillPlayer`, `onDestroyLander`. Death anywhere triggers the existing fail pipeline.

### Sub-state wiring — `LevelView.vue` + level state machine

- Add `'bunker-interior'` to the existing level state union (currently `'lander' | 'eva' | …`). Reachable from `'eva'` when the surface hatch interaction fires; reverts to `'eva'` on extract.
- Single function `enterBunkerInterior(factionTint)`:
  1. Start fade-to-black.
  2. At fade midpoint: `surfaceRoot.visible = false`, pause surface enemy director, snapshot player position next to the hatch (for later restoration), `bunkerScene.activate(scene, factionTint)`, place player at antechamber spawn.
  3. Fade out.
- `exitBunkerInterior()` is the inverse.
- Re-entry interlock: while state is `'entering'` or `'exiting'`, surface-hatch interaction is no-op.

### Player controller — re-used, not swapped

The existing FPS player (camera, multitool, projectiles, HP) keeps running through the bunker. Only the active scene root and active enemy director change. Gravity, ammo, suit HP all carry over.

## Wave content

Authored skeletons in `src/data/missions/bunker-waves.json`, indexed by tier. Slice 1 ships one shared roster set across all factions; faction-flavored rosters are a slice-2 concern.

```jsonc
{
  "easy": [
    { "fixed": [{ "type": "bacteriophage", "count": 3 }],
      "fillPool": ["bacteriophage"] },
    { "fixed": [{ "type": "bacteriophage", "count": 3 }, { "type": "spire", "count": 1 }],
      "fillPool": ["bacteriophage"] },
    { "fixed": [{ "type": "chimera", "count": 1 }, { "type": "spire", "count": 1 }, { "type": "bacteriophage", "count": 4 }],
      "fillPool": ["bacteriophage", "spire"] }
  ],
  "medium": [/* 5 entries, escalating */],
  "hard":   [/* 7 entries, escalating */]
}
```

**Fill rule.** For each wave: spawn the `fixed` roster, then roll `1 + Math.floor(rand() * 3)` extra units (1–3) drawn uniformly from `fillPool`. Seeded RNG keyed on `(missionId, waveIndex)` — replays of the same mission see the same waves.

**Spawn placement.** Four corner spawn pads in the arena, inset 4m from each corner. Round-robin spawn order spreads pressure. Pre-spawn pulse: a flat disk mesh on the floor with the grid material at higher emissive intensity, animated `0 → 1` over 0.6s, then the enemy fades in over 0.2s.

**Wave pacing.**

- Wave starts when `EnemyDirector.aliveCount === 0` AND `BunkerSceneState === 'wave-active'`. (For wave 1, the trigger is the player pressing E on the arena door.)
- Between-wave breather: 3.0s. State = `'wave-breather'`. Door stays open, no new spawns. HUD pulses the upcoming wave label.
- Final wave clear: state transitions `wave-active → final-clear → exit-prompt`. Arena door slams open with no possibility of re-locking; antechamber hatch unlocks visually.

**Interaction interlocks.**

- Pressing E on the arena door during `wave-active` is no-op (matches Rescue's gated prompts).
- Pressing E on the antechamber hatch before `exit-prompt` is no-op.

## HUD — `BunkerWaveHud.vue`

New Vue component, top-center, mounted only while `inBunker`.

- Big text: `"WAVE 3 OF 5"` — pulses in for the first 1.2s of each wave, then steady.
- Sub-text during breather: `"WAVE 4 INCOMING"` with a 3s shrinking bar.
- Tiny enemy-counter: `"3 HOSTILES"` — drawn from `EnemyDirector.aliveCount` each tick.
- On final clear: replaces with `"BUNKER SECURE — EXTRACT"`.

Sibling CSS at `src/components/level/bunkerWaveHud.css` (per repo convention — never `@apply` inside `<style scoped>`).

## Visual design

### Footprint (world units / meters)

| Volume | Inner W × D × H | Notes |
|---|---|---|
| Antechamber | 8 × 8 × 5 | Player spawn, exit hatch in floor center, arena door on north wall |
| Corridor | 3 × 4 × 4 | Connects antechamber → arena |
| Arena | 30 × 30 × 7 | Combat space, four corner spawn pads inset 4m from corners |

Wall thickness 0.4m. All `BoxGeometry`, merged per room.

### Faction tints (initial palette)

| Faction | Hex | Vibe |
|---|---|---|
| Cinderline | `#ff5a1a` | Molten orange — matches "ash" lore |
| Lucas Maverick | `#22d3a8` | Vegas-aqua — "house chip" green |
| Martian Marines | `#7afca7` | Corps green |
| Jovian Society | `#5cc8ff` | Cold cyan — asset-officer cool |

### Lighting (cheap)

- 1× ambient at `0.25` intensity.
- 4× point lights at the arena corners, faction-tinted, distance ~14m, intensity 1.6. **No shadows** — the grid lines do the visual work.
- 1× point light over the arena door, slightly brighter, signals "next path".
- Antechamber: 1 point light over the floor hatch (inviting glow when interactable).
- No skybox visible inside; ceiling is a wall like any other (same grid material at 60% line-emissive opacity).

### Performance budget

~12 box meshes × ~12 triangles per face = trivial geometry cost. Shader cost is one fragment-shader pass per wall — well under the budget the existing FPS scenes already run.

## Failure handling

Death anywhere reuses Rescue's pattern: `BunkerMinigame._status = 'failed'` → existing fail pipeline triggers the page-reload flow. `BunkerMinigame` does not need its own death plumbing.

The bunker is loaded for the duration of the current mission attempt; refresh-restart drops the player back at the giver planet's mission board (existing behavior).

## Testing strategy

Co-located `__tests__/*.spec.ts` under each new lib folder, Vitest + JSDOM as elsewhere.

- **`bunkerWaveSchedule.spec.ts`** — fixed roster respected; fill rolls fall in [1, 3]; deterministic with seed; total enemy count grows with wave index.
- **`bunkerSceneState.spec.ts`** — FSM transitions: `entering → antechamber-idle` on activation; `antechamber-idle → wave-active` on door interact; `wave-active → wave-breather` on `aliveCount === 0`; `wave-breather → wave-active` after 3s; final wave clear → `exit-prompt`; exit interact → `exiting`; **interlock**: cannot transition out of `wave-active` via door interact.
- **`asteroidMissionGenerator.spec.ts` extension** — bunker giver only spawns at its anchored planet; rolled difficulty 1–4 stamps `waveCount = 3`, 5–7 → 5, 8–10 → 7; per-template `planetIds` filter respected; **regression**: non-bunker missions at non-bunker planets unaffected.
- **`BunkerMinigame.spec.ts`** (lighter — closer to integration) — step transitions on `aliveCount` events; failure path reuses `_status='failed'`; `progressCurrent` / `progressTotal` track waves cleared.

No tests for `BunkerSceneController`, the grid shader, or Vue components — per repo norms (`src/three/` and `src/components/` are untested).

## Risks

- **Per-template `planetIds` is a generator-touch, not just a data add.** Small change but it's in code that already has subtle filtering rules (`COMBAT_ONLY_HOST_PLANET_IDS`, etc.). Risk is regressing some other planet's mission roll. Mitigation: a generator regression test asserting non-bunker missions are unaffected.
- **Scene swap race conditions.** If the player presses E on the surface hatch *during* a fade-in/out of a previous swap, we could double-trigger. Mitigation: the level state machine ignores re-entry events while `'entering'` or `'exiting'`.
- **Asteroid scene "paused" but not really.** Hiding the asteroid root + skipping its enemy director's tick is enough for slice 1 — but if the surface had an *active* enemy encounter when we swap, we'd want it actually paused to prevent off-screen lander damage. Mitigation: bunker missions don't generate surface enemies in slice 1 — the asteroid is empty except for the hatch.
- **Faction tint on the arena door scanline reads weak through bloom.** Possible visual issue. If it happens, bump `uEmissiveIntensity` for the door specifically. Easy fix.

## File map

### New files

```
src/data/missions/bunker-waves.json
src/data/missions/givers/cinderline.json
src/data/missions/givers/lucas-maverick.json
src/data/missions/givers/martian-marines-bunker.json
src/lib/bunker/bunkerWaveSchedule.ts
src/lib/bunker/bunkerSceneState.ts
src/lib/bunker/__tests__/bunkerWaveSchedule.spec.ts
src/lib/bunker/__tests__/bunkerSceneState.spec.ts
src/lib/minigame/BunkerMinigame.ts
src/lib/minigame/__tests__/BunkerMinigame.spec.ts
src/three/bunker/BunkerSceneController.ts
src/three/bunker/BunkerWallBuilder.ts
src/three/bunker/BunkerGridMaterial.ts
src/three/bunker/BunkerHatchModel.ts
src/three/bunker/BunkerDoorController.ts
src/components/BunkerWaveHud.vue
src/components/level/bunkerWaveHud.css
```

### Touched files

```
src/lib/missions/types.ts                     (ObjectiveType, BunkerScalableParams, ConcreteObjective.waveCount, MissionGiverTemplate.planetIds)
src/lib/missions/asteroidMissionGenerator.ts  (per-template planetIds filter, bunker objective materialization)
src/data/missions/givers/jovian-society.json  (append bunker template + extend objectiveTypes)
src/lib/missions/giverCatalog.ts              (load 3 new giver files; jovian-society already loaded)
src/lib/level/LevelMinigameFacade.ts          (new 'bunker' branch in the dispatch switch)
src/views/LevelView.vue                       (bunker-interior sub-state, scene swap, HUD gating)
```

## Open authorial calls (resolve at write-time, not blocking the spec)

- **Mission template names + briefings** for all four givers — voice already locked, just need to author the strings.
- **Wave skeleton tuning** for medium and hard tiers — slice 1 ships authored content for all three tiers, but the easy tier's skeleton is the only one drafted in this spec.
- **Lucas Maverick's lore alignment with the Venus zeppelin trade contract** — does the Venus bunker tie into Lucas's house-trusted-trader status, or is it a separate contract surface? Either fits; pick at write-time.
