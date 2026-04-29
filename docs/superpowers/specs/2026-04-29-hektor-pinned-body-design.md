# Hektor — Pinned Body Foundation

_Plan 1 of the Jovian Society Prospection contract rollout. Contract-agnostic._

---

## Premise

The Jovian Society contract (designed in `docs/inspo/jovian-society-gdd.md`) hinges on a single named asteroid the player will eventually be asked to liquidate or save: **624 Hektor**, the largest Jupiter Trojan. To support that contract — and the future Act 2/Act 3 content that uses similar contract-pinned bodies — the engine needs a generic concept of a **pinned body**: a celestial body that renders on the solar map at all times but whose orbit interaction is gated by per-save state.

This plan ships only the foundation. It is intentionally unaware of the Jovian Society contract. When this plan lands, Hektor exists in the world, can be seen on the map, has a real model, cannot be orbited (shows `RESTRICTED` instead of the orbit prompt), and — when its access flag is flipped manually — orbits normally but with the shop/engineering/mission-board kiosks suppressed.

The Jovian Society contract (plan 2) will hook into the access flag and the suppressed-kiosk slot to drive the actual mission flow.

---

## Scope

**In scope**

1. New `pinnedBodies` section in `src/data/planets/planetarium.json`, with one entry: `hektor`.
2. Authored Hektor data: orbit, model reference (`/models/hektor.glb`), display radius slightly smaller than Ceres, axial tilt, rotation.
3. `PlanetSystemController` (or sibling) reads `pinnedBodies` and renders them like planets, but loads a GLB instead of using a procedural shader.
4. New `bodyAccess: Record<string, BodyAccessState>` field on `PlayerProfile`, persisted with the save.
5. `OrbitPrompt` changes: when the nearest body's access state is `restricted`, show `RESTRICTED` instead of `E Orbit` and disable the orbit transition. When `unrestricted` (or `liberated`) and the body has no shop/engineering/mission-board (Hektor's case), suppress the left-side kiosk buttons; render a placeholder mission-callout slot instead, anchored middle-right.
6. Default `bodyAccess['hektor'] = 'restricted'` for any new save and for existing saves on profile migration.
7. A dev-only mechanism to flip `bodyAccess['hektor']` to `'unrestricted'` for manual testing (debug console hook is fine; no UI).

**Out of scope (deferred to plan 2 — the Jovian Society contract)**

- The contract itself, including any logic that sets `bodyAccess['hektor']` on accept/decline/outcome.
- Mission generator routing for contract steps targeting Hektor (steps 4, 7, 9 of the GDD).
- The terminal prospectus minigame.
- Joining Hektor to Jupiter's normal asteroid mission pool on the tamper outcome (`'liberated'` state path).
- Body destruction / debris field rendering for the transmit outcome (`'destroyed'` state path). These two states are declared in the type so plan 2 can reach for them, but plan 1 does not exercise them.
- Filling the mission-callout slot with real content. Plan 1 ships the suppression + empty slot; plan 2 wires a contract-step subject/CTA into it.

---

## Player flow (after this plan ships)

1. New save loads. Map shows the solar system with Hektor visible at L4 of Jupiter's orbit, slightly smaller than Ceres, dark D-type appearance from the GLB.
2. Player flies to Hektor. As they approach within the standard "free / approaching" detection range, the orbit prompt appears with the body name `624 Hektor` but action text `RESTRICTED`. Pressing `E` does nothing.
3. Player flies away or to another body — normal behavior unchanged elsewhere in the game.
4. (Dev only.) Developer flips `bodyAccess['hektor'] = 'unrestricted'` via a console helper. On reload (or live, if reactive), Hektor's prompt now reads `E Orbit` and orbit works. Once orbiting, the standard left-side kiosk buttons (Engineering Bay / Mission Board / Shop) are absent. A placeholder mission-callout slot is visible mid-right anchored over the body. The slot is empty in plan 1.

---

## Data model

### `pinnedBodies` in `planetarium.json`

New top-level array, sibling of `planets` and `asteroidBelts`. Schema mirrors `planets` plus two fields:

```jsonc
"pinnedBodies": [
  {
    "id": "hektor",
    "name": "624 Hektor",
    "type": "Jupiter Trojan",
    "accentColor": "#3a322a",

    // Real-data orbital elements for 624 Hektor (L4 leader).
    "orbit": {
      "semiMajorAxis": 5.235,
      "eccentricity": 0.0244,
      "inclination": 18.16,
      "longitudeOfAscendingNode": 342.75,
      "argumentOfPeriapsis": 184.6,
      "meanAnomalyOffset": 60,   // ~60° leading Jupiter at L4
      "period": 4348
    },

    // Slightly smaller than Ceres (Ceres is 0.0006). Tunable.
    "displayRadius": 0.00045,
    "axialTilt": 78,
    "rotationSpeed": 0.0857,     // ~6.92h period scaled to game ticks

    // GLB asset; planetary shader is bypassed when modelUrl is set.
    "modelUrl": "/models/hektor.glb",

    "moons": []   // Skamandrios deferred — not needed for plan 1.
  }
]
```

