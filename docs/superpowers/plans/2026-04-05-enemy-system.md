# Enemy System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a domain-level enemy spawning system with a procedural Bacteriophage enemy that wanders, aggros the player, deals contact damage, and can be killed.

**Architecture:** Domain logic (behavior AI, director service, enemy configs) lives in `src/lib/fps/`. Procedural 3D mesh lives in `src/three/BacteriophageController.ts`. The FpsViewController bridges them, spawning enemies with `?enemies=true`. All behavior is data-driven from `src/data/fps/enemy-types.json`.

**Tech Stack:** TypeScript, Three.js, Vitest, Vite JSON imports

**Spec:** `docs/superpowers/specs/2026-04-05-enemy-system-design.md`

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `src/lib/fps/enemy.ts` | Extend | Add `EnemyBehavior` interface + `EnemyBehaviorOutput` type |
| `src/lib/fps/aggroBehavior.ts` | Create | Idle wander + chase AI behavior |
| `src/lib/fps/enemyTypes.ts` | Create | Typed config loader for enemy type data |
| `src/lib/fps/enemyDirector.ts` | Create | Spawn/despawn/tick service, contact damage |
| `src/data/fps/enemy-types.json` | Create | Bacteriophage stats |
| `src/three/BacteriophageController.ts` | Create | Procedural mesh + animation |
| `src/views/FpsViewController.ts` | Modify | Wire director + controllers on `?enemies=true` |
| `src/lib/fps/__tests__/aggroBehavior.spec.ts` | Create | Behavior AI tests |
| `src/lib/fps/__tests__/enemyDirector.spec.ts` | Create | Director service tests |

---

### Task 1: Enemy Behavior Interface + Types

**Files:**
- Modify: `src/lib/fps/enemy.ts`
- Create: `src/lib/fps/enemyTypes.ts`
- Create: `src/data/fps/enemy-types.json`

- [ ] **Step 1: Add EnemyBehavior interface to enemy.ts**

Add the following types after the existing `Enemy` class in `src/lib/fps/enemy.ts`:

```ts
/** Output from an enemy behavior tick — drives movement and visual state. */
export interface EnemyBehaviorOutput {
  /** Normalized movement direction on the XZ plane (zero = idle). */
  moveDir: { x: number; z: number }
  /** Whether the enemy is actively moving. */
  isMoving: boolean
  /** Whether the enemy is chasing the player (vs idle wander). */
  isChasing: boolean
  /** Whether the enemy is agitated (close to player). */
  isAgitated: boolean
}

/**
 * Behavior interface — pluggable AI for enemies.
 * The director calls tick() each frame and applies the output.
 */
export interface EnemyBehavior {
  /** Compute movement intent for this frame. */
  tick(dt: number, enemyX: number, enemyZ: number, playerX: number, playerZ: number): EnemyBehaviorOutput
}
```

Uses flat `x/z` numbers instead of Vector2 to keep `src/lib/` free of Three.js imports. The `moveDir` uses a plain `{ x, z }` object for the same reason.

- [ ] **Step 2: Create enemy-types.json**

Create `src/data/fps/enemy-types.json`:

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

- [ ] **Step 3: Create enemyTypes.ts**

Create `src/lib/fps/enemyTypes.ts`:

```ts
/**
 * Typed enemy-type configuration loader.
 *
 * Imports enemy stats from JSON data and exposes typed configs.
 *
 * @author guinetik
 * @date 2026-04-05
 * @spec docs/superpowers/specs/2026-04-05-enemy-system-design.md
 */
import enemyTypesJson from '@/data/fps/enemy-types.json'

/** Configuration for a single enemy type — loaded from enemy-types.json. */
export interface EnemyTypeConfig {
  /** Maximum health points. */
  maxHp: number
  /** Collision radius for projectile hit detection. */
  hitRadius: number
  /** Chase movement speed (units/s). */
  speed: number
  /** Distance at which the enemy starts chasing the player. */
  aggroRadius: number
  /** Distance at which the enemy gives up chasing and returns to idle. */
  leashRadius: number
  /** Distance at which the enemy becomes visually agitated. */
  agitateRadius: number
  /** Maximum wander distance from spawn point when idle. */
  wanderRadius: number
  /** Movement speed while wandering (units/s). */
  wanderSpeed: number
  /** Damage dealt on player contact. */
  contactDamage: number
  /** Distance threshold for contact damage. */
  contactRadius: number
  /** Cooldown between contact damage ticks (seconds). */
  contactCooldown: number
}

/** All enemy type configs keyed by type name. */
const ENEMY_TYPES = enemyTypesJson as Record<string, EnemyTypeConfig>

/**
 * Get the config for an enemy type.
 *
 * @param type - Enemy type key (e.g. 'bacteriophage')
 * @returns The typed config
 * @throws If the type is not found
 */
export function getEnemyTypeConfig(type: string): EnemyTypeConfig {
  const config = ENEMY_TYPES[type]
  if (!config) throw new Error(`Unknown enemy type: ${type}`)
  return config
}
```

- [ ] **Step 4: Verify type-check passes**

Run: `bun run type-check`
Expected: PASS — no type errors

- [ ] **Step 5: Commit**

```bash
git add src/lib/fps/enemy.ts src/lib/fps/enemyTypes.ts src/data/fps/enemy-types.json
git commit -m "feat(enemy): add EnemyBehavior interface, type configs, and bacteriophage data"
```

---

### Task 2: AggroBehavior — Tests

**Files:**
- Create: `src/lib/fps/__tests__/aggroBehavior.spec.ts`

- [ ] **Step 1: Write AggroBehavior tests**

