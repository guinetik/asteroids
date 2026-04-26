/**
 * Ice harvest orbital minigame.
 *
 * 2D side-scrolling action game: dodge ice chunks scrolling through
 * Saturn's ring plane, fire harpoons to shatter them, collect the
 * scintillating shards before they evaporate. Hull HP is the pressure
 * — no time limit, but the chunks keep coming faster.
 *
 * Pure game logic — no DOM or canvas. The Vue component reads state
 * and renders.
 *
 * @author guinetik
 * @date 2026-04-11
 * @spec docs/superpowers/specs/2026-04-10-orbital-minigame-design.md
 */
import type {
  OrbitalMiniGame,
  OrbitalMiniGameContext,
  OrbitalMiniGameEvents,
  OrbitalMiniGameStatus,
  OrbitalMiniGameStep,
} from '../OrbitalMiniGame'
import type { ShipInput, IceChunk, IceShard, Harpoon, IceChunkSize } from './types'
import { useAudio } from '@/audio/useAudio'
import {
  CANVAS_WIDTH,
  CANVAS_HEIGHT,
  SHIP_ACCELERATION,
  SHIP_DRAG,
  SHIP_MAX_SPEED,
  SHIP_GRAVITY,
  SHIP_HALF_WIDTH,
  SHIP_HALF_HEIGHT,
  HULL_MAX_HP,
  COOK_ZONE_Y,
  COOK_ZONE_TOLERANCE,
  HARPOON_LAUNCH_SPEED,
  HARPOON_LAUNCH_ANGLE,
  HARPOON_GRAVITY,
  HARPOON_COOLDOWN,
  HARPOON_MAX_AIR_TIME,
  CHUNK_RADIUS_SMALL,
  CHUNK_RADIUS_MEDIUM,
  CHUNK_RADIUS_LARGE,
  CHUNK_SPEED_MIN,
  CHUNK_SPEED_MAX,
  CHUNK_DAMAGE_SMALL,
  CHUNK_DAMAGE_MEDIUM,
  CHUNK_DAMAGE_LARGE as CHUNK_DAMAGE_MAX,
  CHUNK_SHARDS_SMALL,
  CHUNK_SHARDS_MEDIUM,
  CHUNK_SHARDS_LARGE,
  CHUNK_SPAWN_INTERVAL_START,
  CHUNK_SPAWN_INTERVAL_MIN,
  CHUNK_SPAWN_RAMP_DURATION,
  CHUNK_SIZE_WEIGHTS,
  SHARD_VALUE,
  SHARD_TTL,
  SHARD_COLLECT_RADIUS,
  SHARD_SCATTER_SPEED,
} from './constants'

/** Radius lookup by chunk size. */
const CHUNK_RADII: Record<IceChunkSize, number> = {
  small: CHUNK_RADIUS_SMALL,
  medium: CHUNK_RADIUS_MEDIUM,
  large: CHUNK_RADIUS_LARGE,
}

/** Damage lookup by chunk size. */
const CHUNK_DAMAGE: Record<IceChunkSize, number> = {
  small: CHUNK_DAMAGE_SMALL,
  medium: CHUNK_DAMAGE_MEDIUM,
  large: CHUNK_DAMAGE_MAX,
}

/** Shard count lookup by chunk size. */
const CHUNK_SHARD_COUNT: Record<IceChunkSize, number> = {
  small: CHUNK_SHARDS_SMALL,
  medium: CHUNK_SHARDS_MEDIUM,
  large: CHUNK_SHARDS_LARGE,
}

/**
 * Ice harvest minigame — dodge ice chunks, fire harpoons, collect shards.
 *
 * @author guinetik
 * @date 2026-04-11
 */
export class IceHarvestMiniGame implements OrbitalMiniGame, OrbitalMiniGameEvents {
  /** The shuttle mission id this minigame tracks. */
  readonly missionId: string

  /** Default minigame renders as a Vue overlay card. */
  readonly presentation = 'overlay' as const

  /** Target ice amount to collect for mission completion. */
  readonly targetIce: number

  private _status: OrbitalMiniGameStatus = 'active'
  private readonly _steps: OrbitalMiniGameStep[] = [
    { label: 'Harvest ring ice', complete: false, active: true },
    { label: 'Mission complete', complete: false, active: false },
  ]

