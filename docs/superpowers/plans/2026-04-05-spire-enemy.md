# Coronavirus Spire Enemy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a floating ranged Coronavirus Spire enemy that hovers, maintains engagement distance, and fires slow projectiles at the player.

**Architecture:** Extends the existing enemy system with `RangedBehavior` (hold distance + fire intent), `EnemyProjectileSystem` (enemy projectile lifecycle + player collision), and `SpireController` (procedural mesh). The `EnemyDirector` selects behavior by type config. All wired into FpsViewController alongside existing Bacteriophage enemies.

**Tech Stack:** TypeScript, Three.js, Vitest, Vite JSON imports

**Spec:** `docs/superpowers/specs/2026-04-05-spire-enemy-design.md`

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `src/lib/fps/enemy.ts` | Modify | Add `wantsToFire` to `EnemyBehaviorOutput` |
| `src/lib/fps/aggroBehavior.ts` | Modify | Add `wantsToFire: false` to all returns |
| `src/lib/fps/enemyDirector.ts` | Modify | Add `wantsToFire` to default output, select behavior by type |
| `src/lib/fps/enemyTypes.ts` | Modify | Add ranged fields to `EnemyTypeConfig` |
| `src/data/fps/enemy-types.json` | Modify | Add spire config + new fields to bacteriophage |
| `src/lib/fps/rangedBehavior.ts` | Create | Engage/hold/retreat AI + fire intent |
| `src/lib/fps/enemyProjectileSystem.ts` | Create | Enemy projectile management + player hit |
| `src/three/SpireController.ts` | Create | Procedural coronavirus mesh + animation |
| `src/three/EnemyProjectileMesh.ts` | Create | Glowing sphere visual for enemy projectiles |
| `src/views/FpsViewController.ts` | Modify | Spawn spires, wire projectile system |
| `src/lib/fps/__tests__/rangedBehavior.spec.ts` | Create | RangedBehavior tests |
| `src/lib/fps/__tests__/enemyProjectileSystem.spec.ts` | Create | EnemyProjectileSystem tests |

---

### Task 1: Extend EnemyBehaviorOutput + EnemyTypeConfig + Data

**Files:**
- Modify: `src/lib/fps/enemy.ts`
- Modify: `src/lib/fps/aggroBehavior.ts`
- Modify: `src/lib/fps/enemyDirector.ts`
- Modify: `src/lib/fps/enemyTypes.ts`
- Modify: `src/data/fps/enemy-types.json`

- [ ] **Step 1: Add wantsToFire to EnemyBehaviorOutput**

In `src/lib/fps/enemy.ts`, add `wantsToFire` to the `EnemyBehaviorOutput` interface after `isAgitated`:

```ts
export interface EnemyBehaviorOutput {
  /** Normalized movement direction on the XZ plane (zero = idle). */
  moveDir: { x: number; z: number }
  /** Whether the enemy is actively moving. */
  isMoving: boolean
  /** Whether the enemy is chasing the player (vs idle wander). */
  isChasing: boolean
  /** Whether the enemy is agitated (close to player). */
  isAgitated: boolean
  /** Whether the enemy wants to fire a projectile this frame. */
  wantsToFire: boolean
}
```

- [ ] **Step 2: Add wantsToFire: false to all AggroBehavior returns**

In `src/lib/fps/aggroBehavior.ts`, add `wantsToFire: false` to all 5 return statements:

Line ~114 (tickChase standing still):
```ts
return { moveDir: { x: 0, z: 0 }, isMoving: false, isChasing: true, isAgitated: true, wantsToFire: false }
```

Line ~137 (tickChase moving):
```ts
return { moveDir: { x: dirX, z: dirZ }, isMoving: true, isChasing: true, isAgitated, wantsToFire: false }
```

Line ~148 (tickIdle pausing):
```ts
return { moveDir: { x: 0, z: 0 }, isMoving: false, isChasing: false, isAgitated: false, wantsToFire: false }
```

Line ~159 (tickIdle arrived):
```ts
return { moveDir: { x: 0, z: 0 }, isMoving: false, isChasing: false, isAgitated: false, wantsToFire: false }
```

Lines ~164-169 (tickIdle moving to wander target):
```ts
return {
  moveDir: { x: wx * invDist, z: wz * invDist },
  isMoving: true,
  isChasing: false,
  isAgitated: false,
  wantsToFire: false,
}
```

- [ ] **Step 3: Add wantsToFire to EnemyDirector default lastOutput**

In `src/lib/fps/enemyDirector.ts`, update the `lastOutput` default in `spawn()` (~line 95):

```ts
lastOutput: { moveDir: { x: 0, z: 0 }, isMoving: false, isChasing: false, isAgitated: false, wantsToFire: false },
```

- [ ] **Step 4: Extend EnemyTypeConfig with ranged fields**

In `src/lib/fps/enemyTypes.ts`, add these fields to `EnemyTypeConfig` after `contactCooldown`:

```ts
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
```

- [ ] **Step 5: Update enemy-types.json**

Replace `src/data/fps/enemy-types.json` with:

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

- [ ] **Step 6: Verify type-check and existing tests pass**