Create `src/lib/fps/__tests__/aggroBehavior.spec.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { AggroBehavior } from '../aggroBehavior'

const TEST_CONFIG = {
  aggroRadius: 40,
  leashRadius: 60,
  agitateRadius: 10,
  wanderRadius: 15,
  wanderSpeed: 2,
  speed: 8,
}

describe('AggroBehavior', () => {
  let behavior: AggroBehavior

  beforeEach(() => {
    behavior = new AggroBehavior(TEST_CONFIG)
  })

  // --- Idle state ---

  it('should start in idle state', () => {
    const out = behavior.tick(0.016, 0, 0, 999, 999)
    expect(out.isAgitated).toBe(false)
  })

  it('should wander within wanderRadius of spawn', () => {
    // Tick many frames — enemy should never drift beyond wanderRadius
    let ex = 0
    let ez = 0
    for (let i = 0; i < 600; i++) {
      const out = behavior.tick(0.016, ex, ez, 999, 999)
      ex += out.moveDir.x * TEST_CONFIG.wanderSpeed * 0.016
      ez += out.moveDir.z * TEST_CONFIG.wanderSpeed * 0.016
    }
    const dist = Math.sqrt(ex * ex + ez * ez)
    expect(dist).toBeLessThanOrEqual(TEST_CONFIG.wanderRadius + 1)
  })

  // --- Aggro transition ---

  it('should chase when player enters aggro radius', () => {
    // Player at distance 30, within aggroRadius of 40
    const out = behavior.tick(0.016, 0, 0, 30, 0)
    expect(out.isMoving).toBe(true)
    expect(out.isChasing).toBe(true)
    // moveDir should point toward player (+x)
    expect(out.moveDir.x).toBeGreaterThan(0)
  })

  it('should NOT chase when player is outside aggro radius', () => {
    const out = behavior.tick(0.016, 0, 0, 50, 0)
    // Should be idle — not chasing
    expect(out.isAgitated).toBe(false)
  })

  it('should become agitated when player is within agitate radius', () => {
    const out = behavior.tick(0.016, 0, 0, 5, 0)
    expect(out.isAgitated).toBe(true)
  })

  it('should NOT be agitated when chasing but outside agitate radius', () => {
    const out = behavior.tick(0.016, 0, 0, 30, 0)
    expect(out.isMoving).toBe(true)
    expect(out.isAgitated).toBe(false)
  })

  // --- Leash ---

  it('should keep chasing within leash radius', () => {
    // Enter aggro
    behavior.tick(0.016, 0, 0, 30, 0)
    // Player moves to 55 — beyond aggro but within leash
    const out = behavior.tick(0.016, 0, 0, 55, 0)
    expect(out.isMoving).toBe(true)
    expect(out.moveDir.x).toBeGreaterThan(0)
  })

  it('should return to idle when player exceeds leash radius', () => {
    // Enter aggro
    behavior.tick(0.016, 0, 0, 30, 0)
    // Player moves beyond leash
    const out = behavior.tick(0.016, 0, 0, 70, 0)
    expect(out.isAgitated).toBe(false)
  })

  // --- Chase direction ---

  it('should chase toward player in correct direction', () => {
    // Player is at negative X
    const out = behavior.tick(0.016, 0, 0, -20, 0)
    expect(out.moveDir.x).toBeLessThan(0)
  })

  it('should chase toward player on Z axis', () => {
    const out = behavior.tick(0.016, 0, 0, 0, -25)
    expect(out.moveDir.z).toBeLessThan(0)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test:unit src/lib/fps/__tests__/aggroBehavior.spec.ts`
Expected: FAIL — `AggroBehavior` not found

- [ ] **Step 3: Commit failing tests**

```bash
git add src/lib/fps/__tests__/aggroBehavior.spec.ts
git commit -m "test(enemy): add AggroBehavior tests (red)"
```

---

### Task 3: AggroBehavior — Implementation

**Files:**
- Create: `src/lib/fps/aggroBehavior.ts`

- [ ] **Step 1: Implement AggroBehavior**

Create `src/lib/fps/aggroBehavior.ts`:

```ts
/**
 * Aggro-based enemy behavior — idle wander near spawn, chase on aggro.
 *
 * Two states:
 * - **Idle:** Wander randomly within {@link AggroBehaviorConfig.wanderRadius}
 *   of the spawn point. Picks a random target, walks to it, pauses, repeats.
 * - **Chase:** When the player enters {@link AggroBehaviorConfig.aggroRadius},
 *   move toward the player at full speed. Returns to idle when the player
 *   exceeds {@link AggroBehaviorConfig.leashRadius}.
 *
 * @author guinetik
 * @date 2026-04-05
 * @spec docs/superpowers/specs/2026-04-05-enemy-system-design.md
 */
import type { EnemyBehavior, EnemyBehaviorOutput } from './enemy'

/** Configuration for aggro behavior — sourced from EnemyTypeConfig. */
export interface AggroBehaviorConfig {
  /** Distance at which the enemy starts chasing the player. */
  aggroRadius: number
  /** Distance at which the enemy gives up and returns to idle. */
  leashRadius: number
  /** Distance at which the enemy becomes visually agitated. */
  agitateRadius: number
  /** Maximum wander distance from spawn point. */
  wanderRadius: number
  /** Movement speed while wandering (units/s). */
  wanderSpeed: number
  /** Chase movement speed (units/s). */
  speed: number
}

/** Minimum distance to wander target before picking a new one. */
const WANDER_ARRIVE_THRESHOLD = 2.0

/** Pause duration (seconds) between wander targets. */
const WANDER_PAUSE_MIN = 1.0
const WANDER_PAUSE_MAX = 3.0

/** Weave amplitude for organic-looking movement. */
const WEAVE_AMPLITUDE = 0.25
const WEAVE_FREQUENCY = 1.5

type AggroState = 'idle' | 'chase'

/**
 * Aggro behavior — wander when idle, chase when player is near.
 *
 * @author guinetik
 * @date 2026-04-05
 * @spec docs/superpowers/specs/2026-04-05-enemy-system-design.md
 */
export class AggroBehavior implements EnemyBehavior {
  private readonly config: AggroBehaviorConfig
  private state: AggroState = 'idle'
  private elapsed = 0

  // Wander state
  private wanderTargetX = 0
  private wanderTargetZ = 0
  private wanderPause = 0
  private spawnX = 0
  private spawnZ = 0
  private spawnSet = false

  constructor(config: AggroBehaviorConfig) {
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

    // Record spawn position on first tick
    if (!this.spawnSet) {
      this.spawnX = enemyX
      this.spawnZ = enemyZ
      this.spawnSet = true
      this.pickWanderTarget()
    }

    const dx = playerX - enemyX
    const dz = playerZ - enemyZ
    const distToPlayer = Math.sqrt(dx * dx + dz * dz)

    // --- State transitions ---
    if (this.state === 'idle' && distToPlayer < this.config.aggroRadius) {
      this.state = 'chase'
    } else if (this.state === 'chase' && distToPlayer > this.config.leashRadius) {
      this.state = 'idle'
      this.pickWanderTarget()
    }

    // --- Behavior ---
    if (this.state === 'chase') {
      return this.tickChase(dx, dz, distToPlayer)
    }
    return this.tickIdle(dt, enemyX, enemyZ)
  }

  private tickChase(
    dx: number,
    dz: number,
    distToPlayer: number,
  ): EnemyBehaviorOutput {
    if (distToPlayer < 0.01) {
      return { moveDir: { x: 0, z: 0 }, isMoving: false, isChasing: true, isAgitated: true }
    }

    const invDist = 1 / distToPlayer
    let dirX = dx * invDist
    let dirZ = dz * invDist

    // Weave for organic movement
    const sideX = -dirZ
    const sideZ = dirX
    const weave = Math.sin(this.elapsed * WEAVE_FREQUENCY) * WEAVE_AMPLITUDE
    dirX += sideX * weave
    dirZ += sideZ * weave

    // Re-normalize
    const len = Math.sqrt(dirX * dirX + dirZ * dirZ)
    if (len > 0) {
      dirX /= len
      dirZ /= len
    }

    const isAgitated = distToPlayer < this.config.agitateRadius

    return { moveDir: { x: dirX, z: dirZ }, isMoving: true, isChasing: true, isAgitated }
  }

  private tickIdle(
    dt: number,
    enemyX: number,
    enemyZ: number,
  ): EnemyBehaviorOutput {
    // Pause between wander targets
    if (this.wanderPause > 0) {
      this.wanderPause -= dt
      return { moveDir: { x: 0, z: 0 }, isMoving: false, isChasing: false, isAgitated: false }
    }

    const wx = this.wanderTargetX - enemyX
    const wz = this.wanderTargetZ - enemyZ
    const wanderDist = Math.sqrt(wx * wx + wz * wz)

    // Arrived at wander target — pick a new one after a pause
    if (wanderDist < WANDER_ARRIVE_THRESHOLD) {
      this.wanderPause = WANDER_PAUSE_MIN + Math.random() * (WANDER_PAUSE_MAX - WANDER_PAUSE_MIN)
      this.pickWanderTarget()
      return { moveDir: { x: 0, z: 0 }, isMoving: false, isChasing: false, isAgitated: false }
    }

    // Move toward wander target
    const invDist = 1 / wanderDist
    return {
      moveDir: { x: wx * invDist, z: wz * invDist },
      isMoving: true,
      isChasing: false,
      isAgitated: false,
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

Run: `bun test:unit src/lib/fps/__tests__/aggroBehavior.spec.ts`
Expected: All tests PASS

- [ ] **Step 3: Commit**

```bash
git add src/lib/fps/aggroBehavior.ts
git commit -m "feat(enemy): implement AggroBehavior — idle wander + chase AI"
```

---

### Task 4: EnemyDirector — Tests

**Files:**
- Create: `src/lib/fps/__tests__/enemyDirector.spec.ts`

- [ ] **Step 1: Write EnemyDirector tests**

Create `src/lib/fps/__tests__/enemyDirector.spec.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { EnemyDirector } from '../enemyDirector'

// Mock the enemy-types.json import
vi.mock('@/data/fps/enemy-types.json', () => ({
  default: {
    bacteriophage: {
      maxHp: 75,
      hitRadius: 1.5,
      speed: 8,
      aggroRadius: 40,
      leashRadius: 60,
      agitateRadius: 10,
      wanderRadius: 15,
      wanderSpeed: 2,
      contactDamage: 15,
      contactRadius: 2.0,
      contactCooldown: 1.0,
    },
  },
}))