  /** Ship horizontal position in canvas pixels. */
  shipX = CANVAS_WIDTH * 0.2
  /** Ship vertical position in canvas pixels. */
  shipY = CANVAS_HEIGHT * 0.3
  /** Ship horizontal velocity in px/s. */
  shipVx = 0
  /** Ship vertical velocity in px/s. */
  shipVy = 0
  /** Ship facing direction: 1 = right, -1 = left. */
  shipFacing = 1

  /** Current hull hit points. */
  hullHp = HULL_MAX_HP
  /** Maximum hull hit points. */
  readonly hullMaxHp = HULL_MAX_HP

  /** Accumulated ice collected. */
  iceCollected = 0

  /** Active ice chunks in the field. */
  chunks: IceChunk[] = []
  /** Collectible ice shards from shattered chunks. */
  shards: IceShard[] = []
  /** Active harpoon in flight (null if none). */
  harpoon: Harpoon | null = null
  /** Cooldown remaining before next harpoon can fire (seconds). */
  harpoonCooldown = 0

  /** Time spent in the cook zone — death at COOK_ZONE_TOLERANCE. */
  heatTimer = 0
  /** Total elapsed game time for spawn ramping. */
  private elapsedTime = 0
  /** Time accumulator for chunk spawning. */
  private chunkSpawnTimer = 0
  /** Damage flash timer — positive when the ship just took a hit. */
  damageFlash = 0

  private input: ShipInput = { up: false, down: false, left: false, right: false }

  /** Callback fired when the minigame completes successfully. */
  onComplete: ((missionId: string) => void) | null = null
  /** Callback fired when the step list changes. */
  onStepChange: ((steps: readonly OrbitalMiniGameStep[]) => void) | null = null

  /**
   * Create a new ice harvest minigame.
   *
   * @param missionId - shuttle mission id
   * @param targetIce - ice units required for completion
   */
  constructor(missionId: string, targetIce: number) {
    this.missionId = missionId
    this.targetIce = targetIce
  }

  /** Current minigame status. */
  get status(): OrbitalMiniGameStatus {
    return this._status
  }

  /** Ordered steps for the tracker HUD. */
  get steps(): readonly OrbitalMiniGameStep[] {
    return this._steps
  }

  /** Progress numerator — ice collected so far. */
  get progressCurrent(): number {
    return this.iceCollected
  }

  /** Progress denominator — target ice amount. */
  get progressTotal(): number {
    return this.targetIce
  }

  /** Set the current WASD input state. Called by the Vue component. */
  setInput(input: ShipInput): void {
    this.input = input
  }

  /** Fire a harpoon from the ship's current position. */
  fireHarpoon(): void {
    if (this._status !== 'active') return
    if (this.harpoon !== null) return
    if (this.harpoonCooldown > 0) return

    const angle = this.shipFacing === 1 ? HARPOON_LAUNCH_ANGLE : Math.PI - HARPOON_LAUNCH_ANGLE
    this.harpoon = {
      x: this.shipX,
      y: this.shipY,
      vx: HARPOON_LAUNCH_SPEED * Math.cos(angle),
      vy: HARPOON_LAUNCH_SPEED * Math.sin(angle),
      airTime: 0,
    }
    this.harpoonCooldown = HARPOON_COOLDOWN
    useAudio().play('sfx.harpoon')
  }

  /** Per-frame update. Advances all systems. */
  tick(dt: number, _ctx: OrbitalMiniGameContext): void {
    if (this._status !== 'active') return

    this.elapsedTime += dt
    this.damageFlash = Math.max(0, this.damageFlash - dt)
    this.harpoonCooldown = Math.max(0, this.harpoonCooldown - dt)

    this.tickShip(dt)
    if (this.checkCookZone(dt)) return
    this.tickChunkSpawning(dt)
    this.tickChunks(dt)
    this.tickHarpoon(dt)
    this.tickShards(dt)
    this.checkHarpoonChunkCollisions()
    this.checkShipChunkCollisions()
    this.checkShipShardCollisions()
    this.cleanupChunks()
    this.cleanupShards()
    this.checkEndConditions()
  }

  /** Manual complete is a no-op — completion is automatic via ice gauge. */
  complete(): void {
    // Completion is driven by iceCollected reaching targetIce
  }