Run: `bun run type-check && bun test:unit`
Expected: PASS — all 455 tests still pass, no type errors

- [ ] **Step 7: Commit**

```bash
git add src/lib/fps/enemy.ts src/lib/fps/aggroBehavior.ts src/lib/fps/enemyDirector.ts src/lib/fps/enemyTypes.ts src/data/fps/enemy-types.json
git commit -m "feat(enemy): extend behavior output with wantsToFire, add ranged type config + spire data"
```

---

### Task 2: RangedBehavior — Tests

**Files:**
- Create: `src/lib/fps/__tests__/rangedBehavior.spec.ts`

- [ ] **Step 1: Write RangedBehavior tests**

Create `src/lib/fps/__tests__/rangedBehavior.spec.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { RangedBehavior } from '../rangedBehavior'

const TEST_CONFIG = {
  aggroRadius: 50,
  leashRadius: 70,
  agitateRadius: 25,
  wanderRadius: 10,
  wanderSpeed: 1.5,
  speed: 4,
  preferredRange: 25,
  minRange: 12,
  fireRate: 0.5,
}

describe('RangedBehavior', () => {
  let behavior: RangedBehavior

  beforeEach(() => {
    behavior = new RangedBehavior(TEST_CONFIG)
  })

  // --- Idle state ---

  it('should start in idle state', () => {
    const out = behavior.tick(0.016, 0, 0, 999, 999)
    expect(out.isChasing).toBe(false)
    expect(out.wantsToFire).toBe(false)
  })

  // --- Aggro transition ---

  it('should engage when player enters aggro radius', () => {
    const out = behavior.tick(0.016, 0, 0, 40, 0)
    expect(out.isChasing).toBe(true)
    expect(out.isMoving).toBe(true)
    expect(out.moveDir.x).toBeGreaterThan(0)
  })

  it('should NOT engage when player is outside aggro radius', () => {
    const out = behavior.tick(0.016, 0, 0, 60, 0)
    expect(out.isChasing).toBe(false)
  })

  // --- Approach until preferred range ---

  it('should approach player when beyond preferred range', () => {
    // Player at distance 40 — beyond preferredRange of 25
    const out = behavior.tick(0.016, 0, 0, 40, 0)
    expect(out.isMoving).toBe(true)
    expect(out.moveDir.x).toBeGreaterThan(0)
  })

  it('should stop at preferred range', () => {
    // Player at exactly preferredRange
    const out = behavior.tick(0.016, 0, 0, 25, 0)
    expect(out.isMoving).toBe(false)
    expect(out.isAgitated).toBe(true)
  })

  // --- Hold at range ---

  it('should not move when within preferred range', () => {
    const out = behavior.tick(0.016, 0, 0, 20, 0)
    expect(out.isMoving).toBe(false)
    expect(out.isAgitated).toBe(true)
  })

  // --- Back away when too close ---

  it('should back away when player is within min range', () => {
    const out = behavior.tick(0.016, 0, 0, 8, 0)
    expect(out.isMoving).toBe(true)
    // Moving away from player (negative X since player is at +X)
    expect(out.moveDir.x).toBeLessThan(0)
  })

  // --- Fire intent ---

  it('should want to fire when in preferred range and cooldown expired', () => {
    // First tick at preferred range — cooldown starts fresh
    const out1 = behavior.tick(0.016, 0, 0, 20, 0)
    // fireRate is 0.5 (one shot every 2s), so first tick should fire
    expect(out1.wantsToFire).toBe(true)
  })

  it('should NOT fire when on cooldown', () => {
    // First tick fires
    behavior.tick(0.016, 0, 0, 20, 0)
    // Second tick — still on cooldown (only 16ms passed, need 2s)
    const out2 = behavior.tick(0.016, 0, 0, 20, 0)
    expect(out2.wantsToFire).toBe(false)
  })

  it('should fire again after cooldown expires', () => {
    behavior.tick(0.016, 0, 0, 20, 0) // fires
    behavior.tick(2.1, 0, 0, 20, 0) // cooldown passes
    const out = behavior.tick(0.016, 0, 0, 20, 0)
    expect(out.wantsToFire).toBe(true)
  })

  it('should NOT fire when outside preferred range', () => {
    const out = behavior.tick(0.016, 0, 0, 40, 0)
    expect(out.wantsToFire).toBe(false)
  })

  it('should NOT fire when idle', () => {
    const out = behavior.tick(0.016, 0, 0, 999, 999)
    expect(out.wantsToFire).toBe(false)
  })

  // --- Leash ---

  it('should return to idle when player exceeds leash radius', () => {
    behavior.tick(0.016, 0, 0, 40, 0) // engage
    const out = behavior.tick(0.016, 0, 0, 80, 0) // beyond leash
    expect(out.isChasing).toBe(false)
    expect(out.wantsToFire).toBe(false)
  })

  // --- Direction ---

  it('should back away in correct direction on Z axis', () => {
    const out = behavior.tick(0.016, 0, 0, 0, 8)
    expect(out.moveDir.z).toBeLessThan(0)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test:unit src/lib/fps/__tests__/rangedBehavior.spec.ts`
Expected: FAIL — `RangedBehavior` not found

- [ ] **Step 3: Commit failing tests**