describe('EnemyDirector', () => {
  let director: EnemyDirector

  beforeEach(() => {
    director = new EnemyDirector()
  })

  // --- Spawning ---

  it('should spawn an enemy and return a handle', () => {
    const handle = director.spawn('bacteriophage', 10, 0, 10)
    expect(handle).toBeDefined()
    expect(handle.enemy.alive).toBe(true)
    expect(handle.enemy.maxHp).toBe(75)
    expect(handle.type).toBe('bacteriophage')
  })

  it('should assign unique IDs to spawned enemies', () => {
    const h1 = director.spawn('bacteriophage', 0, 0, 0)
    const h2 = director.spawn('bacteriophage', 10, 0, 10)
    expect(h1.id).not.toBe(h2.id)
  })

  it('should track all alive enemies', () => {
    director.spawn('bacteriophage', 0, 0, 0)
    director.spawn('bacteriophage', 10, 0, 10)
    expect(director.enemies.length).toBe(2)
  })

  it('should throw on unknown enemy type', () => {
    expect(() => director.spawn('unknown', 0, 0, 0)).toThrow('Unknown enemy type')
  })

  // --- Despawning ---

  it('should despawn an enemy by handle', () => {
    const handle = director.spawn('bacteriophage', 0, 0, 0)
    director.despawn(handle)
    expect(director.enemies.length).toBe(0)
  })

  it('should despawn all enemies', () => {
    director.spawn('bacteriophage', 0, 0, 0)
    director.spawn('bacteriophage', 10, 0, 10)
    director.despawnAll()
    expect(director.enemies.length).toBe(0)
  })

  // --- Tick + movement ---

  it('should move enemies toward player when in aggro range', () => {
    const handle = director.spawn('bacteriophage', 0, 0, 0)
    director.setPlayerPosition(20, 0, 0)
    director.tick(0.016)
    // Enemy should have moved toward player (+x)
    expect(handle.enemy.position.x).toBeGreaterThan(0)
  })

  it('should NOT move enemies toward player when out of range', () => {
    const handle = director.spawn('bacteriophage', 0, 0, 0)
    director.setPlayerPosition(999, 0, 999)
    const startX = handle.enemy.position.x
    director.tick(0.016)
    // Enemy should have barely moved (idle wander, not chase)
    const moved = Math.abs(handle.enemy.position.x - startX)
    expect(moved).toBeLessThan(1)
  })

  // --- Contact damage ---

  it('should fire contact damage when player touches enemy', () => {
    const onContact = vi.fn()
    director.onContactDamage = onContact
    const handle = director.spawn('bacteriophage', 0, 0, 0)
    // Player standing right on top of enemy
    director.setPlayerPosition(0, 0, 0)
    director.tick(0.016)
    expect(onContact).toHaveBeenCalledWith(handle, 15)
  })

  it('should NOT fire contact damage when player is far away', () => {
    const onContact = vi.fn()
    director.onContactDamage = onContact
    director.spawn('bacteriophage', 0, 0, 0)
    director.setPlayerPosition(100, 0, 100)
    director.tick(0.016)
    expect(onContact).not.toHaveBeenCalled()
  })

  it('should respect contact cooldown', () => {
    const onContact = vi.fn()
    director.onContactDamage = onContact
    director.spawn('bacteriophage', 0, 0, 0)
    director.setPlayerPosition(0, 0, 0)
    director.tick(0.016) // First hit
    director.tick(0.016) // Should be on cooldown
    expect(onContact).toHaveBeenCalledTimes(1)
  })

  it('should fire contact damage again after cooldown expires', () => {
    const onContact = vi.fn()
    director.onContactDamage = onContact
    director.spawn('bacteriophage', 0, 0, 0)
    director.setPlayerPosition(0, 0, 0)
    director.tick(0.016) // First hit
    director.tick(1.1) // Exceed 1.0s cooldown
    expect(onContact).toHaveBeenCalledTimes(2)
  })

  // --- Dead enemies ---

  it('should skip dead enemies during tick', () => {
    const handle = director.spawn('bacteriophage', 0, 0, 0)
    handle.enemy.takeDamage(999) // Kill it
    director.setPlayerPosition(0, 0, 0)
    const onContact = vi.fn()
    director.onContactDamage = onContact
    director.tick(0.016)
    expect(onContact).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test:unit src/lib/fps/__tests__/enemyDirector.spec.ts`
Expected: FAIL — `EnemyDirector` not found

- [ ] **Step 3: Commit failing tests**

```bash
git add src/lib/fps/__tests__/enemyDirector.spec.ts
git commit -m "test(enemy): add EnemyDirector tests (red)"
```

---

### Task 5: EnemyDirector — Implementation

**Files:**
- Create: `src/lib/fps/enemyDirector.ts`

- [ ] **Step 1: Implement EnemyDirector**

Create `src/lib/fps/enemyDirector.ts`:

```ts
/**
 * Enemy director — domain service that spawns, ticks, and manages enemies.
 *
 * Pure game logic. No Three.js dependencies. The ViewController reads
 * enemy positions each frame and syncs visual controllers.
 *
 * @author guinetik
 * @date 2026-04-05
 * @spec docs/superpowers/specs/2026-04-05-enemy-system-design.md
 */
import type { Tickable } from '@/lib/Tickable'
import type { EnemyBehavior, EnemyBehaviorOutput } from './enemy'
import { Enemy } from './enemy'
import { AggroBehavior } from './aggroBehavior'
import { getEnemyTypeConfig } from './enemyTypes'
import type { EnemyTypeConfig } from './enemyTypes'

/** Handle returned by spawn — used by the VC to bridge domain ↔ visuals. */
export interface EnemyHandle {
  /** Unique ID for this enemy instance. */
  readonly id: number
  /** Domain enemy entity (HP, position, hitRadius). */
  readonly enemy: Enemy
  /** AI behavior driving movement. */
  readonly behavior: EnemyBehavior
  /** Enemy type key (e.g. 'bacteriophage'). */
  readonly type: string
  /** Type config for reading speeds, radii, etc. */
  readonly config: EnemyTypeConfig
  /** Latest behavior output — read by VC each frame for visual sync. */
  lastOutput: EnemyBehaviorOutput
  /** Contact damage cooldown timer (seconds remaining). */
  contactCooldown: number
}

/**
 * Enemy director — manages spawning, AI ticking, and contact damage.
 *
 * @author guinetik
 * @date 2026-04-05
 * @spec docs/superpowers/specs/2026-04-05-enemy-system-design.md
 */
export class EnemyDirector implements Tickable {
  private readonly handles: EnemyHandle[] = []
  private nextId = 1
  private playerX = 0
  private playerY = 0
  private playerZ = 0

  /** Fired when an enemy touches the player. */
  onContactDamage: ((handle: EnemyHandle, damage: number) => void) | null = null

  /** All currently tracked enemy handles (alive and dead). */
  get enemies(): readonly EnemyHandle[] {
    return this.handles
  }

  /** Update the player position reference for aggro and contact checks. */
  setPlayerPosition(x: number, y: number, z: number): void {
    this.playerX = x
    this.playerY = y
    this.playerZ = z
  }

  /**
   * Spawn an enemy at the given world position.
   *
   * @param type - Enemy type key from enemy-types.json
   * @param x - World X position
   * @param y - World Y position
   * @param z - World Z position
   * @returns Handle for the spawned enemy
   */
  spawn(type: string, x: number, y: number, z: number): EnemyHandle {
    const config = getEnemyTypeConfig(type)

    const enemy = new Enemy({ maxHp: config.maxHp, hitRadius: config.hitRadius })
    enemy.position.set(x, y, z)

    const behavior = new AggroBehavior({
      aggroRadius: config.aggroRadius,
      leashRadius: config.leashRadius,
      agitateRadius: config.agitateRadius,
      wanderRadius: config.wanderRadius,
      wanderSpeed: config.wanderSpeed,
      speed: config.speed,
    })

    const handle: EnemyHandle = {
      id: this.nextId++,
      enemy,
      behavior,
      type,
      config,
      lastOutput: { moveDir: { x: 0, z: 0 }, isMoving: false, isChasing: false, isAgitated: false },
      contactCooldown: 0,
    }

    this.handles.push(handle)
    return handle
  }

  /** Remove an enemy from the director. */
  despawn(handle: EnemyHandle): void {
    const idx = this.handles.indexOf(handle)
    if (idx >= 0) this.handles.splice(idx, 1)
  }

  /** Remove all enemies. */
  despawnAll(): void {
    this.handles.length = 0
  }

  /** @inheritdoc */
  tick(dt: number): void {
    for (const handle of this.handles) {
      if (!handle.enemy.alive) continue

      // Tick behavior
      const output = handle.behavior.tick(
        dt,
        handle.enemy.position.x,
        handle.enemy.position.z,
        this.playerX,
        this.playerZ,
      )
      handle.lastOutput = output

      // Apply movement — chase uses full speed, idle wander uses wanderSpeed
      const speed = output.isMoving
        ? (output.isChasing ? handle.config.speed : handle.config.wanderSpeed)
        : 0

      if (output.isMoving && speed > 0) {
        handle.enemy.position.x += output.moveDir.x * speed * dt
        handle.enemy.position.z += output.moveDir.z * speed * dt
      }

      // Contact damage
      handle.contactCooldown = Math.max(0, handle.contactCooldown - dt)
      if (handle.contactCooldown <= 0) {
        const cx = handle.enemy.position.x - this.playerX
        const cz = handle.enemy.position.z - this.playerZ
        const contactDist = Math.sqrt(cx * cx + cz * cz)
        if (contactDist <= handle.config.contactRadius) {
          this.onContactDamage?.(handle, handle.config.contactDamage)
          handle.contactCooldown = handle.config.contactCooldown
        }
      }
    }
  }
}
```

- [ ] **Step 2: Run tests to verify they pass**

Run: `bun test:unit src/lib/fps/__tests__/enemyDirector.spec.ts`
Expected: All tests PASS

- [ ] **Step 3: Run all enemy tests together**

Run: `bun test:unit src/lib/fps/__tests__/aggroBehavior.spec.ts src/lib/fps/__tests__/enemyDirector.spec.ts`
Expected: All tests PASS

- [ ] **Step 4: Commit**

```bash
git add src/lib/fps/enemyDirector.ts
git commit -m "feat(enemy): implement EnemyDirector — spawn, tick, contact damage"
```

---

### Task 6: BacteriophageController — Procedural Mesh

**Files:**
- Create: `src/three/BacteriophageController.ts`

This is a large file — it ports the procedural geometry and animation from `docs/inspo/bacteriophage-demo.html` into our controller pattern. No tests (Three.js layer per project convention).

- [ ] **Step 1: Create BacteriophageController**

Create `src/three/BacteriophageController.ts`:

```ts
/**
 * Procedural bacteriophage enemy — 8-legged spider walker.
 *
 * Builds geometry procedurally (no GLTF). Animates legs with
 * alternating tetrapod gait when moving, subtle twitch when idle.
 * Ported from docs/inspo/bacteriophage-demo.html.
 *
 * @author guinetik
 * @date 2026-04-05
 * @spec docs/superpowers/specs/2026-04-05-enemy-system-design.md
 */
import * as THREE from 'three'
import type { Tickable } from '@/lib/Tickable'
import type { Enemy } from '@/lib/fps/enemy'

// ── Visual constants ────────────────────────────────────────────
const PHAGE_SCALE = 2.0
const LEG_COUNT = 8
const LEG_TUBE_RADIUS = 0.025
const LEG_SEGMENTS = 12

const HIT_FLASH_DURATION = 0.08
const DEATH_DELAY_MS = 300

// ── Shared materials (reused across all phage instances) ────────
const darkMetal = new THREE.MeshStandardMaterial({
  color: 0x1a1a1a,
  metalness: 0.8,
  roughness: 0.3,
})

const neckMat = new THREE.MeshStandardMaterial({
  color: 0x1a1a1a,
  emissive: 0x0a2a2a,
  emissiveIntensity: 0.3,
})

const headMat = new THREE.MeshPhysicalMaterial({
  color: 0xffffff,
  transparent: true,
  opacity: 0.3,
  roughness: 0.1,
  metalness: 0.2,
})

const flashMat = new THREE.MeshBasicMaterial({ color: 0xffffff })

const coreMat = new THREE.MeshBasicMaterial({ color: 0x00ffcc })

const legMat = new THREE.MeshStandardMaterial({
  color: 0x1a1a1a,
  metalness: 0.8,
  roughness: 0.3,
})

// ── Shared geometries ───────────────────────────────────────────
const baseGeo = new THREE.CylinderGeometry(0.3, 0.35, 0.08, 8)
const headGeo = new THREE.IcosahedronGeometry(0.4, 0)
const coreGeo = new THREE.TorusKnotGeometry(0.12, 0.02, 64, 4)
const ringGeo = new THREE.TorusGeometry(0.32, 0.02, 4, 8)

interface LegData {
  mesh: THREE.Mesh
  angle: number
  phase: number
}

/**
 * Procedural bacteriophage enemy controller.
 *
 * @author guinetik
 * @date 2026-04-05
 * @spec docs/superpowers/specs/2026-04-05-enemy-system-design.md
 */
export class BacteriophageController implements Tickable {
  readonly group = new THREE.Group()
  readonly enemy: Enemy

  private readonly bodyGroup = new THREE.Group()
  private readonly legsGroup = new THREE.Group()
  private readonly legs: LegData[] = []
  private head!: THREE.Mesh
  private core!: THREE.Mesh
  private light!: THREE.PointLight

  private elapsed = 0
  private readonly timeOffset: number
  private flashTimer = 0
  private dead = false
  private disposed = false

  /** Current visual state — set by VC from director output. */
  isMoving = false
  /** Current agitation state — set by VC from director output. */
  isAgitated = false

  constructor(enemy: Enemy) {
    this.enemy = enemy
    this.timeOffset = Math.random() * 10

    this.group.add(this.bodyGroup)
    this.group.add(this.legsGroup)
    this.group.scale.setScalar(PHAGE_SCALE)

    this.buildBody()
    this.buildLegs()

    // Set initial body height (legs extend from here)
    this.bodyGroup.position.y = 0.8

    // Wire death
    this.enemy.onDeath = () => this.die()
  }

  // ═══════════════════════════════════════════════════════════════
  // Build geometry
  // ═══════════════════════════════════════════════════════════════

  private buildBody(): void {
    // Baseplate
    const base = new THREE.Mesh(baseGeo, darkMetal)
    base.position.y = -0.05
    this.bodyGroup.add(base)

    // Ring around baseplate
    const ring = new THREE.Mesh(ringGeo, darkMetal)
    ring.rotation.x = Math.PI / 2
    ring.position.y = -0.05
    this.bodyGroup.add(ring)

    // Trunk connector
    const trunkGeo = new THREE.CylinderGeometry(0.18, 0.28, 0.35, 8)
    const trunk = new THREE.Mesh(trunkGeo, darkMetal)
    trunk.position.y = 0.15
    this.bodyGroup.add(trunk)

    // Segmented collar (accordion neck)
    const COLLAR_SEGMENTS = 6
    const COLLAR_START_Y = 0.38
    const COLLAR_SPACING = 0.045
    for (let i = 0; i < COLLAR_SEGMENTS; i++) {
      const r = 0.15 + (i % 2 === 0 ? 0.05 : -0.03)
      const segGeo = new THREE.CylinderGeometry(r, r, 0.04, 8)
      const seg = new THREE.Mesh(segGeo, neckMat)
      seg.position.y = COLLAR_START_Y + i * COLLAR_SPACING
      this.bodyGroup.add(seg)
    }

    // Collar cap ring
    const capRingGeo = new THREE.TorusGeometry(0.14, 0.015, 4, 8)
    const capRing = new THREE.Mesh(capRingGeo, neckMat)
    capRing.rotation.x = Math.PI / 2
    capRing.position.y = 0.36
    this.bodyGroup.add(capRing)

    // Capsid head
    this.head = new THREE.Mesh(headGeo, headMat)
    this.head.position.y = 0.75
    this.bodyGroup.add(this.head)

    // DNA core (inside head)
    this.core = new THREE.Mesh(coreGeo, coreMat)
    this.core.position.y = 0.75
    this.bodyGroup.add(this.core)

    // Inner point light
    this.light = new THREE.PointLight(0x00ffcc, 0.8, 3)
    this.light.position.y = 0.75
    this.bodyGroup.add(this.light)
  }

  private buildLegs(): void {
    for (let i = 0; i < LEG_COUNT; i++) {
      const angle = (i / LEG_COUNT) * Math.PI * 2
      const phase = i % 2 === 0 ? 0 : Math.PI

      const curve = this.makeLegCurve(angle, phase, 0, false)
      const geo = new THREE.TubeGeometry(curve, LEG_SEGMENTS, LEG_TUBE_RADIUS, 4, false)
      const mesh = new THREE.Mesh(geo, legMat)
      this.legsGroup.add(mesh)
      this.legs.push({ mesh, angle, phase })
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // Leg curve generation
  // ═══════════════════════════════════════════════════════════════

  private makeLegCurve(
    angle: number,
    phase: number,
    time: number,
    isMoving: boolean,
  ): THREE.QuadraticBezierCurve3 {
    const cx = Math.cos(angle)
    const cz = Math.sin(angle)
    const tx = -cz
    const tz = cx

    const hip = new THREE.Vector3(cx * 0.3, 0.8, cz * 0.3)

    if (!isMoving) {
      // Idle: planted legs with subtle knee twitch
      const foot = new THREE.Vector3(cx * 1.2, 0, cz * 1.2)
      const knee = new THREE.Vector3(
        cx * 0.7,
        0.85 + Math.sin(time * 0.8 + phase) * 0.04,
        cz * 0.7,
      )
      return new THREE.QuadraticBezierCurve3(hip, knee, foot)
    }

    // Walking: alternating tetrapod gait
    const GAIT_SPEED = 8
    const STRIDE = 0.25
    const cycle = ((time * GAIT_SPEED + phase) % (Math.PI * 2)) / (Math.PI * 2)
    const isSwing = cycle > 0.5
    const swingT = isSwing ? (cycle - 0.5) * 2 : 0
    const stanceT = !isSwing ? cycle * 2 : 0

    const restX = cx * 1.2
    const restZ = cz * 1.2

    let footX: number, footZ: number, footY: number
    if (isSwing) {
      footX = restX + tx * STRIDE * (swingT * 2 - 1)
      footZ = restZ + tz * STRIDE * (swingT * 2 - 1)
      footY = Math.sin(swingT * Math.PI) * 0.35
    } else {
      footX = restX + tx * STRIDE * (1 - stanceT * 2)
      footZ = restZ + tz * STRIDE * (1 - stanceT * 2)
      footY = 0
    }

    const foot = new THREE.Vector3(footX, footY, footZ)

    const kneeRadial = isSwing ? 0.65 : 0.75
    const kneeHeight = isSwing
      ? 1.1 + Math.sin(swingT * Math.PI) * 0.3
      : 0.85 + Math.sin(stanceT * Math.PI * 0.5) * 0.05
    const kneeOff = isSwing ? STRIDE * (swingT - 0.5) : STRIDE * (0.5 - stanceT)

    const knee = new THREE.Vector3(
      cx * kneeRadial + tx * kneeOff * 0.5,
      kneeHeight,
      cz * kneeRadial + tz * kneeOff * 0.5,
    )

    return new THREE.QuadraticBezierCurve3(hip, knee, foot)
  }

  // ═══════════════════════════════════════════════════════════════
  // Per-frame tick
  // ═══════════════════════════════════════════════════════════════

  /** @inheritdoc */
  tick(dt: number): void {
    if (this.disposed) return
    this.elapsed += dt
    const t = this.elapsed + this.timeOffset

    // --- Body animation ---
    if (this.isMoving) {
      this.bodyGroup.position.y = 0.8 + Math.sin(t * 8) * 0.03
      this.bodyGroup.rotation.z = Math.sin(t * 8) * 0.06
      this.bodyGroup.rotation.x = Math.sin(t * 4) * 0.03
    } else {
      this.bodyGroup.position.y = 0.8 + Math.sin(t * 1.2) * 0.015
      this.bodyGroup.rotation.z = Math.sin(t * 0.7) * 0.02
      this.bodyGroup.rotation.x = Math.sin(t * 0.5) * 0.01
    }

    // --- DNA core spin + pulse ---
    this.core.rotation.y += 0.02
    const coreScale = 1 + Math.sin(t * 2) * 0.1
    this.core.scale.setScalar(coreScale)

    // --- Light pulse ---
    this.light.intensity = 0.6 + Math.sin(t * 2) * 0.3

    // --- Legs ---
    for (const leg of this.legs) {
      const curve = this.makeLegCurve(leg.angle, leg.phase, t, this.isMoving)
      leg.mesh.geometry.dispose()
      leg.mesh.geometry = new THREE.TubeGeometry(curve, LEG_SEGMENTS, LEG_TUBE_RADIUS, 4, false)
    }

    // --- Hit flash ---
    if (this.flashTimer > 0) {
      this.flashTimer -= dt
      if (this.flashTimer <= 0) {
        this.head.material = headMat
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // Hit / death
  // ═══════════════════════════════════════════════════════════════

  /** Flash head white on hit — called by VC when projectile connects. */
  flash(): void {
    this.flashTimer = HIT_FLASH_DURATION
    this.head.material = flashMat
  }

  /** Death animation — collapse legs, flash core, remove after delay. */
  private die(): void {
    this.dead = true

    // Collapse legs inward
    for (const leg of this.legs) {
      const curve = new THREE.QuadraticBezierCurve3(
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(0, 0.1, 0),
        new THREE.Vector3(0, -0.2, 0),
      )
      leg.mesh.geometry.dispose()
      leg.mesh.geometry = new THREE.TubeGeometry(curve, LEG_SEGMENTS, LEG_TUBE_RADIUS, 4, false)
    }

    // Flash core + light spike
    this.core.material = flashMat
    this.light.intensity = 2

    // Remove from scene after brief delay
    setTimeout(() => {
      this.group.removeFromParent()
    }, DEATH_DELAY_MS)
  }

  /** Clean up all geometry and materials. */
  dispose(): void {
    this.disposed = true
    this.group.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.geometry.dispose()
        // Only dispose instance-owned materials (not shared statics)
        if (
          child.material !== darkMetal &&
          child.material !== neckMat &&
          child.material !== headMat &&
          child.material !== coreMat &&
          child.material !== legMat &&
          child.material !== flashMat
        ) {
          ;(child.material as THREE.Material).dispose()
        }
      }
    })
  }
}
```

- [ ] **Step 2: Verify type-check passes**

Run: `bun run type-check`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/three/BacteriophageController.ts
git commit -m "feat(enemy): add BacteriophageController — procedural 8-legged walker mesh"
```

---

### Task 7: Wire into FpsViewController

**Files:**
- Modify: `src/views/FpsViewController.ts`

- [ ] **Step 1: Add imports and constants**

Add the following imports to the top of `src/views/FpsViewController.ts`, after the existing imports:

```ts
import { EnemyDirector } from '@/lib/fps/enemyDirector'
import type { EnemyHandle } from '@/lib/fps/enemyDirector'
import { BacteriophageController } from '@/three/BacteriophageController'
```

Add constants after the existing constants block:

```ts
const ENEMY_SPAWN_COUNT = 8
const ENEMY_SPAWN_RADIUS = 80
const ENEMY_MIN_SPAWN_DISTANCE = 20
```

- [ ] **Step 2: Add fields to the class**

Add after the existing `private readonly targetDummies: TargetDummyController[] = []` line:

```ts
private enemyDirector: EnemyDirector | null = null
private readonly enemyControllers = new Map<number, BacteriophageController>()
```

- [ ] **Step 3: Add enemy spawning in init()**

Add the following after the `// Enemy hit → flash + particles` block (after the target dummies section) and before the `// Death handler` section in `init()`:

```ts
    // Enemies — ?enemies=true spawns bacteriophages around the player
    if (params.has('enemies')) {
      this.enemyDirector = new EnemyDirector()
      this.enemyDirector.onContactDamage = (_handle, damage) => {
        this.playerController?.takeDamage(damage)
      }
      this.tickHandler.register(this.enemyDirector, TICK_PRIORITY_PHYSICS + 4)

      for (let i = 0; i < ENEMY_SPAWN_COUNT; i++) {
        const angle = (i / ENEMY_SPAWN_COUNT) * Math.PI * 2
        const radius = ENEMY_MIN_SPAWN_DISTANCE + Math.random() * (ENEMY_SPAWN_RADIUS - ENEMY_MIN_SPAWN_DISTANCE)
        const x = Math.cos(angle) * radius
        const z = Math.sin(angle) * radius
        const y = heightmap.heightAt(x, z)

        const handle = this.enemyDirector.spawn('bacteriophage', x, y, z)
        const controller = new BacteriophageController(handle.enemy)
        controller.group.position.set(x, y, z)
        this.sceneManager.addToScene(controller.group)
        this.projectileSystem!.addEnemy(handle.enemy)
        this.tickHandler.register(controller, TICK_PRIORITY_ANIMATION)
        this.enemyControllers.set(handle.id, controller)
      }

      // Enemy hit → flash + particles (uses existing onEnemyHit, extend it)
      const existingOnEnemyHit = this.projectileSystem!.onEnemyHit
      this.projectileSystem!.onEnemyHit = (enemy, pos) => {
        existingOnEnemyHit?.call(this.projectileSystem, enemy, pos)
        // Find matching controller and flash it
        for (const [id, ctrl] of this.enemyControllers) {
          if (ctrl.enemy === enemy) {
            ctrl.flash()
            if (!enemy.alive) {
              // Enemy died — clean up
              this.tickHandler!.unregister(ctrl)
              this.projectileSystem!.removeEnemy(enemy)
              this.enemyControllers.delete(id)
            }
            break
          }
        }
      }
    }
```

- [ ] **Step 4: Add enemy sync in tick()**

Add the following at the end of the `tick()` method, before the telemetry section:

```ts
    // --- Enemy sync ---
    if (this.enemyDirector && this.playerController) {
      const pp = this.playerController.group.position
      this.enemyDirector.setPlayerPosition(pp.x, pp.y, pp.z)

      for (const handle of this.enemyDirector.enemies) {
        if (!handle.enemy.alive) continue
        const ctrl = this.enemyControllers.get(handle.id)
        if (!ctrl) continue

        // Sync visual state from behavior
        ctrl.isMoving = handle.lastOutput.isMoving
        ctrl.isAgitated = handle.lastOutput.isAgitated

        // Sync position from domain → visual
        ctrl.group.position.x = handle.enemy.position.x
        ctrl.group.position.z = handle.enemy.position.z

        // Clamp Y to terrain
        ctrl.group.position.y = this.heightmap?.heightAt(
          handle.enemy.position.x,
          handle.enemy.position.z,
        ) ?? 0
        handle.enemy.position.y = ctrl.group.position.y

        // Face movement direction
        if (handle.lastOutput.isMoving) {
          const dir = handle.lastOutput.moveDir
          ctrl.group.rotation.y = Math.atan2(dir.x, dir.z)
        }
      }
    }
```

- [ ] **Step 5: Add cleanup in dispose()**

Add the following in `dispose()`, before `this.projectileSystem?.dispose()`:

```ts
    for (const ctrl of this.enemyControllers.values()) ctrl.dispose()
    this.enemyControllers.clear()
    this.enemyDirector?.despawnAll()
```

- [ ] **Step 6: Verify type-check passes**

Run: `bun run type-check`
Expected: PASS

- [ ] **Step 7: Run all tests**

Run: `bun test:unit`
Expected: All tests PASS (including new enemy tests)

- [ ] **Step 8: Commit**

```bash
git add src/views/FpsViewController.ts
git commit -m "feat(enemy): wire EnemyDirector + BacteriophageController into FPS view

Spawn 8 bacteriophages with ?enemies=true. They wander, aggro,
deal contact damage, and can be killed with the weapon tool."
```

---

### Task 8: Manual Smoke Test

**Files:** None (testing only)

- [ ] **Step 1: Start dev server**

Run: `bun dev`

- [ ] **Step 2: Test enemy spawning**

Open `http://localhost:5173/fps?enemies=true&flat=true` in the browser.

Verify:
- 8 bacteriophages appear scattered around the map
- They have the procedural mesh (legs, head, glowing core)
- They animate idle (subtle leg twitch, body breathing)

- [ ] **Step 3: Test aggro + movement**

Walk toward a bacteriophage. Verify:
- It starts chasing when you get within ~40 units
- Legs animate walking gait
- It weaves slightly while chasing
- It gives up if you run far enough away (~60 units)

- [ ] **Step 4: Test contact damage**

Let a bacteriophage reach you. Verify:
- Your HP drops (visible in the HUD)
- Damage repeats on the cooldown timer, not every frame

- [ ] **Step 5: Test killing**

Switch to weapon mode (2 key) and shoot a bacteriophage. Verify:
- Hit flash on the head
- Impact particles spawn
- After enough hits, death animation plays (legs collapse, core flash)
- Dead enemy is removed from the scene

- [ ] **Step 6: Commit any fixes**

If any issues are found during smoke testing, fix and commit them.
