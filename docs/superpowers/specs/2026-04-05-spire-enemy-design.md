# Coronavirus Spire Enemy Design

**Date:** 2026-04-05
**Author:** guinetik
**Status:** Draft

## Overview

Add a second enemy type — the **Coronavirus Spire**, a floating ranged enemy that hovers above the terrain, maintains engagement distance, and fires slow projectiles at the player. No contact damage. Complements the melee Bacteriophage with a ranged archetype.

Built on top of the existing enemy system: `EnemyDirector`, `EnemyBehavior` interface, data-driven configs, and the damage feedback HUD.

## Scope

**In scope:**
- `RangedBehavior` — aggro/leash/wander + maintain preferred range + fire intent
- `EnemyProjectileSystem` — enemy-fired projectile management + player collision
- `SpireController` — procedural mesh (membrane, spikes, RNA core, floating bob)
- Spire config in `enemy-types.json`
- Extend `EnemyBehaviorOutput` with `wantsToFire`
- FpsViewController wiring — spawn spires alongside bacteriophages with `?enemies=true`
- Player damage feedback on projectile hit (reuses existing vignette/flinch/knockback)

**Out of scope:**
- Chimera Walker (third enemy type — future)
- Projectile dodging AI or cover-seeking behavior
- LevelViewController integration (portable, wired later)
- Projectile visual effects beyond a simple glowing sphere

## Architecture

### Layer 1: Domain Logic (`src/lib/fps/`)

#### `enemy.ts` — Extend EnemyBehaviorOutput

Add one field to the existing interface:

```ts
export interface EnemyBehaviorOutput {
  moveDir: { x: number; z: number }
  isMoving: boolean
  isChasing: boolean
  isAgitated: boolean
  /** True when the enemy wants to fire a projectile this frame. */
  wantsToFire: boolean
}
```

The Bacteriophage's `AggroBehavior` must be updated to include `wantsToFire: false` in all return statements. The `EnemyDirector` default `lastOutput` also needs the field. This is a mechanical change — add the field everywhere it's returned.

#### `rangedBehavior.ts` — New

Implements `EnemyBehavior` with three states:

1. **Idle/Wander:** Same as `AggroBehavior` — drift near spawn, pick random targets within `wanderRadius`, pause between them.

2. **Engage (approach):** Player entered `aggroRadius`. Move toward player until within `preferredRange`. Once in range, transition to hold.

3. **Engage (hold):** Within `preferredRange` of player. Stop moving. If player gets closer than `minRange`, back away. If player exceeds `preferredRange` again, resume approach. Fire projectiles on cooldown (`wantsToFire = true` for one frame when cooldown expires).

4. **Leash:** Player exceeds `leashRadius` — return to idle.

State transitions:
- idle → engage: `distance < aggroRadius`
- engage → idle: `distance > leashRadius`
- engage approach ↔ hold: `distance` crosses `preferredRange`
- hold → back away: `distance < minRange`

`isAgitated` is true when within `preferredRange` (engaged and in firing position).

Config fields consumed: `aggroRadius`, `leashRadius`, `agitateRadius` (= `preferredRange`), `wanderRadius`, `wanderSpeed`, `speed`, plus new: `preferredRange`, `minRange`, `fireRate`.

#### `enemyProjectileSystem.ts` — New

Manages enemy-fired projectiles and checks collision against the player.

```ts
interface EnemyProjectile {
  x: number; z: number; y: number
  vx: number; vz: number; vy: number
  age: number
  damage: number
  sourceX: number; sourceZ: number  // origin for directional feedback
}

class EnemyProjectileSystem implements Tickable {
  spawn(x, y, z, dirX, dirY, dirZ, speed, damage): void
  tick(dt): void  // move projectiles, check player collision, expire old ones
  setPlayerPosition(x, y, z): void
  onPlayerHit: ((damage: number, sourceX: number, sourceZ: number) => void) | null
}
```

Pure domain logic — no Three.js. The VC creates visual meshes for each projectile separately.

Player collision: sphere check against player position with a fixed `PLAYER_HIT_RADIUS` constant (e.g. 1.5 units).

Projectile lifetime: expires after `MAX_LIFETIME` seconds (e.g. 4s).

No terrain collision for simplicity — projectiles fly until they expire or hit the player.

#### `enemyTypes.ts` — Extend EnemyTypeConfig

Add new fields for ranged enemies:

```ts
export interface EnemyTypeConfig {
  // ... existing fields ...
  /** Preferred engagement distance (ranged enemies hold here). 0 = melee. */
  preferredRange: number
  /** Minimum distance — backs away if player is closer. 0 = no retreat. */
  minRange: number
  /** Projectile speed (units/s). 0 = no projectile. */
  projectileSpeed: number
  /** Damage per projectile hit. */
  projectileDamage: number
  /** Shots per second. */
  fireRate: number
  /** Hover height above terrain. 0 = ground unit. */
  floatHeight: number
}
```

Bacteriophage config gets the new fields set to 0 (melee, ground).

### Layer 2: Data (`src/data/fps/`)

#### `enemy-types.json` — Extend

