# Shuttle Yaw RCS — Sub-Frame Angular Interpolation

**Date:** 2026-05-03
**Status:** Implemented (revised same day: bulk-velocity inheritance for orbit, then sub-frame `t` jitter to break parallel-stripe trails caused by lock-step velocities)
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

### 4. Bulk-velocity disconnect during orbit

After (1)–(3) shipped, free-roam RCS read correctly but the *orbiting* case
broke in a new way — particles trailed in a long thin streak hundreds of
units behind the ship instead of forming a wingtip puff.

Root cause: `MapOrbitFacade.tickOrbit` warps the shuttle along the orbital
path with `shuttleController.group.position.set(pos.x, planetY, pos.z)`
*without* updating the controller's internal `velocity`. So
{@link ShuttleController.currentVelocity} returns `(0, 0, 0)` mid-orbit even
though the ship is moving fast in world space. Combined with
`ParticleEmitter.emit(...)` setting `particle.velocity = pushVelocity + spread`
(no inheritance of bulk motion), particles spawn into inertial space at
emission time and just *sit* there — the shuttle whisks past at orbital
tangent speed while the puff stays fixed. Visually: a thin streak from where
the wingtip *was* to where it *is*, with the puff disconnected from the ship.

Free roam dodges this only because integrated free-roam speeds are small
relative to the RCS push (~8 u/s). Orbital tangents are several times
larger — the disconnect grows linearly with bulk speed.

### 5. Lock-step parallel-stripe artifact (caused by inheritance fix)

Adding bulk-velocity inheritance fixed the orbital disconnect, but it also
unintentionally exposed a striped-trail artifact across all flight modes,
most visible at moderate camera distance:

> "it can make some of the thruster lines parallel"

The cause is purely geometric:

1. **Within-batch alignment.** Per-frame the spawn loop placed particles at
   `t = (i + 1) / count` — i.e. exact, evenly-spaced fractions through the
   prev→current segment. Within one batch, particles are therefore on a
   *straight line* along the bulk-velocity direction, length `bulk_vel × dt`
   (~0.5 u for typical free-roam speed).
2. **Identical velocity.** With inheritance enabled, every particle in a
   batch gets the same `bulk_vel + push` (within tiny `±spread` jitter), so
   they preserve their relative spacing forever.
3. **Inter-batch shift.** Adjacent batches at the same age are offset by
   `push × dt` (~0.13 u for RCS) in the push direction.
4. **Spread too small.** `spread = 1.5 u/s` only diffuses positions by
   ~0.75 u over the 0.5 s lifetime — less than the inter-batch offset
   accumulated across the trail (~4 u for RCS). Insufficient blur.

Result: ~30 stacked, mathematically-aligned 0.5-u strands separated 0.13 u
sideways — textbook parallel banding. The same pathology shows up at lower
amplitude on thrust + brake whenever the within-batch direction
(bulk-velocity) differs from the inter-batch direction (`push - bulk_vel`),
e.g. yawing while thrusting where the 3-nozzle Y/Z offset adds an
orthogonal axis.

## Decision

Three coordinated knobs in `src/three/ThrusterEffectController.ts`:

### A. Sub-frame `t` jitter inside each particle's slot

The original revision used `t = (i + 1) / count` (last particle exactly at
`curr`, others at fixed fractions back). That fixed the one-frame
staleness from the original `t = i / count`, but it also locked all
particles in a batch onto an exact-spacing grid along the prev→current
segment — the seed of the parallel-stripe artifact described in
Problem §5.

Final schedule: random within each particle's slot.

```ts
function jitteredFrameT(i: number, count: number): number {
  return (i + Math.random()) / count
}

for (let i = 0; i < count; i++) {
  const t = jitteredFrameT(i, count)   // ← was (i + 1) / count
  // ...
}
```

Properties:

- **Same per-frame count.** No change to spawn cadence or density.
- **Same average position.** Mean `t` is `(i + 0.5) / count`, so the trail's
  geometric centroid still tracks the ship correctly — neither back-dated
  to `prev` nor pinned to `curr`.
- **Breaks lock-step.** Particles within a batch land at random fractions
  through the segment. Over many frames the trail is a fluffy column
  rather than a stack of mathematically-aligned strands.
- **Uniformly distributed across the dt window.** Statistically equivalent
  to continuous emission across the frame delta — the most physically
  plausible model.

Staleness: `t = 0` (a particle exactly at `prev`) only happens with
probability `1/count` per particle slot *and* `Math.random() = 0`, which
the JS spec gives essentially zero probability. The "puff at ship now"
behavior the player perceives is preserved because the *expected* youngest
particle each frame is at `1 - 1/(2 × count)` through the segment — close
to `curr`, just not exactly on it.

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

### C. Bump RCS visual mass + spread

```diff
- poolSize: 400,
- size: Math.max(3, 2.5 * s),
- spread: 1.5 * s,
+ poolSize: 800,
+ size: Math.max(5, 4 * s),
+ spread: 4.5 * s,
```

```diff
- const RCS_SPAWN_RATE = 250
+ const RCS_SPAWN_RATE = 800
```

`spawnRate × lifetime / 2 = 800 × 0.5 / 2 = 200` simultaneously alive
particles per side at peak — enough mass to read which wingtip is firing
during fast A↔D toggling. Pool sized at `800 × 0.5 = 400 alive system-wide`
which still has headroom for both wingtips firing in succession (alternating
yaw during fishtailing) inside the 800-slot pool.

