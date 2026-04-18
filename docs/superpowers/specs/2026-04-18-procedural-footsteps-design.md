# Procedural Footsteps Design

**Date:** 2026-04-18
**Author:** guinetik
**Status:** Implemented

## Overview

EVA and habitat footsteps were previously played from a static pair of recorded
samples per surface (`sfx.step.{habitat|asteroid}.{1|2}`). Players reported the
left/right cadence drifting out of sync with their actual footstep interval —
the loop "pattern" is baked into the sample, so any timing nudge made the
playback feel off-beat. The recorded files also have no per-foot stereo, so
both feet land in the center of the stereo field.

Following the same pattern already used for `LanderRcsSound` /
`ShuttleThrusterSound` / `proceduralAudio.ts`, footsteps are now synthesized
on demand in the Web Audio graph. Each step is a one-shot voice with its own
stereo position, pitch jitter, intensity, and (optionally) cadence change for
sprint.

## Goals

- Lock left/right step audio to the simulation's actual step timer — no drift.
- Per-foot stereo so the player hears the foot that just landed.
- Subtle jitter (pitch, level, interval) so a long walk doesn't feel mechanical.
- Sprint cadence and tone change without needing extra samples.
- Keep the existing manifest entries available as a non-breaking change so the
  audio inventory tests don't churn.

## Non-Goals

- Surface detection beyond the existing `'habitat' | 'asteroid'` enum (no rock
  vs. metal vs. ice variants yet).
- Velocity-mapped step interval beyond the existing walk/sprint split.
- Replacing other looping recorded sounds (RCS, shuttle, etc.) — they already
  have procedural beds where relevant.
- Spatial 3D positioning (PannerNode) — `StereoPanner` is enough for first-person.

## Implementation

### `src/audio/proceduralFootstep.ts` (new)

Self-contained one-shot synth keyed by surface. Two recipes:

**Habitat (boots on alloy floor)**
- Click — high-passed white noise burst (~2.4 kHz HP), 60 ms decay.
- Thud  — brown noise low-passed at 220 Hz, 110 ms decay.
- Ring  — sine at 1.75 kHz, very small amp, 130 ms decay (slight metallic ting).

**Asteroid (boots on regolith)**
- Crunch — pink noise band-passed at 900 Hz with cutoff sweep down to 420 Hz.
- Thud   — brown noise low-passed at 160 Hz.
- Tail   — pink noise low-passed at 600 Hz with longer release (grit residue).

Each call accepts:
- `stereo` (-1..1) — explicit pan for the foot that just landed.
- `pitchScale` — multiplier on every filter cutoff / oscillator frequency.
- `intensity` (0..1) — peak amplitude scaler (sprint vs. walk).
- `volume` — sfx category gain pulled from `AudioManager.getCategoryVolume('sfx')`.

Nodes are scheduled with `start` / `stop` and the output gain is auto-disconnected
shortly after the longest tail to avoid leaks.

### `src/lib/fps/footstepSystem.ts` (rewrite)

Same public surface as before, plus:
- New optional `isSprinting` argument to `update()`.
- Step interval is jittered ±8% per call so the cadence is not perfectly periodic.
- Sprint shortens the base interval (habitat 0.45 → 0.32 s, asteroid 0.52 → 0.36 s)
  and bumps `intensity` from `0.55` to `0.85`.
- Even step index → left foot pan (-0.45), odd → right foot pan (+0.45).
- ±6% pitch jitter per step.

The system still gates on `isMoving && isGrounded` and still fires the first
step on the rising edge to avoid an initial silent gap.

### Call site changes

- `src/views/LevelViewController.ts` — passes the EVA sprint state (sprint
  action active **and** the sprint thruster has charge) to `footsteps.update`.
- `src/three/HabitatInteriorScene.ts` — unchanged (no sprint in the habitat).

### Manifest

`sfx.step.habitat.{1|2}` and `sfx.step.asteroid.{1|2}` entries remain in the
manifest and the audio inventory test still asserts they exist. They are simply
no longer triggered by `FootstepSystem`. Future work can either remove them or
repurpose for cinematics.

## Tuning knobs

All centralized in `src/lib/fps/footstepSystem.ts`:

- `WALK_INTERVAL`, `SPRINT_INTERVAL` — base cadence per surface (s).
- `STEREO_BIAS` — magnitude of left/right pan per foot.
- `PITCH_JITTER`, `INTERVAL_JITTER` — randomness ranges.
- `WALK_INTENSITY`, `SPRINT_INTENSITY` — synth amplitude knobs.

Per-recipe filter / envelope knobs live inside `proceduralFootstep.ts`.

## Verification

- `bun run type-check` — only pre-existing unrelated errors in
  `MapView.vue` / `ShuttleView.vue` / `ShuttleViewController.ts`.
- `bun test:unit src/audio` — 54/54 pass; manifest test unchanged.
- Manual: walk in EVA → alternating L/R, no drift. Sprint → tighter cadence,
  brighter steps. Walk in habitat → metallic transient with subtle ring.
