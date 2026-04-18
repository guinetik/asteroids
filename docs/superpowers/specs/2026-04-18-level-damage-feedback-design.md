# Level Scene Damage Feedback Port

**Date:** 2026-04-18
**Author:** guinetik (with agent assistance)
**Spec:** Port the FPS demo's player damage feedback (red vignette, directional
indicator, camera flinch, enemy hit-flash) into the asteroid level scene so the
player and enemies visibly react to combat during EVA missions.

## Problem

The standalone FPS demo (`FpsViewController` + `FpsView.vue`) wires up a full
damage feedback bundle every time the player gets hit:

1. A red radial-gradient **vignette** that fades out over ~0.3s.
2. A 12-slice **directional ring** that lights up the wedge facing the damage
   source for ~0.6s, so the player knows where the hit came from.
3. A random **camera flinch** (mouse-delta jolt) for kinaesthetic feedback.
4. **Knockback** away from the damage source.
5. A **white hit-flash** on whatever enemy controller (bacteriophage / spire /
   chimera) just took a projectile from the player's multi-tool.

The asteroid level scene (`LevelViewController` + `LevelView.vue`) only
implemented #4 (knockback). `ExterminateMinigame` and `RescueMinigame` told the
controller "the player took N damage" via `onDamagePlayer(damage, sourceX,
sourceZ)`, but the controller just deducted HP and pushed the player without
firing any visual feedback. Worse, `projectileSystem.onEnemyHit` was never wired
up at all in the level scene, so enemies in level missions never flashed when
the player shot them — they just silently lost HP. Combat felt mushy and
disconnected.

## Solution

Three coordinated changes plus one shared component:

### 1. New shared overlay: `src/components/DamageFeedback.vue`

Extracts the vignette + directional-ring SVG (originally inline in
`FpsView.vue`) into a single reusable component:

- Owns its own `requestAnimationFrame` loop for the ring fade-out timer.
- `flashOpacity` prop drives the radial vignette (so the controller can keep
  emitting it from a per-frame timer).
- `flash(angleRad)` method exposed via `defineExpose` — view controllers call
  this whenever a hit lands to point the ring at the source. Subsequent calls
  reset the fade timer.
- Encapsulates the slice math, gradient definitions, and `sliceOpacity`
  falloff curve (full / 0.4 / 0.1 across neighbouring slices).

`LevelView.vue` consumes this directly. `FpsView.vue` keeps its own inline
implementation for now (no behavioural changes to the demo).

### 2. `MiniGame.notifyEnemyHit?(enemy)` hook

The level controller owns `projectileSystem.onEnemyHit`, but each minigame
owns its enemy controllers. To bridge them without leaking controller maps,
the `MiniGame` interface now has an optional method:

```ts
notifyEnemyHit?(enemy: Enemy): void
```

`ExterminateMinigame` and `RescueMinigame` implement it: walk their three
controller maps (`groundControllers`, `chimeraControllers`, `spireControllers`),
match by `ctrl.enemy === enemy`, and call `flash()` on the winner. Survey and
collect minigames don't implement the method (they have no enemies).

`LevelViewController.init()` then sets:

```ts
this.projectileSystem.onEnemyHit = (enemy, pos) => {
  for (const mg of this.minigames) {
    mg.notifyEnemyHit?.(enemy)
  }
  // impact spark burst …
}
```

### 3. `LevelViewController.applyPlayerDamageFeedback(...)`

A single private helper that bundles the entire feedback chain in one place,
called from every `onDamagePlayer` and `onKillPlayer` handler:

```ts
private applyPlayerDamageFeedback(damage, sourceX, sourceZ): void {
  this.playerController?.takeDamage(damage)
  this.damageFlashTimer = DAMAGE_FLASH_DURATION  // 0.3s
  // knockback away from source
  // camera flinch (only while EVA — fpsCamera.applyMouseDelta)
  // emit onDamageDirection(relAngle) so the HUD ring lights up
}
```

The damage flash timer decays inside `tick()` and emits `onDamageFlash(0..1)`
every frame so the Vue overlay can mirror it. Both the existing exterminate
and rescue handlers were collapsed from ~14 inline lines down to a single
delegating line, which also fixed a latent bug where `onKillPlayer` skipped
all feedback.