```bash
git add src/lib/fps/__tests__/rangedBehavior.spec.ts
git commit -m "test(enemy): add RangedBehavior tests (red)"
```

---

### Task 3: RangedBehavior — Implementation

**Files:**
- Create: `src/lib/fps/rangedBehavior.ts`

- [ ] **Step 1: Implement RangedBehavior**

Create `src/lib/fps/rangedBehavior.ts`:

```ts
/**
 * Ranged enemy behavior — engage at distance, hold position, fire projectiles.
 *
 * States:
 * - **Idle:** Wander near spawn (same as AggroBehavior).
 * - **Engage (approach):** Move toward player until within preferred range.
 * - **Engage (hold):** Stop, face player, fire on cooldown.
 * - **Engage (retreat):** Back away if player gets within min range.
 *
 * @author guinetik
 * @date 2026-04-05
 * @spec docs/superpowers/specs/2026-04-05-spire-enemy-design.md
 */
import type { EnemyBehavior, EnemyBehaviorOutput } from './enemy'

/** Configuration for ranged behavior. */
export interface RangedBehaviorConfig {
  /** Distance at which the enemy starts engaging the player. */
  aggroRadius: number
  /** Distance at which the enemy gives up and returns to idle. */
  leashRadius: number
  /** Distance at which the enemy becomes visually agitated. */
  agitateRadius: number
  /** Maximum wander distance from spawn point. */
  wanderRadius: number
  /** Movement speed while wandering (units/s). */
  wanderSpeed: number
  /** Engagement movement speed (units/s). */
  speed: number
  /** Preferred engagement distance — holds position here. */
  preferredRange: number
  /** Minimum distance — backs away if player is closer. */
  minRange: number
  /** Shots per second. */
  fireRate: number
}

/** Minimum distance to wander target before picking a new one. */
const WANDER_ARRIVE_THRESHOLD = 2.0
const WANDER_PAUSE_MIN = 1.0
const WANDER_PAUSE_MAX = 3.0

/** Internal state for ranged behavior. */
type RangedState = 'idle' | 'engage'

/**
 * Ranged behavior — wander when idle, engage at preferred distance and fire.
 *
 * @author guinetik
 * @date 2026-04-05
 * @spec docs/superpowers/specs/2026-04-05-spire-enemy-design.md
 */
export class RangedBehavior implements EnemyBehavior {
  private readonly config: RangedBehaviorConfig
  private state: RangedState = 'idle'
  private elapsed = 0
  private fireCooldown = 0

  // Wander state
  private wanderTargetX = 0
  private wanderTargetZ = 0
  private wanderPause = 0
  private spawnX = 0
  private spawnZ = 0
  private spawnSet = false

  constructor(config: RangedBehaviorConfig) {
    this.config = config
  }

  /** @inheritdoc */
  tick(
    dt: number,
    enemyX: number,
    enemyZ: number,
    playerX: number,
    playerZ: number,
  ): EnemyBehaviorOutput {
    this.elapsed += dt

    if (!this.spawnSet) {
      this.spawnX = enemyX
      this.spawnZ = enemyZ
      this.spawnSet = true
      this.pickWanderTarget()
    }

    const dx = playerX - enemyX
    const dz = playerZ - enemyZ
    const distToPlayer = Math.sqrt(dx * dx + dz * dz)

    // State transitions
    if (this.state === 'idle' && distToPlayer < this.config.aggroRadius) {
      this.state = 'engage'
    } else if (this.state === 'engage' && distToPlayer > this.config.leashRadius) {
      this.state = 'idle'
      this.pickWanderTarget()
    }

    if (this.state === 'engage') {
      return this.tickEngage(dt, dx, dz, distToPlayer)
    }
    return this.tickIdle(dt, enemyX, enemyZ)
  }

  private tickEngage(
    dt: number,
    dx: number,
    dz: number,
    distToPlayer: number,
  ): EnemyBehaviorOutput {
    const inRange = distToPlayer <= this.config.preferredRange
    const tooClose = distToPlayer < this.config.minRange
    const isAgitated = inRange

    // Fire cooldown
    this.fireCooldown = Math.max(0, this.fireCooldown - dt)
    let wantsToFire = false
    if (inRange && this.fireCooldown <= 0) {
      wantsToFire = true
      this.fireCooldown = 1 / this.config.fireRate
    }

    // Movement
    if (tooClose) {
      // Back away from player
      const invDist = distToPlayer > 0.01 ? 1 / distToPlayer : 0
      return {
        moveDir: { x: -dx * invDist, z: -dz * invDist },
        isMoving: true,
        isChasing: true,
        isAgitated: true,
        wantsToFire,
      }
    }

    if (!inRange) {
      // Approach player
      const invDist = distToPlayer > 0.01 ? 1 / distToPlayer : 0
      return {
        moveDir: { x: dx * invDist, z: dz * invDist },
        isMoving: true,
        isChasing: true,
        isAgitated: false,
        wantsToFire: false,
      }
    }

    // Hold position — in range, not too close
    return {
      moveDir: { x: 0, z: 0 },
      isMoving: false,
      isChasing: true,
      isAgitated,
      wantsToFire,
    }
  }

  private tickIdle(
    dt: number,
    enemyX: number,
    enemyZ: number,
  ): EnemyBehaviorOutput {
    if (this.wanderPause > 0) {
      this.wanderPause -= dt
      return { moveDir: { x: 0, z: 0 }, isMoving: false, isChasing: false, isAgitated: false, wantsToFire: false }
    }

    const wx = this.wanderTargetX - enemyX
    const wz = this.wanderTargetZ - enemyZ
    const wanderDist = Math.sqrt(wx * wx + wz * wz)

    if (wanderDist < WANDER_ARRIVE_THRESHOLD) {
      this.wanderPause = WANDER_PAUSE_MIN + Math.random() * (WANDER_PAUSE_MAX - WANDER_PAUSE_MIN)
      this.pickWanderTarget()
      return { moveDir: { x: 0, z: 0 }, isMoving: false, isChasing: false, isAgitated: false, wantsToFire: false }
    }

    const invDist = 1 / wanderDist
    return {
      moveDir: { x: wx * invDist, z: wz * invDist },
      isMoving: true,
      isChasing: false,
      isAgitated: false,
      wantsToFire: false,
    }
  }

  private pickWanderTarget(): void {
    const angle = Math.random() * Math.PI * 2
    const radius = Math.random() * this.config.wanderRadius
    this.wanderTargetX = this.spawnX + Math.cos(angle) * radius
    this.wanderTargetZ = this.spawnZ + Math.sin(angle) * radius
  }
}
```

