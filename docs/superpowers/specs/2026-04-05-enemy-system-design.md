# Enemy System Design — Bacteriophage

**Date:** 2026-04-05
**Author:** guinetik
**Status:** Draft

## Overview

Add a domain-level enemy spawning and behavior system to the FPS layer. The first enemy type is a procedurally-generated **Bacteriophage** — a small 8-legged spider-like walker that idles near its spawn point, aggros when the player enters range, chases with contact damage, and can be killed with the multi-tool weapon.

The system is designed so the quest system can call `EnemyDirector.spawn()` to place enemies on the map. All behavior logic lives in `src/lib/` (pure TS, no Three.js). Visual controllers live in `src/three/`. The FpsViewController bridges them.

## Scope

**In scope:**
- `EnemyBehavior` interface and `AggroBehavior` implementation (idle wander + chase)
- `EnemyDirector` domain service (spawn, despawn, tick, contact damage)
- Data-driven enemy type configs in `src/data/fps/enemy-types.json`
- `BacteriophageController` procedural mesh (ported from inspo demo)
- FpsViewController integration with `?enemies=true` query param
- Player can kill enemies with the weapon multi-tool mode
- Enemies deal contact damage to the player

**Out of scope:**
- Chimera and Spire enemy types (future)
- Ranged enemy attacks
- Loot drops, XP, or quest completion hooks
- LevelViewController integration (portable, but wired later)
- Pathfinding or obstacle avoidance

## Architecture

### Layer 1: Domain Logic (`src/lib/fps/`)

#### `enemy.ts` — Extend Existing

Add an `EnemyBehavior` interface that the director ticks each frame:

```ts
interface EnemyBehaviorOutput {
  /** Normalized movement direction (zero vector = idle). */
  moveDir: Vector2
  /** Whether the enemy is actively moving. */
  isMoving: boolean
  /** Whether the enemy is agitated (close to player). */
  isAgitated: boolean
}

interface EnemyBehavior {
  tick(dt: number, enemyPos: Vector2, playerPos: Vector2): EnemyBehaviorOutput
}
```

Uses `Vector2` (xz plane) since enemies are ground-bound. The `Enemy` class itself stays unchanged — it's just HP + hitRadius.

#### `aggroBehavior.ts` — New

Implements `EnemyBehavior` with two states:

1. **Idle/Wander:** Enemy drifts slowly near its spawn point. Picks a random wander target within `wanderRadius` of spawn, walks to it, pauses, picks another. Subtle weaving on movement (sine offset like the inspo demo).

2. **Chase:** When player enters `aggroRadius`, switch to chase. Move toward player at full speed. `isAgitated = true` when within `agitateRadius` (inner ring, drives visual intensity). When player leaves `leashRadius` (> aggroRadius), return to idle and walk back toward spawn.

State transitions:
- idle → chase: `distance(enemy, player) < aggroRadius`
- chase → idle: `distance(enemy, player) > leashRadius`

Constants come from the enemy type config (no magic numbers).

#### `enemyDirector.ts` — New

Domain service that manages all live enemies:

```ts
interface EnemyHandle {
  readonly id: number
  readonly enemy: Enemy
  readonly behavior: EnemyBehavior
  readonly type: string
}

class EnemyDirector implements Tickable {
  spawn(type: string, position: Vector3): EnemyHandle
  despawn(handle: EnemyHandle): void
  despawnAll(): void
  tick(dt: number): void

  /** All currently alive enemy handles. */
  get enemies(): readonly EnemyHandle[]

  /** Set each frame by the VC — director reads player position for aggro checks. */
  playerPosition: Vector3

  /** Fired when an enemy touches the player (contact damage). */
  onContactDamage: ((handle: EnemyHandle, damage: number) => void) | null
}
```

`tick()` does:
1. For each alive enemy: tick its behavior with current playerPosition
2. Apply behavior output to enemy position (move along `moveDir` at type speed)
3. Check contact damage: if `distance(enemy, player) < contactRadius` and cooldown expired, fire `onContactDamage`
4. Enemy Y position is NOT managed by the director — the VC syncs each enemy's Y to the heightmap after the director ticks. This keeps the director free of Three.js/terrain dependencies.

The director does NOT know about Three.js. It works with `Enemy` instances and positions. The VC reads handle positions each frame and syncs the visual controllers.

#### `enemyTypes.ts` — New

Loads and exposes typed enemy configs from `src/data/fps/enemy-types.json`:

```ts
interface EnemyTypeConfig {
  maxHp: number
  hitRadius: number
  speed: number
  aggroRadius: number
  leashRadius: number
  agitateRadius: number
  wanderRadius: number
  wanderSpeed: number
  contactDamage: number
  contactRadius: number
  contactCooldown: number
}
```

### Layer 2: Data (`src/data/fps/`)

#### `enemy-types.json` — New