  /** Clean up resources. */
  dispose(): void {
    this.chunks.length = 0
    this.shards.length = 0
    this.harpoon = null
  }

  /** Advance ship physics. */
  private tickShip(dt: number): void {
    this.shipVy += SHIP_GRAVITY * dt

    if (this.input.right) this.shipVx += SHIP_ACCELERATION * dt
    if (this.input.left) this.shipVx -= SHIP_ACCELERATION * dt
    if (this.input.up) this.shipVy -= SHIP_ACCELERATION * dt
    if (this.input.down) this.shipVy += SHIP_ACCELERATION * dt

    if (this.input.right) this.shipFacing = 1
    if (this.input.left) this.shipFacing = -1

    const dragPerFrame = Math.pow(SHIP_DRAG, dt * 60)
    this.shipVx *= dragPerFrame
    this.shipVy *= dragPerFrame

    const speed = Math.sqrt(this.shipVx * this.shipVx + this.shipVy * this.shipVy)
    if (speed > SHIP_MAX_SPEED) {
      const scale = SHIP_MAX_SPEED / speed
      this.shipVx *= scale
      this.shipVy *= scale
    }

    this.shipX += this.shipVx * dt
    this.shipY += this.shipVy * dt

    this.shipX = Math.max(SHIP_HALF_WIDTH, Math.min(CANVAS_WIDTH - SHIP_HALF_WIDTH, this.shipX))
    this.shipY = Math.max(SHIP_HALF_HEIGHT, Math.min(CANVAS_HEIGHT - SHIP_HALF_HEIGHT, this.shipY))
  }

  /** Check if ship is in the cook zone. */
  private checkCookZone(dt: number): boolean {
    if (this.shipY + SHIP_HALF_HEIGHT >= COOK_ZONE_Y) {
      this.heatTimer += dt
      if (this.heatTimer >= COOK_ZONE_TOLERANCE) {
        this._status = 'failed'
        return true
      }
    } else {
      this.heatTimer = Math.max(0, this.heatTimer - dt * 0.5)
    }
    return false
  }

  /** Spawn ice chunks from the right edge. */
  private tickChunkSpawning(dt: number): void {
    // Ramp spawn rate over time
    const rampT = Math.min(1, this.elapsedTime / CHUNK_SPAWN_RAMP_DURATION)
    const interval =
      CHUNK_SPAWN_INTERVAL_START + (CHUNK_SPAWN_INTERVAL_MIN - CHUNK_SPAWN_INTERVAL_START) * rampT

    this.chunkSpawnTimer += dt
    while (this.chunkSpawnTimer >= interval) {
      this.chunkSpawnTimer -= interval
      this.spawnChunk()
    }
  }

  /** Spawn a single ice chunk at the right edge. */
  private spawnChunk(): void {
    const size = this.rollChunkSize()
    const radius = CHUNK_RADII[size]
    const speed = CHUNK_SPEED_MIN + Math.random() * (CHUNK_SPEED_MAX - CHUNK_SPEED_MIN)

    // Spawn in the playable vertical range (above cook zone)
    const minY = 60 + radius
    const maxY = COOK_ZONE_Y - 30 - radius
    const y = minY + Math.random() * (maxY - minY)

    this.chunks.push({
      x: CANVAS_WIDTH + radius,
      y,
      vx: -speed,
      vy: (Math.random() - 0.5) * 20,
      size,
      radius,
      shattered: false,
    })
  }

  /** Pick a chunk size using weighted probabilities. */
  private rollChunkSize(): IceChunkSize {
    const r = Math.random()
    const [smallW, medW] = CHUNK_SIZE_WEIGHTS
    if (r < smallW!) return 'small'
    if (r < smallW! + medW!) return 'medium'
    return 'large'
  }

  /** Move chunks left. */
  private tickChunks(dt: number): void {
    for (const chunk of this.chunks) {
      chunk.x += chunk.vx * dt
      chunk.y += chunk.vy * dt
    }
  }

  /** Move the harpoon. */
  private tickHarpoon(dt: number): void {
    if (!this.harpoon) return
    this.harpoon.vy += HARPOON_GRAVITY * dt
    this.harpoon.x += this.harpoon.vx * dt
    this.harpoon.y += this.harpoon.vy * dt
    this.harpoon.airTime += dt

    // Despawn if off-screen or too old
    if (
      this.harpoon.airTime > HARPOON_MAX_AIR_TIME ||
      this.harpoon.x < -20 ||
      this.harpoon.x > CANVAS_WIDTH + 20 ||
      this.harpoon.y > CANVAS_HEIGHT + 20
    ) {
      this.harpoon = null
    }
  }