- [ ] **Step 2: Run tests to verify they pass**

Run: `bun test:unit src/lib/fps/__tests__/rangedBehavior.spec.ts`
Expected: All tests PASS

- [ ] **Step 3: Commit**

```bash
git add src/lib/fps/rangedBehavior.ts
git commit -m "feat(enemy): implement RangedBehavior — engage at distance, fire on cooldown"
```

---

### Task 4: EnemyProjectileSystem — Tests

**Files:**
- Create: `src/lib/fps/__tests__/enemyProjectileSystem.spec.ts`

- [ ] **Step 1: Write EnemyProjectileSystem tests**

Create `src/lib/fps/__tests__/enemyProjectileSystem.spec.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { EnemyProjectileSystem } from '../enemyProjectileSystem'

describe('EnemyProjectileSystem', () => {
  let system: EnemyProjectileSystem

  beforeEach(() => {
    system = new EnemyProjectileSystem()
  })

  // --- Spawning ---

  it('should spawn a projectile', () => {
    system.spawn(0, 5, 0, 1, 0, 0, 30, 10)
    expect(system.projectileCount).toBe(1)
  })

  // --- Movement ---

  it('should move projectiles along their direction', () => {
    const onMove = vi.fn()
    system.onProjectileMove = onMove
    system.spawn(0, 5, 0, 1, 0, 0, 30, 10)
    system.tick(0.1)
    // Should have moved 3 units in +X (speed 30 * dt 0.1)
    expect(onMove).toHaveBeenCalled()
    const [id, x] = onMove.mock.calls[0]!
    expect(x).toBeCloseTo(3, 0)
  })

  // --- Player collision ---

  it('should fire onPlayerHit when projectile reaches player', () => {
    const onHit = vi.fn()
    system.onPlayerHit = onHit
    system.setPlayerPosition(5, 5, 0)
    // Fire toward player at high speed
    system.spawn(0, 5, 0, 1, 0, 0, 100, 10)
    system.tick(0.1) // moves 10 units, passes through player at x=5
    expect(onHit).toHaveBeenCalledWith(10, 0, 0)
  })

  it('should NOT hit player when projectile is far away', () => {
    const onHit = vi.fn()
    system.onPlayerHit = onHit
    system.setPlayerPosition(100, 5, 100)
    system.spawn(0, 5, 0, 1, 0, 0, 30, 10)
    system.tick(0.1)
    expect(onHit).not.toHaveBeenCalled()
  })

  it('should remove projectile after hitting player', () => {
    system.onPlayerHit = vi.fn()
    system.setPlayerPosition(3, 5, 0)
    system.spawn(0, 5, 0, 1, 0, 0, 100, 10)
    system.tick(0.1)
    expect(system.projectileCount).toBe(0)
  })

  // --- Expiration ---

  it('should expire projectiles after max lifetime', () => {
    system.spawn(0, 5, 0, 1, 0, 0, 30, 10)
    system.tick(5) // exceeds 4s max lifetime
    expect(system.projectileCount).toBe(0)
  })

  // --- Removal callback ---

  it('should fire onProjectileRemoved when projectile expires', () => {
    const onRemove = vi.fn()
    system.onProjectileRemoved = onRemove
    system.spawn(0, 5, 0, 1, 0, 0, 30, 10)
    system.tick(5)
    expect(onRemove).toHaveBeenCalled()
  })

  // --- Clear ---

  it('should clear all projectiles on dispose', () => {
    system.spawn(0, 5, 0, 1, 0, 0, 30, 10)
    system.spawn(10, 5, 0, -1, 0, 0, 30, 10)
    system.dispose()
    expect(system.projectileCount).toBe(0)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test:unit src/lib/fps/__tests__/enemyProjectileSystem.spec.ts`
