# Hektor — Pinned Body Foundation

_Plan 1 of the Jovian Society Prospection contract rollout. Contract-agnostic._

---

## Revision note (2026-04-29)

This spec was rewritten after the original implementation pass began. The architectural change is significant — **a fixer agent reading this should diff against existing code carefully**:

- **Hektor is no longer always rendered.** The original spec made Hektor visible from session start with a `RESTRICTED` orbit prompt blocking interaction. The revised spec hides Hektor entirely until the contract reveals it. Renderer **must skip** bodies whose `bodyAccess` is `'restricted'` or `'destroyed'`.
- **Drop the `RESTRICTED` UI text** from `OrbitPrompt`. The body isn't on screen, so there's no prompt to surface. Any prop or branch added for restricted-state styling should be removed.
- **Drop the mission-callout slot scaffolding.** The original spec added an empty `<MissionCallout>` placeholder anchored mid-right when Hektor was orbited. The revised architecture (auto-activated special missions, per the consortium-certification precedent) doesn't need this slot at all. Remove the component, the prop pipeline, and any visibility logic added for it. Standard active-mission UI handles surfacing the contract waypoint.
- **Keep everything else.** `pinnedBodies` JSON, the GLB loader, `bodyAccess` on `PlayerProfile`, kiosk suppression for the case when Hektor is rendered, and the dev unlock helper all remain.

If the original implementation already shipped these features, the fixer's job is to **remove them cleanly**: delete the RESTRICTED prompt path, delete the mission-callout component and its wiring, change the renderer to skip non-rendered states.

---

## Premise

The Jovian Society contract (designed in `docs/inspo/jovian-society-gdd.md`) hinges on a single named asteroid the player will eventually be asked to liquidate or save: **624 Hektor**, the largest Jupiter Trojan. To support that contract — and the future Act 2/Act 3 content that uses similar contract-pinned bodies — the engine needs a generic concept of a **pinned body**: a celestial body declared in the planetarium that only renders when contract state has revealed it, and is removed (or persists, depending on contract resolution) at end of arc.

This plan ships only the foundation. It is intentionally unaware of the Jovian Society contract. When this plan lands, Hektor exists in the data layer with a real model and orbital elements, but is invisible on the map by default. A dev console hook flips its access state to `'unrestricted'`, at which point Hektor renders at L4 of Jupiter's orbit, can be approached and orbited, and — because Hektor has no shop or engineering bay — surfaces no kiosk buttons in the orbit prompt.

The Jovian Society contract (plans 2-7) hooks into the access flag to drive the reveal and final disposition of the body.

---

## Scope

**In scope**

1. New `pinnedBodies` section in `src/data/planets/planetarium.json`, with one entry: `hektor`.
2. Authored Hektor data: orbit, model reference (`/models/hektor.glb`), display radius slightly smaller than Ceres, axial tilt, rotation.
3. `PlanetSystemController` (or sibling) reads `pinnedBodies` and instantiates renderables, but **only when the body's access state is `'unrestricted'` or `'liberated'`**. States `'restricted'` and `'destroyed'` skip the render entirely — the body isn't in the scene, isn't in the nearest-body lookup, isn't anywhere.
4. GLB-loaded rendering for pinned bodies with `modelUrl` (procedural shader bypassed).
5. New `bodyAccess: Record<string, BodyAccessState>` field on `PlayerProfile`, persisted with the save.
6. Default `bodyAccess['hektor'] = 'restricted'` for any new save and for existing saves on profile migration.
7. Kiosk suppression in `OrbitPrompt`: when the body the player is orbiting has `noKiosks: true` (a new optional field on `pinnedBodies` entries; Hektor sets it true), the Engineering Bay / Mission Board / Shop / I Mission buttons all suppress regardless of `shopAvailable` / `missionAvailable`. Hektor has no kiosks because it's a contract-pinned asteroid, not a station.
8. A dev-only mechanism to flip `bodyAccess['hektor']` between `'restricted'` and `'unrestricted'` for manual testing (debug console hook is fine; no UI). Re-rendering on flip is acceptable as a reload-required hook in plan 1; live reactivity can land in a later plan if needed.

**Explicitly NOT in scope (and removed if the prior pass added them)**

- Always-on rendering of pinned bodies.
- `RESTRICTED` text in `OrbitPrompt` or any other UI.
- Mission-callout slot, `<MissionCallout>` component, callout visibility logic.
- Any prop on `OrbitPrompt` named `bodyAccess` or similar — the renderer's skip logic and `noKiosks` flag are sufficient. `OrbitPrompt` does not need to know about access state at all.
- Any contract-system integration. Plan 2 / plan 4 set `bodyAccess` from contract events.
- Body destruction / debris field rendering. Plan 7 owns `destroyed`.
- Joining Hektor to Jupiter's normal asteroid mission pool. Plan 7 owns `liberated`.