### 4. `LevelView.vue` wiring

```vue
<DamageFeedback v-if="stateInfo.state === 'eva'" ref="damageFeedback"
                :flash-opacity="damageFlash" />
```

Plus the two new controller callbacks:

```ts
viewController.onDamageFlash = (opacity) => { damageFlash.value = opacity }
viewController.onDamageDirection = (angle) => {
  damageFeedback.value?.flash(angle)
}
```

The component only mounts during EVA so the ring/vignette can't accidentally
appear during the lander or cinematic phases.

## Constants

New constants in `LevelViewController.ts`:

| Constant | Value | Purpose |
|---|---|---|
| `DAMAGE_FLASH_DURATION` | `0.3` s | Lifetime of the red vignette after a hit |
| `DAMAGE_FLINCH_STRENGTH` | `80` | Camera flinch magnitude (mouse-delta units) |
| `CONTACT_KNOCKBACK` | `26` u/s | Lateral impulse on hit, > `maxSpeed` (20) so it actually shoves |

`DAMAGE_FLASH_DURATION` and `DAMAGE_FLINCH_STRENGTH` mirror `FpsViewController`.
`CONTACT_KNOCKBACK` was raised from `12` to `26` because the previous value was
half the player's `maxSpeed`, so the impulse felt like a soft nudge even with
the override window applied (see "Knockback override" below).

## Knockback override

The grounded branch of `FpsPlayerController.tick` overwrites `lateralVelocity`
to `(input * maxSpeed)` every frame so walking feels snappy. That's great for
movement but it silently swallowed any external impulse (`applyLateralImpulse`)
the very next frame, which is why contact knockback felt absent.

Fix: `applyLateralImpulse(x, z, overrideDurationS = 0.28)` now sets a
`knockbackTimer`. While the timer is active, the grounded branch switches to
momentum-preserving physics (input nudges along carried velocity, ground
friction bleeds it off) so the impulse is actually felt before walking control
snaps back. Default window is short enough (~0.28 s) that normal movement is
unaffected — only the moment after a hit looks different.

The flag also benefits the FPS demo, which used the same shape of impulse and
had the same invisible-knockback bug.

## Impact

- **EVA combat** — the player now has the same hit feedback they get in the
  FPS demo: red vignette pulses on hits, the slice-ring tells them which enemy
  hit them, and the camera jolts. Enemies visually flash when shot.
- **Lander / cinematic phases** — completely unaffected. The damage helper is
  only fired by minigame callbacks (which only fire during gameplay), the
  flinch is gated on `stateMachine.is('eva')`, and the overlay component
  unmounts whenever the state isn't EVA.
- **Other minigames** — `SurveyMinigame` and `CollectMinigame` don't damage
  the player and don't own enemies, so they're entirely untouched. The
  `notifyEnemyHit` method is optional, so they don't need to stub it.
- **Performance** — One extra `Map` lookup per projectile hit (across at most
  three controller maps, total a few dozen entries during the busiest fights).
  Damage timer runs one float subtraction per frame. No new allocations in the
  hot path.

## Files Changed

- `src/lib/minigame/MiniGame.ts` — added optional `notifyEnemyHit?(Enemy)`.
- `src/lib/minigame/ExterminateMinigame.ts` — implemented `notifyEnemyHit`.
- `src/lib/minigame/RescueMinigame.ts` — implemented `notifyEnemyHit`.
- `src/views/LevelViewController.ts` — added flash timer + callbacks +
  `applyPlayerDamageFeedback` helper, refactored exterminate/rescue handlers,
  wired `projectileSystem.onEnemyHit`.
- `src/components/DamageFeedback.vue` — new reusable overlay component.
- `src/views/LevelView.vue` — wired the overlay + callbacks.
- `src/three/FpsPlayerController.ts` — added `knockbackTimer` + override window
  so impulses survive the grounded movement loop.

## Verification

- `bun run type-check` — exit 0, no new errors.
- `bun test:unit` — 1127 tests passed (96 files).