Expected: FAIL — `EnemyProjectileSystem` not found

- [ ] **Step 3: Commit failing tests**

```bash
git add src/lib/fps/__tests__/enemyProjectileSystem.spec.ts
git commit -m "test(enemy): add EnemyProjectileSystem tests (red)"
```

---

### Task 5: EnemyProjectileSystem — Implementation

**Files:**
- Create: `src/lib/fps/enemyProjectileSystem.ts`

- [ ] **Step 1: Implement EnemyProjectileSystem**

Create `src/lib/fps/enemyProjectileSystem.ts`:

```ts
/**
 * Enemy projectile system — manages enemy-fired projectiles and
 * checks collision against the player.
 *
 * Pure domain logic. No Three.js. The VC creates visual meshes
 * and syncs their positions via callbacks.
 *
 * @author guinetik
 * @date 2026-04-05
 * @spec docs/superpowers/specs/2026-04-05-spire-enemy-design.md
 */
import type { Tickable } from '@/lib/Tickable'

const MAX_LIFETIME = 4.0
const PLAYER_HIT_RADIUS = 1.5

interface EnemyProjectile {
  id: number
  x: number
  y: number
  z: number
  vx: number
  vy: number
  vz: number
  age: number
  damage: number
  sourceX: number
  sourceZ: number
}

/**
 * Manages enemy-fired projectiles with player collision detection.
 *
 * @author guinetik
 * @date 2026-04-05
 * @spec docs/superpowers/specs/2026-04-05-spire-enemy-design.md
 */
export class EnemyProjectileSystem implements Tickable {
  private readonly projectiles: EnemyProjectile[] = []
  private nextId = 1
  private playerX = 0
  private playerY = 0
  private playerZ = 0

  /** Fired when a projectile hits the player. Args: damage, sourceX, sourceZ. */
  onPlayerHit: ((damage: number, sourceX: number, sourceZ: number) => void) | null = null

  /** Fired each frame per projectile with updated position. Args: id, x, y, z. */
  onProjectileMove: ((id: number, x: number, y: number, z: number) => void) | null = null

  /** Fired when a projectile is removed (hit or expired). Args: id. */
  onProjectileRemoved: ((id: number) => void) | null = null

  /** Number of active projectiles. */
  get projectileCount(): number {
    return this.projectiles.length
  }

  /** Update the player position for collision checks. */
  setPlayerPosition(x: number, y: number, z: number): void {
    this.playerX = x
    this.playerY = y
    this.playerZ = z
  }

  /**
   * Spawn an enemy projectile.
   *
   * @param x - Spawn X position
   * @param y - Spawn Y position
   * @param z - Spawn Z position
   * @param dirX - Normalized direction X
   * @param dirY - Normalized direction Y
   * @param dirZ - Normalized direction Z
   * @param speed - Projectile speed (units/s)
   * @param damage - Damage on player hit
   * @returns Projectile ID for visual tracking
   */
  spawn(
    x: number, y: number, z: number,
    dirX: number, dirY: number, dirZ: number,
    speed: number, damage: number,
  ): number {
    const id = this.nextId++
    this.projectiles.push({
      id,
      x, y, z,
      vx: dirX * speed,
      vy: dirY * speed,
      vz: dirZ * speed,
      age: 0,
      damage,
      sourceX: x,
      sourceZ: z,
    })
    return id
  }

  /** @inheritdoc */
  tick(dt: number): void {
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i]!
      p.age += dt

      // Move
      p.x += p.vx * dt
      p.y += p.vy * dt
      p.z += p.vz * dt

      // Player collision — sphere check
      const dx = p.x - this.playerX
      const dy = p.y - this.playerY
      const dz = p.z - this.playerZ
      const distSq = dx * dx + dy * dy + dz * dz

      if (distSq <= PLAYER_HIT_RADIUS * PLAYER_HIT_RADIUS) {
        this.onPlayerHit?.(p.damage, p.sourceX, p.sourceZ)
        this.onProjectileRemoved?.(p.id)
        this.projectiles.splice(i, 1)
        continue
      }

      // Expire
      if (p.age >= MAX_LIFETIME) {
        this.onProjectileRemoved?.(p.id)
        this.projectiles.splice(i, 1)
        continue
      }

      // Report position
      this.onProjectileMove?.(p.id, p.x, p.y, p.z)
    }
  }

  /** Remove all projectiles. */
  dispose(): void {
    for (const p of this.projectiles) {
      this.onProjectileRemoved?.(p.id)
    }
    this.projectiles.length = 0
  }
}
```

- [ ] **Step 2: Run tests to verify they pass**

Run: `bun test:unit src/lib/fps/__tests__/enemyProjectileSystem.spec.ts`
Expected: All tests PASS

- [ ] **Step 3: Run all enemy tests**

Run: `bun test:unit src/lib/fps/__tests__/`
Expected: All tests PASS

- [ ] **Step 4: Commit**

```bash
git add src/lib/fps/enemyProjectileSystem.ts
git commit -m "feat(enemy): implement EnemyProjectileSystem — enemy projectile lifecycle + player hit"
```

---

### Task 6: EnemyDirector — Behavior Selection by Type