```json
{
  "bacteriophage": {
    "maxHp": 75,
    "hitRadius": 1.5,
    "speed": 8,
    "aggroRadius": 40,
    "leashRadius": 60,
    "agitateRadius": 10,
    "wanderRadius": 15,
    "wanderSpeed": 2,
    "contactDamage": 15,
    "contactRadius": 2.0,
    "contactCooldown": 1.0
  }
}
```

Values are first-pass estimates. `hitRadius` is the projectile collision sphere. `contactRadius` is the player touch distance. `aggroRadius` is the detection range. `leashRadius` > `aggroRadius` to prevent oscillation at the boundary.

### Layer 3: Three.js (`src/three/`)

#### `BacteriophageController.ts` — New

Procedural mesh controller ported from `docs/inspo/bacteriophage-demo.html`. Follows the existing controller pattern (like `TargetDummyController`).

**Structure:**
- `group: THREE.Group` — root transform, added to scene
- `enemy: Enemy` — domain entity (created by director, passed in)
- Builds procedural geometry: baseplate, trunk, segmented collar, icosahedron head, torus knot DNA core, 8 tube-geometry legs, point light

**Tick behavior:**
- Receives `isMoving` and `isAgitated` from the director's behavior output
- Moving: walking leg gait (alternating tetrapod from inspo), body bob and rock
- Idle: planted legs with subtle knee twitch, gentle breathing
- Core spins and pulses, light pulses
- Facing: rotates group to face movement direction

**Hit feedback:**
- `flash()` — turns head material white for 0.08s (same as inspo `hit()`)

**Death animation:**
- Legs collapse inward (same as inspo `die()`)
- Core flashes white, light spikes
- Group removed from scene after 300ms

**Scale:** The inspo phage is roughly 1.6 units tall (head at 0.75 + 0.4 radius, legs reach ~1.2 out). At player eye height of 4.5 units, these are knee-high scuttlers. We may want to scale up 2x to make them more threatening — tunable via a scale constant.

### Layer 4: ViewController Bridge

#### `FpsViewController.ts` — Modify

When `?enemies=true` is in the URL:

1. **Create** `EnemyDirector` with heightmap reference
2. **Spawn** 6-10 bacteriophages at random positions within the terrain, at ground height
3. **For each spawn:**
   - Create `BacteriophageController` with the handle's `Enemy`
   - Add controller group to scene
   - Register handle's enemy with `projectileSystem.addEnemy()`
   - Register controller as tickable at `TICK_PRIORITY_ANIMATION`
4. **Each frame (in `tick()`):**
   - Set `director.playerPosition` from player group position
   - For each handle: sync controller visual state from behavior output
   - For each handle: sync controller group position from enemy position
   - Sync enemy Y to heightmap
5. **Contact damage callback:** `playerController.takeDamage(damage)`
6. **Enemy hit callback:** `projectileSystem.onEnemyHit` → find matching controller → `flash()`
7. **Enemy death:** Remove controller from scene and tick handler, despawn from director
8. **Dispose:** `director.despawnAll()`, dispose all controllers

Director ticks at `TICK_PRIORITY_PHYSICS + 4` (after projectiles). Controllers tick at `TICK_PRIORITY_ANIMATION`.

## Portability to LevelView

The design is portable because:
- `EnemyDirector` is pure domain logic — the LevelViewController can create one the same way
- `BacteriophageController` just needs a group added to a scene
- The same wiring pattern (spawn → register → sync) works in `enterEva()` / `exitEva()`
- Quest system calls `director.spawn()` with a position — no VC-specific coupling

## Testing

Tests focus on domain logic in `src/lib/fps/`:

- **AggroBehavior:** idle wander stays within radius, aggro triggers at range, chase produces movement toward player, leash returns to idle
- **EnemyDirector:** spawn creates handle, despawn removes it, tick moves enemies, contact damage fires at correct range with cooldown
- **Enemy (existing):** already tested via projectile system

No tests for Three.js controllers (per project convention).

## File Summary

| File | Layer | Action |
|------|-------|--------|
| `src/lib/fps/enemy.ts` | Domain | Extend — add `EnemyBehavior` interface |
| `src/lib/fps/aggroBehavior.ts` | Domain | New — idle/wander + chase behavior |
| `src/lib/fps/enemyDirector.ts` | Domain | New — spawn/despawn/tick service |
| `src/lib/fps/enemyTypes.ts` | Domain | New — typed config loader |
| `src/data/fps/enemy-types.json` | Data | New — bacteriophage config |
| `src/three/BacteriophageController.ts` | Three.js | New — procedural mesh + animation |
| `src/views/FpsViewController.ts` | VC | Modify — wire director + controllers |
| `src/lib/fps/__tests__/aggroBehavior.spec.ts` | Test | New |
| `src/lib/fps/__tests__/enemyDirector.spec.ts` | Test | New |
