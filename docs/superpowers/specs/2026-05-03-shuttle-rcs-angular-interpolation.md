# Shuttle Yaw RCS — Sub-Frame Angular Interpolation

**Date:** 2026-05-03
**Status:** Implemented
**Owner:** guinetik

## Problem

After the [main-thrust density / gap fix](./2026-05-02-pimp-my-shuttle-thruster-trails.md)
(translation lerp on `prevShuttleWorldPos → currentPos`), the main rear engine
plume reads correctly at any speed and zoom level. **But the shuttle's A / D
yaw RCS still feels wrong.** Player feedback:

> if i toggle A to D to A to D it doesnt look like i can see it coming from
> one side versus the other. ... the emitter is probably not considering
> the shuttle's rotation, plus the speed... angular momentum is not preserved.
> currently it looks like the emitter is coming from where the ship was a
> clock cycle ago and go from there.

Two distinct root causes hide behind that single perception:

### 1. One-frame staleness, weighted heavily on RCS

The pre-fix spawn loop scheduled batched particles with `t = i / count`,
distributing them across `lerp(prevPos, currentPos, t)`. Two implications:

| Emitter           | `count` per frame @ 60 Hz | Weight of `t = 0` (prev) particle |
| ----------------- | ------------------------: | --------------------------------: |
| Main thrust       | ~33 (`THRUST_SPAWN_RATE = 2000`) | 3 % — invisible              |
| Brake             | ~25 (`BRAKE_SPAWN_RATE = 1500`)  | 4 % — invisible              |
| **Yaw RCS (old)** | **~4 (`RCS_SPAWN_RATE = 250`)**  | **25 % — extremely visible** |

For RCS, *one in four* particles per frame literally spawned at the shuttle's
position one frame ago. During fast A↔D toggling, that frame-stale particle
is the leading edge of the puff the player sees, which is why "it looks like
the emitter is coming from where the ship was a clock cycle ago."

### 2. No quaternion interpolation during yaw

`computeInterpolatedNozzleWorldPos` lerped the world *position* but reused
the *current* quaternion to rotate the wingtip offset. During pure yaw (the
exact case A and D fire in), the shuttle's center barely translates while
its wingtips arc through world space:

```
prev wingtip world pos  ────╮
                            │  (rotational arc — all collapsed to a single
                            │   world point because we used currentQuat for
                            │   every particle)
curr wingtip world pos ─────╯
```

So all `count` particles in a yaw frame ended up at the *same* world point
(the post-yaw wingtip), and on the next frame they shifted to the next
post-yaw wingtip — discrete steps, no continuity, no readable directionality.

### 3. Visual mass too small to read directionality

Even with the above fixed, RCS at `poolSize: 400`, `size: 3`, and
`spawnRate: 250` produces ~12 simultaneously alive particles per side at
peak (`spawnRate × lifetime / 2` per wingtip). Compared to the ~1000-particle
main thrust plume, that's not enough mass for the eye to localize a side.

## Decision

Three coordinated knobs in `src/three/ThrusterEffectController.ts`:

### A. Schedule particles at the *end* of the frame, not the start

```ts
for (let i = 0; i < count; i++) {
  const t = (i + 1) / count   // ← was i / count
  // ...
}
```

Now `t ∈ (0, 1]`. The *last* particle of every frame spawns at the shuttle's
current transform, and the first at `1/count` past `prev`. For RCS the
relevant quartile is `[0.25, 0.50, 0.75, 1.00]` — the puff is anchored at
the ship's current position with a small smear *into* the present, instead
of starting one frame in the past. For thrust/brake, the shift is sub-pixel
(`1/33`, `1/25`).

This is the single change the player perceives as "the puff comes from the
ship now, not from where it was."

### B. Slerp the shuttle quaternion sub-frame

Track `prevShuttleQuaternion` alongside `prevShuttleWorldPos`, and slerp
inside the per-particle helper:

```ts
SPAWN_INTERP_QUAT_SCRATCH.slerpQuaternions(prevQuat, this.shuttle.group.quaternion, t)
SPAWN_WORLD_POS_SCRATCH
  .copy(localOffset)
  .multiplyScalar(scale)
  .applyQuaternion(SPAWN_INTERP_QUAT_SCRATCH)   // ← interpolated, not current
  .add(SPAWN_INTERP_POS_SCRATCH)
SPAWN_PUSH_DIR_SCRATCH.copy(localPush).applyQuaternion(SPAWN_INTERP_QUAT_SCRATCH)
emitter.emit(SPAWN_WORLD_POS_SCRATCH, SPAWN_PUSH_DIR_SCRATCH)
```

This applies to both the **spawn position** (the wingtip arc) and the
**push velocity** (the exhaust direction). Each particle's exhaust now
matches the orientation of the shuttle at its sub-frame moment of emission
— that is the literal definition of "preserving angular momentum in the
trail."

For pure translation (no yaw), `slerp(prev, curr, t)` returns the same
quaternion as before (`prev == curr`), so the previous translation-only
behavior is preserved exactly.

### C. Bump RCS visual mass

```diff
- poolSize: 400,
- size: Math.max(3, 2.5 * s),
+ poolSize: 800,
+ size: Math.max(5, 4 * s),
```

```diff
- const RCS_SPAWN_RATE = 250
+ const RCS_SPAWN_RATE = 600
```