**Files:**
- Modify: `src/lib/fps/enemyDirector.ts`

- [ ] **Step 1: Add RangedBehavior import and selection logic**

In `src/lib/fps/enemyDirector.ts`, add the import after the existing `AggroBehavior` import:

```ts
import { RangedBehavior } from './rangedBehavior'
```

Replace the behavior creation in `spawn()` — change this:

```ts
    const behavior = new AggroBehavior({
      aggroRadius: config.aggroRadius,
      leashRadius: config.leashRadius,
      agitateRadius: config.agitateRadius,
      wanderRadius: config.wanderRadius,
      wanderSpeed: config.wanderSpeed,
      speed: config.speed,
    })
```

To this:

```ts
    const behavior = config.preferredRange > 0
      ? new RangedBehavior({
          aggroRadius: config.aggroRadius,
          leashRadius: config.leashRadius,
          agitateRadius: config.agitateRadius,
          wanderRadius: config.wanderRadius,
          wanderSpeed: config.wanderSpeed,
          speed: config.speed,
          preferredRange: config.preferredRange,
          minRange: config.minRange,
          fireRate: config.fireRate,
        })
      : new AggroBehavior({
          aggroRadius: config.aggroRadius,
          leashRadius: config.leashRadius,
          agitateRadius: config.agitateRadius,
          wanderRadius: config.wanderRadius,
          wanderSpeed: config.wanderSpeed,
          speed: config.speed,
        })
```

- [ ] **Step 2: Run all tests**

Run: `bun run type-check && bun test:unit`
Expected: All tests PASS

- [ ] **Step 3: Commit**

```bash
git add src/lib/fps/enemyDirector.ts
git commit -m "feat(enemy): director selects RangedBehavior for ranged enemy types"
```

---

### Task 7: EnemyProjectileMesh — Visual

**Files:**
- Create: `src/three/EnemyProjectileMesh.ts`

- [ ] **Step 1: Create EnemyProjectileMesh**

Create `src/three/EnemyProjectileMesh.ts`:

```ts
/**
 * Glowing sphere visual for enemy-fired projectiles.
 *
 * Simple additive-blended sphere with point light.
 * The VC creates one per spawned projectile and syncs position.
 *
 * @author guinetik
 * @date 2026-04-05
 * @spec docs/superpowers/specs/2026-04-05-spire-enemy-design.md
 */
import * as THREE from 'three'

const PROJECTILE_RADIUS = 0.3
const PROJECTILE_SEGMENTS = 6
const LIGHT_INTENSITY = 1.5
const LIGHT_DISTANCE = 8

const projectileGeo = new THREE.SphereGeometry(PROJECTILE_RADIUS, PROJECTILE_SEGMENTS, PROJECTILE_SEGMENTS)
const projectileMat = new THREE.MeshBasicMaterial({
  color: 0xff6600,
  transparent: true,
  opacity: 0.9,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
})

/**
 * Glowing enemy projectile mesh.
 *
 * @author guinetik
 * @date 2026-04-05
 * @spec docs/superpowers/specs/2026-04-05-spire-enemy-design.md
 */
export class EnemyProjectileMesh {
  readonly group = new THREE.Group()
  private readonly light: THREE.PointLight

  constructor() {
    const sphere = new THREE.Mesh(projectileGeo, projectileMat)
    this.group.add(sphere)

    this.light = new THREE.PointLight(0xff6600, LIGHT_INTENSITY, LIGHT_DISTANCE)
    this.group.add(this.light)
  }

  /** Update world position. */
  setPosition(x: number, y: number, z: number): void {
    this.group.position.set(x, y, z)
  }

  /** Clean up — only disposes instance-owned resources. */
  dispose(): void {
    this.group.removeFromParent()
    this.light.dispose()
  }
}
```

- [ ] **Step 2: Verify type-check**

Run: `bun run type-check`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/three/EnemyProjectileMesh.ts
git commit -m "feat(enemy): add EnemyProjectileMesh — glowing sphere visual for enemy projectiles"
```

---

### Task 8: SpireController — Procedural Mesh

**Files:**
- Create: `src/three/SpireController.ts`

This is the largest task — porting the coronavirus procedural mesh from the inspo demo. No tests (Three.js layer).

- [ ] **Step 1: Create SpireController**

Create `src/three/SpireController.ts`. This file is large — the full implementation follows the exact same controller pattern as `BacteriophageController.ts`:

Key structure:
- Shared materials: `membraneMat` (translucent red physical), `membraneCoreMat` (dark red emissive), `stalkMat` (golden), `bulbMat` (bright yellow emissive), `rnaMat` (red basic), `flashMat` (magenta basic)
- Shared geometries: stalk cylinder, bulb sphere, RNA torus knot
- `fibonacciSphere(count)` utility for spike distribution
- Class with: `group`, `enemy`, `bodyGroup`, `spikesGroup`, spike data array
- Build methods: `buildBody()` (membrane + core + RNA + light), `buildSpikes()` (42 fibonacci-distributed stalk+bulb pairs)
- `tick(dt)`: floating bob, membrane breathing, core pulse, RNA spin, spike sway/extend based on `isAgitated`, flash timer, death animation
- `flash()`: magenta flash on membrane + body recoil
- `fireFlash(playerX, playerZ)`: finds nearest spike to player direction and flashes its bulb white briefly
- Death animation: membrane shrinks, spikes detach with velocity + gravity, core flashes, ~1.2s animated
- `dispose()`: traverse and clean up

The file should follow the exact same patterns as `src/three/BacteriophageController.ts` — implements `Tickable`, owns `enemy: Enemy` reference, has `isMoving`/`isAgitated` public fields, `deathComplete` getter, and `SPIRE_HIT_CENTER_Y` export for hit detection offset.

Port the geometry, materials, and animation from `docs/inspo/coronavirus-spire-demo.html` lines 58-398, adapting:
- Replace scene-global references with `this.bodyGroup`/`this.spikesGroup`
- Use the controller's `elapsed + timeOffset` for animation time
- Scale by `SPIRE_SCALE = 2.0`
- Death animation pattern matching BacteriophageController (tickDeath with progress, deathComplete getter)

- [ ] **Step 2: Verify type-check**

Run: `bun run type-check`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/three/SpireController.ts
git commit -m "feat(enemy): add SpireController — procedural coronavirus mesh with spikes and floating bob"
```