**New schema fields** (forwards-compatible additions):

- `meanAnomalyOffset: number` — degrees to offset starting position around the orbit. Existing planets default to `0`; only `pinnedBodies` use this for plan 1, but if it lands cleanly we can apply it to regular planets later for correct relative positioning.
- `modelUrl: string` — when set, the renderer loads the GLB and skips the procedural planet shader. Optional; if absent, the body falls back to the `shader` block (same path planets use).

**Why `pinnedBodies` is its own array, not under `planets`:**

- The renderer treats them slightly differently (GLB-loading path, smaller default size).
- The contract system needs to enumerate them to seed default access states.
- Future Act 3 contracts will add more entries here without polluting the planet list.

### `BodyAccessState` and `PlayerProfile`

In `src/lib/playerProfile/` (or wherever `PlayerProfile` lives — the implementer should follow existing pattern):

```ts
/** Per-body access state for contract-pinned bodies. */
export type BodyAccessState =
  | 'restricted'    // default; orbit blocked, shows "RESTRICTED"
  | 'unrestricted'  // orbit allowed, kiosks suppressed, mission-callout slot active
  | 'liberated'     // contract resolved with bad ending; orbit allowed, body joins normal mission pool
  | 'destroyed'     // contract resolved with good ending; body removed from world

/** PlayerProfile additions. */
export interface PlayerProfile {
  // ...existing fields...
  /** Access state for every pinned body in `planetarium.pinnedBodies`. Defaults to 'restricted'. */
  bodyAccess: Record<string, BodyAccessState>
}
```

**Migration:** When a saved profile is loaded that lacks `bodyAccess`, populate it by iterating `pinnedBodies` and setting each id to `'restricted'`. Same path for fresh saves.

**Plan-1 helpers (exported from the profile module):**

```ts
export function getBodyAccess(profile: PlayerProfile, bodyId: string): BodyAccessState
export function setBodyAccess(profile: PlayerProfile, bodyId: string, state: BodyAccessState): void
```

`setBodyAccess` is what plan 2's contract handlers will call. For plan 1 it's reachable via a dev console exposure (e.g. `window.__hektor.unlock()` calling `setBodyAccess(profile, 'hektor', 'unrestricted')`). Keep the dev hook gated behind `import.meta.env.DEV`.

---

## Render system

`src/three/controllers/PlanetSystemController.ts` is the existing entry point. Plan 1 work:

1. Read `planetarium.pinnedBodies` and instantiate one renderable per entry.
2. For each pinned body with `modelUrl`, use the existing GLB-loading path (`asteroid.glb` and other models already use a similar pattern — follow the same loader and material settings).
3. Apply `orbit.meanAnomalyOffset` to the body's starting orbital phase. The simplest correct approach: when seeding orbital position from `argumentOfPeriapsis + true_anomaly_at_t0`, add `meanAnomalyOffset` to the initial phase. Verify Hektor renders ~60° ahead of Jupiter on the map.
4. Hektor must be **interactable** (orbit detection, name display, "near body" computation in `OrbitalSurfingController` or wherever the nearest-body lookup runs) just like planets are. The access-state check happens in the prompt UI, not in the geometry layer.

If GLB loading is too disruptive to ship in this plan and risks blocking, the implementer can fall back to the existing rocky-planet shader for plan 1 with a note in the spec, and the GLB swap moves to plan 2. But the ask is GLB; the file is small (122 KB) and the loader is well-trodden.

---

## UI changes — `OrbitPrompt.vue`

Two additive changes; no existing behavior breaks for non-pinned bodies.

### 1. Restricted state

`OrbitPrompt` already receives `OrbitHudState`. Extend the data flowing from `MapViewController` to include the access state of `nearestBody`. Recommended: add a single new prop:

```ts
defineProps<{
  orbitState: OrbitHudState
  shopAvailable?: boolean
  shopPlanet?: string
  missionAvailable?: boolean
  bodyAccess?: BodyAccessState   // new; undefined for non-pinned bodies
}>()
```

Behavior:

- `bodyAccess === 'restricted'` and `orbitState.state === 'free'` (player near but not orbiting): render the body name as today, but the `action` line shows `RESTRICTED` styled with a muted/warning color. The `E` keypress that would normally trigger orbit is intercepted upstream — `MapViewController` checks the access state before transitioning to `approaching`, and short-circuits if restricted. (No-op, possibly play a denied SFX.)
- `bodyAccess === 'restricted'` while approaching/orbiting should never happen (because the transition is blocked), but defensively: if it does, fall back to the standard prompt rather than rendering a broken state.
- `bodyAccess === 'unrestricted'` or `'liberated'` or `undefined`: existing behavior, with the kiosk-suppression rule below.