Particle size of 5 px (was 3) keeps each puff visible without losing the
"smoky cold-gas puff" quality the
[trail spec](./2026-05-02-pimp-my-shuttle-thruster-trails.md#color-theory-rationale)
calls for — the soft radial particle texture still does the silhouette
work.

Spread of 4.5 u/s (was 1.5) gives ~2.25 u of position variance over the
0.5 s lifetime — comparable to the inter-batch sideways offset
accumulated across the trail (~4 u). Combined with the within-slot `t`
jitter from §A, this guarantees no residual striped structure in the RCS
plume regardless of bulk-velocity magnitude.

### D. Inherit shuttle bulk velocity at emission (RCS only)

Compute the shuttle's per-frame bulk world velocity from the captured
prev/current snapshots and add it to the RCS particle's exhaust velocity:

```ts
private computeShuttleBulkVelocity(dt: number): void {
  if (!this.prevShuttleWorldPos || dt <= 0) {
    SHUTTLE_BULK_VEL_SCRATCH.set(0, 0, 0)
    return
  }
  SHUTTLE_BULK_VEL_SCRATCH.subVectors(this.shuttle.position, this.prevShuttleWorldPos)
  SHUTTLE_BULK_VEL_SCRATCH.divideScalar(dt)
}
```

```ts
SPAWN_PUSH_DIR_SCRATCH.copy(localPush).applyQuaternion(SPAWN_INTERP_QUAT_SCRATCH)
if (inheritBulkVelocity) {
  SPAWN_PUSH_DIR_SCRATCH.add(SHUTTLE_BULK_VEL_SCRATCH)
}
emitter.emit(SPAWN_WORLD_POS_SCRATCH, SPAWN_PUSH_DIR_SCRATCH)
```

Why position delta and not `ShuttleController.currentVelocity`? Because the
orbit facade warps the shuttle without ever touching the controller's
internal `velocity` — `(currentPos - prevPos) / dt` works regardless of
whether the motion source is physics integration, orbit warp, slingshot
launch, or portal arrival. The same prev/current snapshot already used for
spawn-position interpolation just falls out as the velocity when divided by
`dt`.

Why RCS only (not main thrust / brake)? The user explicitly approved the
free-roam main-thrust look, which relies on the *non-inheritance* style:
particles get a fixed world-frame backward velocity (`PUSH_FORCE`-magnitude
in the shuttle's local-`-X` direction, rotated to world). Adding inherit to
main thrust would shorten the trail proportionally to the ship's forward
speed (at max speed, the trail would shrink ~50%) — physically more correct
but breaks the iconic look. RCS doesn't have this constraint because its
push is small (8 u/s) and its purpose is "wingtip puff," not "long exhaust
stream"; inheriting bulk velocity makes the puff behave the same way at any
ship speed, free roam or orbit.

Teleports (portals, respawns, slingshot warps) are handled implicitly:
{@link captureFrameStartShuttleTransform} force-snaps `prevShuttleWorldPos`
to the current position when the per-frame distance exceeds
`SHUTTLE_TELEPORT_DISTANCE_THRESHOLD`, so the position delta — and thus the
inherited bulk velocity — is naturally zero on the teleport frame. We never
emit a frame's worth of particles with a phantom warp velocity.

## Implementation

### New module-level scratches

```ts
const SPAWN_INTERP_QUAT_SCRATCH = new THREE.Quaternion()
const SPAWN_LOCAL_PUSH_SCRATCH = new THREE.Vector3()
const SHUTTLE_BULK_VEL_SCRATCH = new THREE.Vector3()
```

`SPAWN_LOCAL_PUSH_SCRATCH` holds the *shuttle-local* push (e.g.
`(-PUSH_FORCE * scale, 0, 0)` for rear thrust, `(0, 0, ±RCS_PUSH_FORCE * scale)`
for yaw RCS), set once per frame before the spawn loop. The per-particle
helper rotates it by the slerped quaternion, so the original frame-rate
pre-rotation in the caller is gone.

`SHUTTLE_BULK_VEL_SCRATCH` holds the per-frame bulk world velocity computed
from `(currentPos - prevPos) / dt`, added to RCS particle exhaust velocity
when `inheritBulkVelocity` is true.

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
| Hold A or D while orbiting a planet                  | Puff stays anchored to the wingtip and drifts outward; no long thin streak in the wake of the orbital path. |
| Toggle A↔D while orbiting                            | Each puff still reads as coming from the active wingtip — bulk-velocity inheritance keeps the orbit's tangent speed from disconnecting puff from ship. |
| Hold A or D during sustained free-roam thrust        | RCS puff reads as a fluffy plume — *no parallel stripes* in the trail, regardless of camera distance or angle. |
| Hold W + A simultaneously                            | Main thrust fan and RCS puff coexist without either showing parallel-row banding (3-nozzle structure stays blurred by sub-frame `t` jitter). |

Quality bar (CLAUDE.md):

- `bun run type-check` — passes.
- `bun run lint` — oxlint 0 errors, ESLint 0 errors / 0 warnings, shaders pass.
- `bun run test:unit` — 2222 tests pass.

## Files

- `src/three/ThrusterEffectController.ts` — module-level
  `SPAWN_INTERP_QUAT_SCRATCH`, `SPAWN_LOCAL_PUSH_SCRATCH`, and
  `SHUTTLE_BULK_VEL_SCRATCH`; `prevShuttleQuaternion` field; renamed
  `captureFrameStartShuttleTransform` / `commitFrameEndShuttleTransform`;
  new `computeShuttleBulkVelocity(dt)` helper; rewritten
  `emitInterpolatedParticle` (replaces `computeInterpolatedNozzleWorldPos`,
  takes `inheritBulkVelocity: boolean`); bumped RCS pool / size / spawn
  rate / spread; new `jitteredFrameT(i, count)` module helper for
  `t = (i + Math.random()) / count` sub-frame jitter; spawn loops use
  `jitteredFrameT` with shuttle-local push; RCS opts in to bulk-velocity
  inheritance, thrust and brake opt out.

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