`spawnRate × lifetime / 2 = 600 × 0.5 / 2 = 150` simultaneously alive
particles per side at peak — enough mass to read which wingtip is firing
during fast A↔D toggling. Pool sized at `600 × 0.5 = 300 alive system-wide`
plus headroom for both wingtips firing in succession (alternating yaw
during fishtailing).

Particle size of 5 px (was 3) keeps each puff visible without losing the
"smoky cold-gas puff" quality the
[trail spec](./2026-05-02-pimp-my-shuttle-thruster-trails.md#color-theory-rationale)
calls for — the soft radial particle texture still does the silhouette
work.

## Implementation

### New module-level scratches

```ts
const SPAWN_INTERP_QUAT_SCRATCH = new THREE.Quaternion()
const SPAWN_LOCAL_PUSH_SCRATCH = new THREE.Vector3()
```

`SPAWN_LOCAL_PUSH_SCRATCH` holds the *shuttle-local* push (e.g.
`(-PUSH_FORCE * scale, 0, 0)` for rear thrust, `(0, 0, ±RCS_PUSH_FORCE * scale)`
for yaw RCS), set once per frame before the spawn loop. The per-particle
helper rotates it by the slerped quaternion, so the original frame-rate
pre-rotation in the caller is gone.

### New `prevShuttleQuaternion` field + capture/commit pair

```ts
private prevShuttleQuaternion: THREE.Quaternion | null = null

private captureFrameStartShuttleTransform(): void {
  if (!this.prevShuttleWorldPos || !this.prevShuttleQuaternion) {
    this.prevShuttleWorldPos = this.shuttle.position.clone()
    this.prevShuttleQuaternion = this.shuttle.group.quaternion.clone()
    return
  }
  if (
    this.prevShuttleWorldPos.distanceToSquared(this.shuttle.position) >
    SHUTTLE_TELEPORT_DISTANCE_THRESHOLD * SHUTTLE_TELEPORT_DISTANCE_THRESHOLD
  ) {
    this.prevShuttleWorldPos.copy(this.shuttle.position)
    this.prevShuttleQuaternion.copy(this.shuttle.group.quaternion)
  }
}

private commitFrameEndShuttleTransform(): void {
  this.prevShuttleWorldPos?.copy(this.shuttle.position)
  this.prevShuttleQuaternion?.copy(this.shuttle.group.quaternion)
}
```

Teleport detection (`SHUTTLE_TELEPORT_DISTANCE_THRESHOLD`) snaps both pos
*and* quat on a warp — the same logic as the pure-translation fix. A portal
that rotates *and* translates the shuttle would otherwise smear a frame's
worth of particles across the rotational delta.

### Single per-particle helper for all three emitters

`emitInterpolatedParticle(emitter, localOffset, localPush, scale, t)` is
the only spawn path now. Thrust, brake, and yaw RCS all funnel through it.
Cost per particle: one quat slerp + two `applyQuaternion` calls + one lerp
+ one `add`. Negligible at the largest single-frame load (~33 particles for
thrust, ~10 for RCS at the new rate).

## Verification

| Behavior under test                                  | Expected outcome                                                                         |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Tap A briefly                                        | Puff visibly emerges from the *right* wingtip at the shuttle's current world position.   |
| Tap D briefly immediately after                      | Next puff visibly emerges from the *left* wingtip — A and D readable as distinct sides.  |
| Hold A while flying laterally                        | Trail traces the right wingtip's *arc* through world space (slerped quat), not stairsteps. |
| Hold A while spinning fast (high `currentAngularVelocity`) | Each particle's exhaust direction follows the orientation at its sub-frame emission moment. |
| Slingshot warp / portal teleport while yawing        | No smear of particles across the warp gap (teleport snap on both pos and quat).          |

Quality bar (CLAUDE.md):

- `bun run type-check` — passes.
- `bun run lint` — oxlint 0 errors, ESLint 0 errors / 0 warnings, shaders pass.
- `bun run test:unit` — 2222 tests pass.

## Files

- `src/three/ThrusterEffectController.ts` — module-level
  `SPAWN_INTERP_QUAT_SCRATCH` and `SPAWN_LOCAL_PUSH_SCRATCH`,
  `prevShuttleQuaternion` field, renamed
  `captureFrameStartShuttleTransform` / `commitFrameEndShuttleTransform`,
  rewritten `emitInterpolatedParticle` (replaces
  `computeInterpolatedNozzleWorldPos`), bumped RCS pool / size / spawn rate,
  spawn loops switched to `t = (i + 1) / count` with shuttle-local push.

## Notes

- The lander's RCS quads share the same `ParticleEmitter` machinery but spawn
  through a different controller. They were *not* changed in this fix — the
  reported issue is shuttle-specific (the lander has six omnidirectional RCS
  quads instead of two wingtips, so there's no single-side directionality
  signal that needs preserving). Revisit if/when lander yaw clarity becomes
  a concern.
- The `(i + 1) / count` schedule is now applied uniformly across thrust,
  brake, and RCS. For thrust at ~33 particles/frame the difference is below
  one screen pixel; the consistency keeps a single interpretation of the
  spawn schedule across emitters and avoids per-emitter branching.
- Push velocity is now rotated by the *interpolated* quaternion. For high
  yaw rates this causes each particle's exhaust to fan correctly through
  the rotational arc instead of pointing in a uniform "current" direction.
  At low yaw rates the per-particle direction differs from the frame-mean
  direction by `< 1°`, well below visual perception threshold.
- RCS particle `lifetime` (0.5 s) and `spread` (1.5 × scale) are unchanged
  — only emission cadence, mass, and quaternion handling were modified.