```json
{
  "bacteriophage": {
    "maxHp": 75,
    "hitRadius": 2.5,
    "speed": 8,
    "aggroRadius": 40,
    "leashRadius": 60,
    "agitateRadius": 10,
    "wanderRadius": 15,
    "wanderSpeed": 2,
    "contactDamage": 15,
    "contactRadius": 2.0,
    "contactCooldown": 1.0,
    "preferredRange": 0,
    "minRange": 0,
    "projectileSpeed": 0,
    "projectileDamage": 0,
    "fireRate": 0,
    "floatHeight": 0
  },
  "spire": {
    "maxHp": 50,
    "hitRadius": 2.0,
    "speed": 4,
    "aggroRadius": 50,
    "leashRadius": 70,
    "agitateRadius": 25,
    "wanderRadius": 10,
    "wanderSpeed": 1.5,
    "contactDamage": 0,
    "contactRadius": 0,
    "contactCooldown": 0,
    "preferredRange": 25,
    "minRange": 12,
    "projectileSpeed": 30,
    "projectileDamage": 10,
    "fireRate": 0.5,
    "floatHeight": 6
  }
}
```

Spire: fragile (50 HP), slow (speed 4), prefers 25-unit range, backs off inside 12 units, fires 1 projectile every 2 seconds, hovers 6 units above terrain.

### Layer 3: Three.js (`src/three/`)

#### `SpireController.ts` — New

Procedural mesh ported from `docs/inspo/coronavirus-spire-demo.html`:

**Geometry:**
- Outer membrane: translucent sphere (`MeshPhysicalMaterial`, reddish, opacity 0.35)
- Inner core: opaque smaller sphere (dark red, emissive)
- RNA strand: torus knot inside (emissive red, spins)
- Spike proteins: 42 spikes distributed via Fibonacci sphere. Each spike = cylinder stalk + sphere bulb tip.
- Point light inside (orange/red glow)

**Animation:**
- Floating bob (sine wave on Y)
- Membrane breathing (scale pulse)
- Core pulse, RNA spin
- Spikes: idle = gentle sway. Agitated = extend outward + wobble faster.
- Fire flash: nearest spike to player flashes white when firing

**Hit/Death:**
- Hit: magenta flash on membrane + body recoil (same pattern as Bacteriophage)
- Death: membrane shrinks, spikes detach and fall with gravity + tumble, core flashes white, light fades. ~1.2s animated death like Bacteriophage.

**Scale:** The inspo spire has `baseRadius: 0.6`. At 2x scale that's ~1.2 unit radius body + spikes extending ~0.5 beyond. Floating at `floatHeight: 6` puts the body center at roughly player eye height (4.5), making it a clear target.

#### `EnemyProjectileMesh.ts` — New

Simple visual for enemy projectiles:
- Small glowing sphere (orange, emissive, additive blending)
- Trail effect optional (can be a simple scaled cylinder or just the sphere)
- `update(x, y, z)` to sync position each frame
- `dispose()` for cleanup

### Layer 4: ViewController Bridge

#### `FpsViewController.ts` — Modify

When `?enemies=true`:

1. Create `EnemyProjectileSystem` (domain) — tick at `TICK_PRIORITY_PHYSICS + 5`
2. Wire `onPlayerHit` → same damage feedback as contact damage (takeDamage, vignette, flinch, knockback from projectile source direction)
3. Spawn spires in addition to bacteriophages (e.g. 4 spires mixed in)
4. Each frame for spire handles: if `lastOutput.wantsToFire`, compute fire direction from enemy to player, call `enemyProjectileSystem.spawn()` + create a visual mesh
5. Sync spire Y to `terrainHeight + floatHeight` (instead of just terrain height)
6. Track visual projectile meshes, sync positions from domain system, remove on expire/hit

#### `EnemyDirector` changes

The director needs to know which behavior to create per enemy type. Currently it hardcodes `AggroBehavior`. It should check the type config:
- If `preferredRange > 0` → create `RangedBehavior`
- Else → create `AggroBehavior`

This keeps the spawn API unchanged: `director.spawn('spire', x, y, z)`.

## Testing

Tests focus on domain logic:

- **RangedBehavior:** idle wander, aggro transition, approach until preferred range, hold at range, back away when too close, fire intent on cooldown, leash return
- **EnemyProjectileSystem:** spawn creates projectile, tick moves it, player collision fires callback, projectile expires after lifetime, no hit when far away

No tests for Three.js controllers.

## File Summary

| File | Layer | Action |
|------|-------|--------|
| `src/lib/fps/enemy.ts` | Domain | Extend — add `wantsToFire` to output |
| `src/lib/fps/rangedBehavior.ts` | Domain | New — engage/hold/retreat + fire intent |
| `src/lib/fps/enemyProjectileSystem.ts` | Domain | New — enemy projectile management |
| `src/lib/fps/enemyTypes.ts` | Domain | Extend — new config fields |
| `src/lib/fps/enemyDirector.ts` | Domain | Modify — behavior selection by type |
| `src/data/fps/enemy-types.json` | Data | Extend — add spire config + new fields to bacteriophage |
| `src/three/SpireController.ts` | Three.js | New — procedural coronavirus mesh |
| `src/three/EnemyProjectileMesh.ts` | Three.js | New — glowing sphere visual |
| `src/views/FpsViewController.ts` | VC | Modify — spawn spires, wire projectile system |
| `src/lib/fps/__tests__/rangedBehavior.spec.ts` | Test | New |
| `src/lib/fps/__tests__/enemyProjectileSystem.spec.ts` | Test | New |