  /** Move and age shards. */
  private tickShards(dt: number): void {
    for (const shard of this.shards) {
      if (shard.collected) continue
      shard.x += shard.vx * dt
      shard.y += shard.vy * dt
      // Slow down shards over time
      shard.vx *= Math.pow(0.95, dt * 60)
      shard.vy *= Math.pow(0.95, dt * 60)
      shard.ttl -= dt
    }
  }

  /** Check harpoon-chunk collisions — shatters the chunk into shards. */
  private checkHarpoonChunkCollisions(): void {
    if (!this.harpoon) return
    for (const chunk of this.chunks) {
      if (chunk.shattered) continue
      const dx = this.harpoon.x - chunk.x
      const dy = this.harpoon.y - chunk.y
      const dist = Math.sqrt(dx * dx + dy * dy)
      if (dist <= chunk.radius + 6) {
        chunk.shattered = true
        this.harpoon = null
        this.spawnShards(chunk)
        useAudio().play('sfx.ice_break')
        return
      }
    }
  }

  /** Spawn collectible shards from a shattered chunk. */
  private spawnShards(chunk: IceChunk): void {
    const count = CHUNK_SHARD_COUNT[chunk.size]
    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.5
      const speed = SHARD_SCATTER_SPEED * (0.5 + Math.random() * 0.5)
      this.shards.push({
        x: chunk.x,
        y: chunk.y,
        vx: Math.cos(angle) * speed + chunk.vx * 0.3,
        vy: Math.sin(angle) * speed,
        ttl: SHARD_TTL,
        collected: false,
        value: SHARD_VALUE,
      })
    }
  }

  /** Check ship-chunk collisions — deals hull damage. */
  private checkShipChunkCollisions(): void {
    for (const chunk of this.chunks) {
      if (chunk.shattered) continue
      const dx = this.shipX - chunk.x
      const dy = this.shipY - chunk.y
      const dist = Math.sqrt(dx * dx + dy * dy)
      const hitDist = chunk.radius + Math.max(SHIP_HALF_WIDTH, SHIP_HALF_HEIGHT)
      if (dist <= hitDist) {
        const damage = CHUNK_DAMAGE[chunk.size]!
        this.hullHp -= damage
        this.damageFlash = 0.3
        chunk.shattered = true // chunk breaks on impact too
        this.spawnShards(chunk) // still produces shards on collision
        useAudio().play('sfx.collision', { volume: Math.max(0.25, damage / CHUNK_DAMAGE_MAX) })
      }
    }
  }

  /** Check ship-shard proximity — fly through shards to collect. */
  private checkShipShardCollisions(): void {
    for (const shard of this.shards) {
      if (shard.collected) continue
      const dx = shard.x - this.shipX
      const dy = shard.y - this.shipY
      const dist = Math.sqrt(dx * dx + dy * dy)
      if (dist <= SHARD_COLLECT_RADIUS) {
        shard.collected = true
        this.iceCollected += shard.value
        useAudio().play('sfx.collect')
      }
    }
  }

  /** Remove off-screen and shattered chunks. */
  private cleanupChunks(): void {
    this.chunks = this.chunks.filter((c) => !c.shattered && c.x > -c.radius * 2)
  }

  /** Remove collected and expired shards. */
  private cleanupShards(): void {
    this.shards = this.shards.filter(
      (s) => !s.collected && s.ttl > 0 && s.x > -20 && s.x < CANVAS_WIDTH + 20,
    )
  }

  /** Check for mission completion or failure. */
  private checkEndConditions(): void {
    if (this.iceCollected >= this.targetIce) {
      this._status = 'completed'
      this._steps[0]!.complete = true
      this._steps[0]!.active = false
      this._steps[1]!.complete = true
      this._steps[1]!.active = false
      this.onStepChange?.(this._steps)
      this.onComplete?.(this.missionId)
      return
    }

    if (this.hullHp <= 0) {
      this.hullHp = 0
      this._status = 'failed'
    }
  }
}