---

### Task 9: Wire into FpsViewController

**Files:**
- Modify: `src/views/FpsViewController.ts`

- [ ] **Step 1: Add imports**

Add after existing enemy imports:

```ts
import { EnemyProjectileSystem } from '@/lib/fps/enemyProjectileSystem'
import { SpireController, SPIRE_HIT_CENTER_Y } from '@/three/SpireController'
import { EnemyProjectileMesh } from '@/three/EnemyProjectileMesh'
```

Add constants after existing enemy constants:

```ts
const SPIRE_SPAWN_COUNT = 4
const SPIRE_SPAWN_RADIUS = 100
const SPIRE_MIN_SPAWN_DISTANCE = 40
```

- [ ] **Step 2: Add fields**

Add after `enemyControllers` map:

```ts
private enemyProjectileSystem: EnemyProjectileSystem | null = null
private readonly spireControllers = new Map<number, SpireController>()
private readonly enemyProjectileMeshes = new Map<number, EnemyProjectileMesh>()
```

- [ ] **Step 3: Wire enemy projectile system in init()**

Inside the `if (params.has('enemies'))` block, after creating the `EnemyDirector` and its `onContactDamage`, add:

```ts
      // Enemy projectile system
      this.enemyProjectileSystem = new EnemyProjectileSystem()
      this.tickHandler.register(this.enemyProjectileSystem, TICK_PRIORITY_PHYSICS + 5)

      this.enemyProjectileSystem.onPlayerHit = (damage, sourceX, sourceZ) => {
        this.playerController?.takeDamage(damage)
        this.damageFlashTimer = DAMAGE_FLASH_DURATION
        const pp = this.playerController!.group.position
        // Knockback away from projectile source
        const dx = pp.x - sourceX
        const dz = pp.z - sourceZ
        const dist = Math.sqrt(dx * dx + dz * dz)
        if (dist > 0.01) {
          this.playerController!.applyLateralImpulse(
            (dx / dist) * CONTACT_KNOCKBACK,
            (dz / dist) * CONTACT_KNOCKBACK,
          )
        }
        // Directional indicator
        if (this.fpsCamera) {
          this.fpsCamera.applyMouseDelta(
            (Math.random() - 0.5) * DAMAGE_FLINCH_STRENGTH,
            -Math.random() * DAMAGE_FLINCH_STRENGTH,
          )
          const worldAngle = Math.atan2(sourceX - pp.x, sourceZ - pp.z)
          const relAngle = worldAngle - this.fpsCamera.yaw
          this.onDamageDirection?.(relAngle)
        }
      }

      // Visual mesh lifecycle for enemy projectiles
      this.enemyProjectileSystem.onProjectileMove = (id, x, y, z) => {
        let mesh = this.enemyProjectileMeshes.get(id)
        if (!mesh) {
          mesh = new EnemyProjectileMesh()
          this.sceneManager!.addToScene(mesh.group)
          this.enemyProjectileMeshes.set(id, mesh)
        }
        mesh.setPosition(x, y, z)
      }

      this.enemyProjectileSystem.onProjectileRemoved = (id) => {
        const mesh = this.enemyProjectileMeshes.get(id)
        if (mesh) {
          mesh.dispose()
          this.enemyProjectileMeshes.delete(id)
        }
      }
```

- [ ] **Step 4: Spawn spires in init()**

After the bacteriophage spawn loop, add:

```ts
      // Spawn spires
      for (let i = 0; i < SPIRE_SPAWN_COUNT; i++) {
        const angle = (i / SPIRE_SPAWN_COUNT) * Math.PI * 2 + Math.PI / 4
        const radius = SPIRE_MIN_SPAWN_DISTANCE + Math.random() * (SPIRE_SPAWN_RADIUS - SPIRE_MIN_SPAWN_DISTANCE)
        const x = Math.cos(angle) * radius
        const z = Math.sin(angle) * radius
        const y = heightmap.heightAt(x, z)

        const handle = this.enemyDirector.spawn('spire', x, groundY, z)
        const controller = new SpireController(handle.enemy)
        controller.group.position.set(x, groundY + handle.config.floatHeight, z)
        this.sceneManager.addToScene(controller.group)
        this.projectileSystem!.addEnemy(handle.enemy)
        this.tickHandler.register(controller, TICK_PRIORITY_ANIMATION)
        this.spireControllers.set(handle.id, controller)
        this.enemyControllers.set(handle.id, controller as any)
      }
```