---

## Player flow (after this plan ships)

1. New save loads. Map shows the solar system. **Hektor is not visible.** Default `bodyAccess['hektor'] === 'restricted'` → renderer skips it.
2. Player flies anywhere — Jupiter, the asteroid belt, the Cinderline missions. No Hektor anywhere.
3. (Dev only.) Developer runs `window.__hektor.unlock()` (or whatever the implementer names the hook), which calls `setBodyAccess(profile, 'hektor', 'unrestricted')` and persists. Reload.
4. Map now renders Hektor at L4 of Jupiter's orbit, smaller than Ceres, dark D-type appearance from the GLB.
5. Player flies to Hektor. Approach, orbit normally with `E`. Once orbiting, the standard kiosk buttons (Engineering Bay / Mission Board / Shop / I Mission) are absent — Hektor has no station. The orbit prompt shows just the body name and the slingshot/launch behavior.
6. Player launches out of orbit. Returns to free flight. Standard.

---

## Data model

### `pinnedBodies` in `planetarium.json`

New top-level array, sibling of `planets` and `asteroidBelts`. Schema mirrors `planets` plus three fields:

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

    // Pinned bodies with no station: orbit prompt suppresses all kiosk buttons.
    "noKiosks": true,

    "moons": []   // Skamandrios deferred — not needed for plan 1.
  }
]
```

**New schema fields** (forwards-compatible additions):

- `meanAnomalyOffset: number` — degrees to offset starting position around the orbit. Existing planets default to `0`; only `pinnedBodies` use this for plan 1, but if it lands cleanly we can apply it to regular planets later for correct relative positioning.
- `modelUrl: string` — when set, the renderer loads the GLB and skips the procedural planet shader. Optional; if absent, the body falls back to the `shader` block (same path planets use).
- `noKiosks: boolean` — when `true`, the orbit prompt suppresses Engineering Bay / Mission Board / Shop / I Mission buttons regardless of any other state. For pinned bodies that are asteroids, not stations.

### `BodyAccessState` and `PlayerProfile`

In `src/lib/playerProfile/` (or wherever `PlayerProfile` lives — the implementer should follow existing pattern):

```ts
/** Per-body access state for contract-pinned bodies. */
export type BodyAccessState =
  | 'restricted'    // default; body is NOT rendered, NOT in nearest-body lookup
  | 'unrestricted'  // body is rendered, orbit allowed
  | 'liberated'     // contract resolved with bad ending; body is rendered, orbit allowed (plan 7 may add it to a normal mission pool)
  | 'destroyed'     // contract resolved with good ending; body is NOT rendered

