# Map Boot Lander Prelude Design

## Summary

Replace the map screen's visible white/loading gap with a self-contained black-and-white 2D canvas lander prelude. The prelude runs on every map boot, starts immediately, stays cosmetic-only, and hands off to the existing `PLAY` flow as soon as the map is ready.

## Goals

- Make map boot feel intentional and instant instead of exposing a blank white page or spinner.
- Contextualize loading as a short Vale Orbital Shop approach sequence.
- Keep the experience interactive with simple mouse and keyboard steering.
- Preserve the current `MapViewController` boot contract: `preparing -> ready -> started`.
- Avoid balance risk by keeping collected coins cosmetic only.

## Non-Goals

- No persisted coin rewards, credits, achievements, contracts, inventory changes, or progression effects.
- No artificial minimum loading delay.
- No dependency on Three.js map assets, since those are part of what the loader is masking.
- No full game physics simulation; the prelude only needs to feel responsive and readable.

## User Experience

When the map route mounts, the page background is black immediately. The boot overlay shows a monochrome arcade scene titled `VALE ORBITAL APPROACH`.

The lander begins falling from the top of the canvas. The player can guide it horizontally with mouse/touch movement, `A/D`, or left/right arrow keys. White coin pips drift through the approach lane; collecting them increments an on-screen cosmetic score.

When `mapBootReady` becomes true, the prelude stops spawning new coins and transitions to landing. The ship eases to a landing pad on the lunar ground beside a simple Vale Orbital Shop silhouette. A short thruster/dust effect plays, the scene shows the ship as landed, and the existing `PLAY` button appears. Clicking `PLAY` calls the current `handlePlay` path.

If loading completes almost instantly, the prelude immediately enters the landing sequence and reveals `PLAY` after the ship lands. The landing beat should be brief, targeting about 300-500 ms, so it reads as feedback rather than an extra loading delay.

## Visual Direction

- Strict black-and-white arcade look.
- Black sky with sparse white stars, subtle scanlines/noise, and simple HUD text.
- Lander sprite built from geometric canvas primitives: body, legs, nose, and thruster plume.
- Coins rendered as white outlined pips or pixel diamonds.
- Lunar ground as a jagged white ridge with a flat landing pad.
- Vale Orbital Shop as a small silhouette: dome, antenna, lit window, and `VALE ORBITAL` sign.
- Post-landing flavor line: `MARTA: BAY OPEN`.

## Architecture

Introduce a focused boot prelude component at `src/components/MapBootLanderPrelude.vue`.

Responsibilities:

- Own the `<canvas>` element, render loop, sizing, and device-pixel-ratio scaling.
- Track local prelude state: lander position, velocity feel, coin pips, score, stars, landing particles.
- Register and clean up input listeners while mounted.
- React to a `ready` prop from `MapView.vue`.
- Emit or expose no gameplay rewards; score remains display-only.

`MapView.vue` remains the integration layer:

- Continue deriving `mapBootReady` from `mapBootState.phase === 'ready'`.
- Render the prelude inside `.map-boot-overlay`.
- Keep the existing `PLAY` button and `handlePlay` behavior.
- Only show the `PLAY` button once the prelude reports that the landing beat is complete.

`MapViewController.ts` should not need behavior changes for the first implementation. It continues to emit boot state and starts the map only after `startExperience()`.

Global CSS should ensure no white flash before Vue paints:

- Set `html`, `body`, `#app`, and `.scene-container` to black backgrounds.
- Keep the boot overlay opaque enough that the unrendered Three.js canvas never reads as a blank page.

## State Machine

- `falling`: starts immediately on mount; player can steer and collect cosmetic pips.
- `landing`: entered when `ready` becomes true; ship eases toward the pad, coin spawning stops.
- `landed`: landing animation is complete; component tells the parent the `PLAY` button can be enabled/shown.

The state machine is local to the prelude and resets on every map boot.

## Data Flow

- `MapViewController` emits boot state through `onBootState`.
- `MapView.vue` updates `mapBootState`.
- `MapView.vue` passes `ready={mapBootReady}` into the prelude.
- The prelude emits `landed` when the landing beat completes.
- `MapView.vue` reveals/enables the `PLAY` button.
- `PLAY` calls the existing `handlePlay`, setting `mapExperienceStarted` and starting the map loop/audio.

## Accessibility And Input

- The overlay remains a dialog while it blocks map interaction.
- The canvas is decorative/gameplay-like but not required to proceed once loading completes.
- The `PLAY` button remains a real button with keyboard focus.
- Keyboard steering must not prevent tabbing to `PLAY` after landing.
- Users who do not interact still see the ship land automatically.

## Testing

- Unit test the prelude state transition logic if extracted into a small TypeScript helper.
- Component test that `ready=false` hides/disables `PLAY`, then `ready=true` eventually emits `landed`.
- Regression test that cosmetic score changes do not call profile, credit, inventory, contract, or achievement APIs.
- Manual check on first map load and repeat map boots to confirm there is no white flash.

## Risks

- A canvas render loop can leak if listeners or RAF handles are not cleaned up on unmount.
- Keyboard steering can conflict with button focus if event handling is too broad.
- The landing beat should be short; if it feels like a forced delay, it will fight the goal of instant readiness.
- High-DPI canvases need DPR scaling to avoid blurry monochrome line art.