Spire controllers go in their own `spireControllers` map (separate from `enemyControllers`) because they have the `fireFlash()` method that bacteriophages don't. Both maps are checked in `onEnemyHit` for flash/death.

- [ ] **Step 5: Extend onEnemyHit to handle spires**

In the existing `onEnemyHit` wrapper, add spire lookup after the bacteriophage lookup:

```ts
        // Check spire controllers
        for (const [id, ctrl] of this.spireControllers) {
          if (ctrl.enemy === enemy) {
            ctrl.flash()
            if (!enemy.alive) {
              this.projectileSystem!.removeEnemy(enemy)
            }
            break
          }
        }
```

- [ ] **Step 6: Add spire sync + fire logic in tick()**

In the enemy sync section of `tick()`, after the existing bacteriophage sync loop, add:

```ts
      // Spire sync
      for (const handle of this.enemyDirector.enemies) {
        const ctrl = this.spireControllers.get(handle.id)
        if (!ctrl) continue

        // Clean up dead spires
        if (ctrl.deathComplete) {
          this.tickHandler!.unregister(ctrl)
          this.spireControllers.delete(handle.id)
          this.enemyDirector!.despawn(handle)
          continue
        }

        if (!handle.enemy.alive) continue

        ctrl.isMoving = handle.lastOutput.isMoving
        ctrl.isAgitated = handle.lastOutput.isAgitated

        // Sync position — floats above terrain
        ctrl.group.position.x = handle.enemy.position.x
        ctrl.group.position.z = handle.enemy.position.z
        const groundY = this.heightmap?.heightAt(
          handle.enemy.position.x,
          handle.enemy.position.z,
        ) ?? 0
        ctrl.group.position.y = groundY + handle.config.floatHeight
        handle.enemy.position.y = groundY + handle.config.floatHeight + SPIRE_HIT_CENTER_Y

        // Face player
        if (handle.lastOutput.isChasing) {
          const dx = pp.x - handle.enemy.position.x
          const dz = pp.z - handle.enemy.position.z
          ctrl.group.rotation.y = Math.atan2(dx, dz)
        }

        // Fire projectile
        if (handle.lastOutput.wantsToFire && this.enemyProjectileSystem) {
          const ep = handle.enemy.position
          const dx = pp.x - ep.x
          const dy = pp.y - ep.y
          const dz = pp.z - ep.z
          const dist = Math.sqrt(dx * dx + dy * dy + dz * dz)
          if (dist > 0.01) {
            this.enemyProjectileSystem.spawn(
              ep.x, ep.y, ep.z,
              dx / dist, dy / dist, dz / dist,
              handle.config.projectileSpeed,
              handle.config.projectileDamage,
            )
            ctrl.fireFlash(pp.x, pp.z)
          }
        }
      }

      // Feed player position to enemy projectile system
      this.enemyProjectileSystem?.setPlayerPosition(pp.x, pp.y, pp.z)
```

- [ ] **Step 7: Add cleanup in dispose()**

Before the existing enemy cleanup, add:

```ts
    for (const ctrl of this.spireControllers.values()) ctrl.dispose()
    this.spireControllers.clear()
    for (const mesh of this.enemyProjectileMeshes.values()) mesh.dispose()
    this.enemyProjectileMeshes.clear()
    this.enemyProjectileSystem?.dispose()
```

- [ ] **Step 8: Verify type-check and tests**

Run: `bun run type-check && bun test:unit`
Expected: All PASS

- [ ] **Step 9: Commit**

```bash
git add src/views/FpsViewController.ts
git commit -m "feat(enemy): wire SpireController + EnemyProjectileSystem into FPS view

Spawn 4 spires with ?enemies=true alongside bacteriophages. Spires
float above terrain, fire slow projectiles, trigger same damage
feedback (vignette, flinch, knockback) on player hit."
```

---

### Task 10: Manual Smoke Test

- [ ] **Step 1: Start dev server**

Run: `bun dev`

- [ ] **Step 2: Test at `/fps?enemies=true&flat=true`**

Verify:
- Bacteriophages still work as before
- 4 coronavirus spires float above the terrain
- Spires have translucent membrane, visible spikes, glowing RNA core
- Spires idle-wobble when player is far away
- Spires engage and approach when player enters ~50 unit range
- Spires stop at ~25 units and hold position
- Spires fire orange projectiles toward player every ~2s
- Projectiles are visible glowing spheres that fly toward you
- Getting hit by a projectile triggers damage vignette, flinch, knockback
- Shooting a spire causes magenta flash + recoil
- Killing a spire plays death animation (shrink, spikes fall off)
- Spires back away if you rush inside ~12 units

- [ ] **Step 3: Commit any fixes**
