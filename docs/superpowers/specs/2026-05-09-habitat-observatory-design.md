# Habitat Observatory — Design Spec

- **Date:** 2026-05-09
- **Author:** guinetik (with Claude)
- **Status:** Approved for implementation planning

## Summary

Add an interactive sky-atlas dialog to the habitat interior, gated on owning the
**Refractor Telescope** cosmetic. Player walks up to the telescope, sees an
`F  Observe` prompt, presses F, and a futuristic dialog opens that embeds
[Aladin Lite](https://aladin.cds.unistra.fr/AladinLite/) configured as a curated
five-target tour through Milky Way showpieces. Visual style mirrors
`ShuttleControlOverlay.vue` so both dialogs feel like the same shipboard OS.

## Goals

- Reward players who buy the telescope cosmetic with a real interactive payoff,
  not just a static prop.
- Reuse the Aladin Lite integration pattern proven in the `galaxies` repo
  (dynamic import, `await A.init`, hidden native chrome, custom controls).
- Stay within existing architectural rules: ViewController pattern, lib
  boundary for the third-party dep, data-driven content, no magic numbers.
- Zero cost for players who don't own the telescope (Aladin chunk never loads).

## Non-Goals

- No tie-in to missions, inventory, achievements, or game state in v1. The
  observatory is pure flavor / vanity.
- No survey switcher UI. Each curated target declares its own preferred survey.
- No "lock-on" / scanline polish. Possible follow-up; not v1.
- No SIMBAD search, no free-text coordinate input, no observation logging.

## User Flow

1. Player owns `habitat-furniture-refractor-telescope` cosmetic; the
   `HabitatRefractorTelescopeModel` mounts at the −X sun corner.
2. Player walks within range. Habitat scene shows `F  Observe`.
3. Press F → dialog opens, Aladin chunk lazy-loads on first open
   (~1–2s shimmer), default target = first entry (Sagittarius A*).
4. Sidebar shows five target buttons. Click → adapter calls
   `setImageSurvey` (if changed) + `gotoRaDec` + `setFoV`. Header strip and
   blurb panel update.
5. ESC or Close button → overlay closes. Adapter is kept alive across the
   session for fast re-open; destroyed on `onBeforeUnmount`.

## Architecture

```
src/
  data/observatory/targets.json              ← curated content, statically imported
  lib/observatory/
    types.ts                                  ← ObservatoryTarget interface
    AladinAdapter.ts                          ← thin wrapper over aladin-lite
    __tests__/targets.spec.ts                 ← manifest validation
  components/
    ObservatoryOverlay.vue                    ← markup + bindings
    ObservatoryOverlayController.ts           ← orchestrates adapter + state
  three/
    HabitatInteriorScene.ts                   ← (modified) F-prompt + onInteract('observatory')
  lib/map/habitat/
    MapHabitatFacade.ts                       ← (modified) bridge new interact target to callback
  views/
    MapView.vue / MapViewController.ts        ← (modified) overlay state + wiring
  types/
    aladin-lite.d.ts                          ← module shim, minimum surface used
  assets/css/observatory-overlay.css          ← @apply'd utilities
```

### Layer responsibilities

| Layer | Knows about |
|-------|-------------|
| `lib/observatory/AladinAdapter` | `aladin-lite` only. No Vue, no Three, no scene. |
| `lib/observatory/types` | Pure TS. No deps. |
| `data/observatory/targets.json` | Static content. |
| `components/ObservatoryOverlay.vue` | Targets data, controller, Vue. |
| `components/ObservatoryOverlayController.ts` | Adapter, targets, state. |
| `three/HabitatInteriorScene` | Existing. Adds proximity check + `onInteract('observatory')`. |
| `lib/map/habitat/MapHabitatFacade` | Existing. Bridges new interact target to `onObservatory` callback. |
| `views/MapView*` | Mounts overlay, owns `observatoryVisible` ref. |

## Component / Module Designs

### `lib/observatory/types.ts`

```ts
export interface ObservatoryTarget {
  /** Stable id, kebab-case. e.g. 'sgr-a-star'. */
  readonly id: string
  /** Display name in sidebar. e.g. 'Sagittarius A*'. */
  readonly label: string
  /** Right ascension, sexagesimal. e.g. '17 45 40.04'. */
  readonly ra: string
  /** Declination, sexagesimal with sign. e.g. '-29 00 28.1'. */
  readonly dec: string
  /** Field of view in degrees, in (0, 60]. */
  readonly fovDeg: number
  /** Aladin survey id, e.g. 'P/Mellinger/color'. */
  readonly survey: string
  /** Ship-AI flavor text, ~40-80 words. Plain text, no markup. */
  readonly blurb: string
}
```

### `lib/observatory/AladinAdapter.ts`

```ts
export interface AladinAdapterOptions {
  readonly hostElement: HTMLElement
  readonly initialTarget: ObservatoryTarget
}

export class AladinAdapter {
  static async create(opts: AladinAdapterOptions): Promise<AladinAdapter>
  goto(target: ObservatoryTarget): void
  destroy(): void
}
```

- `create()` dynamically imports `aladin-lite`, awaits `A.init`, assigns a
  unique container id to `hostElement`, calls `A.aladin('#'+id, initOpts)`.
  Init opts hide all native chrome (see Non-Goals notes / §2 transcript).
- `goto()` calls `setImageSurvey` only when the survey id changes (avoids the
  visible flash), then `gotoRaDec(ra, dec)` + `setFoV(fovDeg)`.
- `destroy()` calls Aladin's destroy if present, else clears `hostElement`.

### `data/observatory/targets.json`

Locked v1 list (5 entries, in sidebar order):

| id | label | ra | dec | fovDeg | survey |
|----|-------|----|-----|--------|--------|
| `sgr-a-star` | Sagittarius A* | `17 45 40.04` | `-29 00 28.1` | 5.0 | `P/Mellinger/color` |
| `m31-andromeda` | M31 Andromeda | `00 42 44.30` | `+41 16 09` | 3.0 | `P/DSS2/color` |
| `m42-orion-nebula` | M42 Orion Nebula | `05 35 17.3` | `-05 23 28` | 1.5 | `P/DSS2/color` |
| `m51-whirlpool` | M51 Whirlpool | `13 29 52.7` | `+47 11 43` | 0.2 | `P/SDSS9/color` |
| `m45-pleiades` | Pleiades (M45) | `03 47 24` | `+24 07 00` | 2.0 | `P/DSS2/color` |

Blurbs written in the ship-AI voice (terse, slightly arch — match
`messageCatalog.ts`). Author them when authoring the JSON; the spec doesn't
need final copy.

### `components/ObservatoryOverlay.vue`

Mirrors `ShuttleControlOverlay.vue` 1:1, re-skinned:

- Outer `.observatory-overlay` with `tabindex="0"` and `@keydown.esc=close`.
- Card with chrome bar: `Observatory` label + Close button.
- Header strip: `SURVEY · RA · DEC · FOV · TARGET` bound to controller state.
- Body: `.observatory-sidebar` (5 target buttons, active style same family as
  `shuttle-control-nav-btn--active`) + `.observatory-content` containing
  `<div ref="aladinHost">`.
- Footer band shows the current target's blurb + `ESC Close` hint.

Props: `visible: boolean`. Emits: `close`. Imports `targets.json` statically.

### `components/ObservatoryOverlayController.ts`

Owns:
- `adapter: AladinAdapter | null`
- `currentTargetId: Ref<string>` (default = `targets[0].id`)
- `loadingState: Ref<'idle' | 'loading' | 'ready' | 'error'>`

API:
- `async onOpen(host: HTMLElement)` — first open creates adapter; later opens
  re-`goto()` the current target (cheap).
- `selectTarget(id)` — looks up target, calls `adapter.goto`, updates state,
  plays `uiAudio.notifyShuttleProgramClick()`.
- `onClose()` — keeps adapter alive across session.
- `dispose()` — calls `adapter.destroy()`. Wired to `onBeforeUnmount`.

### `three/HabitatInteriorScene.ts` modifications

- Add `OBSERVE_PROMPT_RADIUS` constant (XZ distance from telescope position).
- Add a new branch to the existing proximity ladder in `tickInteraction`
  (alongside `'table'` / hatch / cat checks). The branch:
  - Guards on `this.refractorTelescope.isLoaded()` — the cosmetic ownership
    signal, since the model is only conditionally loaded at line 1719.
  - Tests XZ distance from player to
    `(REFRACTOR_TELESCOPE_X, REFRACTOR_TELESCOPE_Z)` < `OBSERVE_PROMPT_RADIUS`.
  - When in range, calls `this.onPrompt?.('F  Observe')`.
  - On F press in range, calls `this.onInteract?.('observatory')` —
    reusing the existing `onInteract: ((target: string) => void) | null`
    callback bag (no new top-level callback needed; it follows the same
    pattern as `'table'` / `'hatch'` / `'cat'`).
- Branch ordering: place the observatory check above the table/hatch checks
  but after cat/sushi care prompts (matching how the existing ladder lets the
  more specific prompts win at the cockpit corner).

### `lib/map/habitat/MapHabitatFacade.ts` modifications

- Extend `MapHabitatCallbacks` interface (line ~100) with:
  ```ts
  /** Open/close the observatory dialog. */
  onObservatory?: (visible: boolean) => void
  ```
- In `buildScene()` (line ~214), extend the `next.onInteract = (target) => {…}`
  switch to handle `'observatory'`: call
  `deps?.callbacks.onObservatory?.(true)`. Pointer lock release is unnecessary
  because the overlay handles its own focus via the existing
  `tabindex` / `nextTick` pattern; if click-through becomes a problem, mirror
  the table branch's `pointerLock.release()` call.

### `views/MapView*` modifications

- In `MapViewController`, add a public `onObservatory` event hook (peer to
  `onShuttleControl`), and forward `callbacks.onObservatory` to it from the
  habitat facade attach call (around line 990).
- In `MapView.vue`:
  - `const observatoryVisible = ref(false)`.
  - Wire `viewController.onObservatory = (visible) => { observatoryVisible.value = visible }`
    in the same `attach`/init block as `onShuttleControl` (around line 961).
  - Mount `<ObservatoryOverlay :visible="observatoryVisible" @close="observatoryVisible = false" />`
    adjacent to the existing `<ShuttleControlOverlay>` mount (around line 1993).

## Lazy Loading

`aladin-lite` (~2.4 MB) is imported via `await import('aladin-lite')` inside
`AladinAdapter.create()`. Vite splits it into its own chunk automatically. A
player who never buys the telescope, or buys it but never presses F at it,
never downloads the chunk. First open shows the loading shimmer until the
chunk + Aladin assets resolve.

## Failure Mode

If dynamic import or `A.init` rejects, the controller's `loadingState`
becomes `'error'`. The viewport renders an inline message:
"Sky atlas offline. [Retry]" — modeled on `GalaxyMosaicView.vue`'s pattern.
Logged via `console.warn('[ObservatoryOverlay] init failed:', err)`.

## Audio

- Open: `uiAudio.notifySwitch()` (matches Shuttle Control open/close).
- Close: `uiAudio.notifySwitch()`.
- Sidebar target click: `uiAudio.notifyShuttleProgramClick()`.

## Pause Behavior

None. The habitat interior runs no live physics or enemies; Shuttle Control
doesn't pause either. Overlay simply mounts on top.

## Testing

Per `CLAUDE.md` ("tests focus on `src/lib/`"):

- `src/lib/observatory/__tests__/targets.spec.ts` validates the manifest:
  - All five entries have all required fields.
  - `fovDeg` ∈ (0, 60].
  - `ra` and `dec` parse as sexagesimal (regex check is enough; no astropy
    needed).
  - Ids are unique and kebab-case.
  - Survey id is non-empty.

- No tests for `AladinAdapter` (third-party boundary; not worth mocking).
- No tests for the Vue component or the habitat scene wiring.

## Acceptance Criteria

1. With telescope cosmetic owned, walking up to it shows `F  Observe`.
2. Without the cosmetic, no prompt appears (model isn't even loaded).
3. F opens an overlay matching `ShuttleControlOverlay`'s visual chrome.
4. Five targets in sidebar; clicking each pans Aladin to the right place
   with the right survey and FOV.
5. Header strip updates live; blurb updates on selection.
6. ESC or Close hides the overlay.
7. `bun run type-check`, `bun run lint`, `bun run test:unit` all green.
8. Aladin chunk does not appear in the initial bundle (verify via build
   output chunk list).

## TSDoc / Header

Every exported file gets the standard header:

```ts
/**
 * <one-line description>
 *
 * @author guinetik
 * @date 2026-05-09
 * @spec docs/superpowers/specs/2026-05-09-habitat-observatory-design.md
 */
```

All exports get TSDoc per ESLint `jsdoc/require-jsdoc` (error severity).

## Open Questions

None at design time. All five clarifying questions answered during
brainstorming:

- **Default target framing:** option B — curated tour with sidebar.
- **Curation flavor:** option C — astronomy showpieces + ship-AI blurbs.
- **Survey strategy:** option C — auto-switch per target.
- **Chrome style:** option A — plain ShuttleControlOverlay clone, no lock-on
  polish.
- **Architecture:** option B — ViewController + lib + data split.
- **Target list:** locked at five.