### 2. Kiosk suppression + mission-callout slot

The three buttons inside `OrbitPrompt` (Engineering Bay, Mission Board, Shop) are currently gated by `shopAvailable`. Hektor will not have `shopAvailable === true`, so those buttons already won't render — good, no work needed there. The "I Mission" button is gated by `missionAvailable`. Plan 1 leaves `missionAvailable === false` for Hektor (no contract wired yet), so it doesn't render either.

What plan 1 **adds** is a new mission-callout slot — a Vue component placeholder (`<MissionCallout v-if="missionCalloutVisible" :body-name="..." :step-subject="..." />`) anchored mid-right of the screen, on top of the body. It is visible when:

- The player is orbiting a pinned body, AND
- The body's access is `'unrestricted'` or `'liberated'`, AND
- A `pinnedBodyMission` signal is set (plan 2 sets it; plan 1 always passes `null`).

Plan 1 ships the component (empty render, `<slot />` or a comment placeholder), the visibility wiring, and the prop pipeline. Plan 2 fills the slot.

### 3. Plumbing the access state into the prompt

`MapViewController` already computes `nearestBodyName` and friends for the orbit HUD. Add a sibling `nearestBodyAccess: BodyAccessState | undefined` to that pipeline. For non-pinned bodies it stays undefined and the prompt renders as today.

---

## Architecture notes

- All numeric constants (display radius, orbital offset, etc.) go into the JSON file or named constants per CLAUDE.md ground rule 1.
- Hektor data lives in `planetarium.json` per ground rule 3 (data-driven).
- Render code goes in `src/three/`, profile code in `src/lib/`, UI in `src/components/`. No cross-layer concerns.
- TSDoc with `@author guinetik`, `@date 2026-04-29`, and `@spec docs/superpowers/specs/2026-04-29-hektor-pinned-body-design.md` on every export per ground rule 8.

---

## Tests

`src/lib/` is the test target per ground rule 2.

1. **Profile migration test** — loading a save without `bodyAccess` populates it with `restricted` for every `pinnedBodies` id.
2. **`setBodyAccess` test** — flipping state persists and reads back.
3. **Default state test** — fresh profile has `bodyAccess['hektor'] === 'restricted'`.
4. **Schema test** (lightweight) — `planetarium.json` parses and `pinnedBodies[0].id === 'hektor'`.

Vue/Three layers do not need unit tests per ground rule 2; manual verification is in the acceptance checklist.

---

## Acceptance criteria

1. `bun run type-check` passes.
2. `bun run lint` passes (oxlint 0 errors, ESLint 0 errors / 0 warnings).
3. `bun run test:unit` passes including the four new tests above.
4. **Manual: visible.** Loading the map view shows Hektor at ~60° ahead of Jupiter, smaller than Ceres, dark grey from the GLB.
5. **Manual: restricted.** Approaching Hektor shows `624 Hektor — RESTRICTED` and `E` is a no-op.
6. **Manual: unrestricted (dev hook).** Calling the dev unlock helper, reloading, and approaching Hektor lets the player orbit. While orbiting, no Engineering Bay / Mission Board / Shop buttons appear. The mission-callout slot is wired but empty.
7. **Manual: persistence.** State survives a reload.
8. No regressions on planet orbit behavior elsewhere in the system.

---

## Open questions for the implementer

1. **GLB loading path.** Confirm the existing model loader (used for `asteroid.glb`, `shuttle.glb`, etc.) is reusable for Hektor. If not, the planet-shader fallback is acceptable for plan 1 with a TODO.
2. **`meanAnomalyOffset`** — verify the orbit math integrates this cleanly. If it's awkward to add now, a temporary phase-offset hack on Hektor only is acceptable; the field stays in the JSON for plan 2 to formalize.
3. **Dev unlock helper location** — `window.__hektor` is a placeholder name. The implementer can pick a convention that matches any existing dev console hooks in the codebase.

---

## Forward references (plan 2 will need these)

- `setBodyAccess(profile, 'hektor', 'unrestricted')` on contract accept.
- `setBodyAccess(profile, 'hektor', 'destroyed')` on transmit outcome.
- `setBodyAccess(profile, 'hektor', 'liberated')` on tamper outcome.
- The `MissionCallout` component will receive `bodyName` and a contract-step subject + CTA.
- Hektor's mission spawning (steps 4, 7, 9 of the Jovian GDD) will route through whatever the existing planetary mission generator path is — plan 2 designs that.