/** PlayerProfile additions. */
export interface PlayerProfile {
  // ...existing fields...
  /** Access state for every pinned body in `planetarium.pinnedBodies`. Defaults to 'restricted'. */
  bodyAccess: Record<string, BodyAccessState>
}
```

**Render visibility helper:**

```ts
/** True when a pinned body should render in the scene given its access state. */
export function isBodyRendered(state: BodyAccessState): boolean {
  return state === 'unrestricted' || state === 'liberated'
}
```

**Migration:** When a saved profile is loaded that lacks `bodyAccess`, populate it by iterating `pinnedBodies` and setting each id to `'restricted'`. Same path for fresh saves.

**Plan-1 helpers (exported from the profile module):**

```ts
export function getBodyAccess(profile: PlayerProfile, bodyId: string): BodyAccessState
export function setBodyAccess(profile: PlayerProfile, bodyId: string, state: BodyAccessState): void
```

`setBodyAccess` is what plan 4's contract handlers will call to reveal Hektor on step 4 activation. For plan 1 it's reachable via a dev console exposure (e.g. `window.__hektor.unlock()` calling `setBodyAccess(profile, 'hektor', 'unrestricted')`). Keep the dev hook gated behind `import.meta.env.DEV`.

---

## Render system

`src/three/controllers/PlanetSystemController.ts` (or wherever pinned-body instantiation lands):

1. Read `planetarium.pinnedBodies`.
2. **For each entry, check `bodyAccess[entry.id]` against `isBodyRendered`. If not renderable, skip — do not instantiate, do not add to nearest-body lookup, do not register orbit detection.**
3. For each renderable pinned body with `modelUrl`, use the existing GLB-loading path. Apply orbital elements including `meanAnomalyOffset` for ~60° L4 phase offset.
4. Hektor is interactable when rendered: nearest-body lookup picks it up, orbit transitions work normally. Because the body simply doesn't exist when restricted, there's no special-case logic in the orbit code path.

If the access state changes mid-session (live or via reload), the renderer should re-evaluate. Reload-required is acceptable for plan 1; the dev hook can prompt a reload after flipping. Live reactivity (subscribing to profile changes and add/removing the body) is a nice-to-have, not required.

If GLB loading is too disruptive to ship in this plan, the implementer can fall back to the existing rocky-planet shader for plan 1 with a note in the spec, and the GLB swap moves to plan 4. But the ask is GLB; the file is small (122 KB) and the loader is well-trodden.

---

## UI changes — `OrbitPrompt.vue`

Just one change: kiosk suppression when the orbited body has `noKiosks: true`.

The existing buttons (Engineering Bay, Mission Board, Shop, I Mission) gate on `shopAvailable` and `missionAvailable` props. Add a single new check: if the orbited body's `pinnedBody.noKiosks === true` (plumbed through from `MapViewController` as a single boolean prop, e.g. `suppressKiosks`), all four buttons hide regardless of the other props.

Plumbing: `MapViewController` already computes nearest-body context for the prompt. Add a `nearestBodyNoKiosks: boolean` (or extend the existing payload) and pass it through.

`OrbitPrompt` does **not** need to know about `bodyAccess`. The renderer guarantees that a body the player is orbiting has access in `{'unrestricted', 'liberated'}`; the access machinery and the orbit UI are decoupled.

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
4. **`isBodyRendered` test** — returns `false` for `'restricted'` and `'destroyed'`, `true` for `'unrestricted'` and `'liberated'`.
5. **Schema test** (lightweight) — `planetarium.json` parses and `pinnedBodies[0].id === 'hektor'` with `noKiosks === true`.

Vue/Three layers do not need unit tests per ground rule 2; manual verification is in the acceptance checklist.

---

## Acceptance criteria

1. `bun run type-check` passes.
2. `bun run lint` passes (oxlint 0 errors, ESLint 0 errors / 0 warnings).
3. `bun run test:unit` passes including the five new tests above.
4. **Manual: invisible by default.** Loading the map view from a fresh save shows the standard solar system with **no Hektor**. Flying out to Jupiter's L4 region shows nothing there.
5. **Manual: visible after dev unlock.** Calling the dev unlock helper and reloading shows Hektor at ~60° ahead of Jupiter, smaller than Ceres, dark grey from the GLB.
6. **Manual: orbit + no kiosks.** Approaching Hektor lets the player orbit normally with `E`. While orbiting, no Engineering Bay / Mission Board / Shop / I Mission buttons appear. Slingshot launch behavior is unchanged.
7. **Manual: persistence.** State survives a reload (both restricted and unrestricted).
8. **Manual: no regressions.** Planet orbit behavior elsewhere (Earth, Mars, Jupiter, etc.) is unchanged. Kiosks still appear on regular planets.
9. **Removed code is gone.** No `RESTRICTED` text in any orbit-prompt component. No `<MissionCallout>` component or wiring. No `bodyAccess` prop on `OrbitPrompt`. (Important for the fixer pass — these may exist from the prior implementation and need to be removed.)

---

## Open questions for the implementer

1. **GLB loading path.** Confirm the existing model loader (used for `asteroid.glb`, `shuttle.glb`, etc.) is reusable for Hektor. If not, the planet-shader fallback is acceptable for plan 1 with a TODO.
2. **`meanAnomalyOffset`** — verify the orbit math integrates this cleanly. If awkward, a Hektor-only phase-offset hack is acceptable; the field stays in the JSON for future plans to formalize.
3. **Dev unlock helper location** — `window.__hektor` is a placeholder name. The implementer can pick a convention that matches any existing dev console hooks in the codebase.
4. **Reload vs. live reactivity on `bodyAccess` change.** Reload-required is fine for plan 1 (dev hook prompts reload). Live reactivity is a nicer DX but more code. Default to reload.

---

## Forward references (later plans need these)

- Plan 2 — schema parity: `CompleteMissionsStep` gains `revealsBody?: string` so step activation can flip a pinned body's access state. Plan 2 also adds `set-body-access` reward effect for outcome-time transitions.
- Plan 4 — Hektor mission routing: contract step 4 carries `revealsBody: 'hektor'` and `specialMissionId: 'jovian-prospection-hektor-photometry'`. Step activation calls `setBodyAccess(profile, 'hektor', 'unrestricted')` and auto-activates the special mission whose waypoint targets Hektor.
- Plan 7 — outcome side effects: transmit outcome calls `setBodyAccess(profile, 'hektor', 'destroyed')` (renderer drops it; optional one-time debris field). Tamper outcome calls `setBodyAccess(profile, 'hektor', 'liberated')` (body persists; plan 7 may add it to Jupiter's normal asteroid mission pool).
