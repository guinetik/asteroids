/**
 * Pure TypeScript simulation for the habitat arcade cabinet Asteroids port.
 *
 * @author guinetik
 * @date 2026-05-09
 * @spec docs/superpowers/specs/2026-05-09-arcade-asteroids-design.md
 */

import { ASTEROIDS_GAME_CONFIG, ASTEROIDS_STARTING_LIVES } from './config'
import {
  buildAsteroidVertices,
  circlesOverlap,
  velocityFromAngle,
  wrapCoordinate,
} from './geometry'
import { defaultRandomSource, randomRange, randomSign } from './rng'
import type {
  AsteroidEntity,
  AsteroidsBullet,
  AsteroidsGameOptions,
  AsteroidsGameState,
  AsteroidsInputs,
  AsteroidsShip,
  AsteroidSize,
  RandomSource,
  SaucerEntity,
  SaucerSize,
} from './types'

/** Empty input object used by UI callers that want to advance attract animations. */
export const ASTEROIDS_IDLE_INPUTS: AsteroidsInputs = {
  rotateLeft: false,
  rotateRight: false,
  thrust: false,
  fire: false,
  hyperspace: false,
  start: false,
}

const LARGE_ASTEROID_EDGE_MARGIN = 12
const FIRE_STARTS_GAME = true
const BULLET_SPAWN_OFFSET_FACTOR = 1.15
const SPLIT_ANGLE_SPREAD_RADIANS = 0.8
const RESPAWN_SAFE_RADIUS_FACTOR = 6
const SAUCER_VERTICAL_DRIFT = 18

/**
 * Stateful rules engine for classic Asteroids. Rendering, audio, storage, and
 * browser input live outside this class.
 */
export class AsteroidsGame {
  private readonly random: RandomSource
  private state: AsteroidsGameState

  /**
   * Build a simulation for the given cabinet viewport.
   *
   * @param options - Dimensions, random source, high score, and optional restore state.
   */
  constructor(options: AsteroidsGameOptions) {
    this.random = options.random ?? defaultRandomSource
    this.state = options.initialState
      ? cloneState(options.initialState)
      : this.createAttractState(options.width, options.height, options.highScore ?? 0)
  }

  /** Return an immutable-style copy of the current state for rendering/tests. */
  snapshot(): AsteroidsGameState {
    return cloneState(this.state)
  }

  /**
   * Advance the simulation by one frame.
   *
   * @param dt - Delta time in seconds.
   * @param inputs - Current arcade controls.
   */
  tick(dt: number, inputs: AsteroidsInputs = ASTEROIDS_IDLE_INPUTS): void {
    const step = Math.max(0, dt)
    if (inputs.start || (FIRE_STARTS_GAME && inputs.fire && this.state.phase !== 'playing')) {
      if (this.state.phase === 'attract' || this.state.phase === 'gameOver') {
        this.startRun()
        return
      }
    }

    if (this.state.phase === 'attract' || this.state.phase === 'gameOver') return
    if (this.state.phase === 'respawning') {
      this.tickRespawn(step)
      return
    }

    this.tickCooldowns(step)
    this.tickShip(step, inputs)
    this.tickBullets(step)
    this.tickAsteroids(step)
    this.tickSaucer(step)

    if (inputs.fire) this.tryFireBullet()
    if (inputs.hyperspace) this.tryHyperspace()

    this.resolveBulletAsteroidCollisions()
    this.resolveBulletSaucerCollisions()
    this.resolveSaucerBulletShipCollisions()
    this.resolveShipAsteroidCollisions()

    if (this.state.phase === 'playing' && this.state.asteroids.length === 0) {
      this.state.wave += 1
      this.spawnWave()
    }
  }

  /** Start a fresh run from attract or game-over state. */
  startRun(): void {
    const highScore = this.state.highScore
    this.state = this.createAttractState(this.state.width, this.state.height, highScore)
    this.state.phase = 'playing'
    this.state.lives = ASTEROIDS_STARTING_LIVES
    this.state.wave = 1
    this.state.score = 0
    this.state.message = null
    this.spawnWave()
  }

  private createAttractState(width: number, height: number, highScore: number): AsteroidsGameState {
    return {
      phase: 'attract',
      width,
      height,
      score: 0,
      highScore,
      lives: ASTEROIDS_STARTING_LIVES,
      wave: 0,
      nextEntityId: 1,
      ship: this.createShip(width, height),
      bullets: [],
      saucerBullets: [],
      asteroids: [],
      saucer: null,
      fireCooldown: 0,
      saucerSpawnTimer: ASTEROIDS_GAME_CONFIG.saucerFirstSpawnSeconds,
      hyperspaceCooldown: 0,
      message: 'PRESS ENTER',
    }
  }

  private createShip(width: number, height: number): AsteroidsShip {
    return {
      id: 0,
      x: width / 2,
      y: height / 2,
      vx: 0,
      vy: 0,
      angle: 0,
      radius: ASTEROIDS_GAME_CONFIG.shipRadius,
      invulnerableTimer: ASTEROIDS_GAME_CONFIG.shipInvulnerableSeconds,
      respawnTimer: 0,
      visible: true,
    }
  }

  private nextId(): number {
    const id = this.state.nextEntityId
    this.state.nextEntityId += 1
    return id
  }

  private tickCooldowns(dt: number): void {
    this.state.fireCooldown = Math.max(0, this.state.fireCooldown - dt)
    this.state.hyperspaceCooldown = Math.max(0, this.state.hyperspaceCooldown - dt)
    this.state.ship.invulnerableTimer = Math.max(0, this.state.ship.invulnerableTimer - dt)
  }

  private tickShip(dt: number, inputs: AsteroidsInputs): void {
    const ship = this.state.ship
    if (!ship.visible) return
    if (inputs.rotateLeft) ship.angle -= ASTEROIDS_GAME_CONFIG.shipTurnRadiansPerSecond * dt
    if (inputs.rotateRight) ship.angle += ASTEROIDS_GAME_CONFIG.shipTurnRadiansPerSecond * dt
    if (inputs.thrust) {
      const impulse = velocityFromAngle(
        ship.angle,
        ASTEROIDS_GAME_CONFIG.shipThrustPixelsPerSecond * dt,
      )
      ship.vx += impulse.x
      ship.vy += impulse.y
    }
    ship.x += ship.vx * dt
    ship.y += ship.vy * dt
    ship.vx *= ASTEROIDS_GAME_CONFIG.shipDragPerSecond
    ship.vy *= ASTEROIDS_GAME_CONFIG.shipDragPerSecond
    ship.x = wrapCoordinate(ship.x, this.state.width, ship.radius)
    ship.y = wrapCoordinate(ship.y, this.state.height, ship.radius)
  }

  private tickBullets(dt: number): void {
    this.state.bullets = tickBulletList(
      this.state.bullets,
      dt,
      this.state.width,
      this.state.height,
    )
    this.state.saucerBullets = tickBulletList(
      this.state.saucerBullets,
      dt,
      this.state.width,
      this.state.height,
    )
  }

  private tickAsteroids(dt: number): void {
    for (const asteroid of this.state.asteroids) {
      asteroid.x += asteroid.vx * dt
      asteroid.y += asteroid.vy * dt
      asteroid.angle += asteroid.angularVelocity * dt
      asteroid.x = wrapCoordinate(asteroid.x, this.state.width, asteroid.radius)
      asteroid.y = wrapCoordinate(asteroid.y, this.state.height, asteroid.radius)
    }
  }

  private tickSaucer(dt: number): void {
    if (!this.state.saucer) {
      this.state.saucerSpawnTimer -= dt
      if (this.state.saucerSpawnTimer <= 0) this.spawnSaucer()
      return
    }

    const saucer = this.state.saucer
    saucer.x += saucer.vx * dt
    saucer.y += saucer.vy * dt
    saucer.fireTimer -= dt
    if (saucer.y < saucer.radius || saucer.y > this.state.height - saucer.radius) {
      saucer.vy *= -1
    }
    if (saucer.fireTimer <= 0) {
      this.fireSaucerBullet(saucer)
      saucer.fireTimer = ASTEROIDS_GAME_CONFIG.saucerFireIntervalSeconds
    }
    if (saucer.x < -saucer.radius || saucer.x > this.state.width + saucer.radius) {
      this.state.saucer = null
      this.state.saucerSpawnTimer = ASTEROIDS_GAME_CONFIG.saucerSpawnIntervalSeconds
    }
  }

  private tryFireBullet(): void {
    const ship = this.state.ship
    if (!ship.visible || this.state.fireCooldown > 0) return
    const shot = velocityFromAngle(ship.angle, ASTEROIDS_GAME_CONFIG.bulletSpeed)
    this.state.bullets.push({
      id: this.nextId(),
      x: ship.x + Math.cos(ship.angle) * ship.radius * BULLET_SPAWN_OFFSET_FACTOR,
      y: ship.y + Math.sin(ship.angle) * ship.radius * BULLET_SPAWN_OFFSET_FACTOR,
      vx: shot.x + ship.vx,
      vy: shot.y + ship.vy,
      radius: ASTEROIDS_GAME_CONFIG.bulletRadius,
      life: ASTEROIDS_GAME_CONFIG.bulletLifetimeSeconds,
    })
    this.state.fireCooldown = ASTEROIDS_GAME_CONFIG.fireCooldownSeconds
  }

  private tryHyperspace(): void {
    if (this.state.hyperspaceCooldown > 0 || !this.state.ship.visible) return
    this.state.ship.x = this.random() * this.state.width
    this.state.ship.y = this.random() * this.state.height
    this.state.ship.vx = 0
    this.state.ship.vy = 0
    this.state.hyperspaceCooldown = ASTEROIDS_GAME_CONFIG.hyperspaceCooldownSeconds
    if (this.random() < ASTEROIDS_GAME_CONFIG.hyperspaceDeathChance) {
      this.loseShip()
    }
  }

  private tickRespawn(dt: number): void {
    this.state.ship.respawnTimer -= dt
    if (this.state.ship.respawnTimer > 0) return
    this.state.phase = 'playing'
    this.state.ship = this.createShip(this.state.width, this.state.height)
    this.clearRespawnZone()
  }

  private clearRespawnZone(): void {
    const ship = this.state.ship
    const safeRadius = ship.radius * RESPAWN_SAFE_RADIUS_FACTOR
    this.state.asteroids = this.state.asteroids.filter(
      (asteroid) =>
        !circlesOverlap(ship.x, ship.y, safeRadius, asteroid.x, asteroid.y, asteroid.radius),
    )
  }

  private resolveBulletAsteroidCollisions(): void {
    for (let bulletIndex = this.state.bullets.length - 1; bulletIndex >= 0; bulletIndex -= 1) {
      const bullet = this.state.bullets[bulletIndex]
      if (!bullet) continue
      for (
        let asteroidIndex = this.state.asteroids.length - 1;
        asteroidIndex >= 0;
        asteroidIndex -= 1
      ) {
        const asteroid = this.state.asteroids[asteroidIndex]
        if (!asteroid) continue
        if (!circlesOverlap(bullet.x, bullet.y, bullet.radius, asteroid.x, asteroid.y, asteroid.radius)) {
          continue
        }
        this.state.bullets.splice(bulletIndex, 1)
        this.state.asteroids.splice(asteroidIndex, 1)
        this.state.score += ASTEROIDS_GAME_CONFIG.asteroidScores[asteroid.size]
        this.splitAsteroid(asteroid)
        break
      }
    }
  }

  private resolveBulletSaucerCollisions(): void {
    const saucer = this.state.saucer
    if (!saucer) return
    for (let bulletIndex = this.state.bullets.length - 1; bulletIndex >= 0; bulletIndex -= 1) {
      const bullet = this.state.bullets[bulletIndex]
      if (!bullet) continue
      if (!circlesOverlap(bullet.x, bullet.y, bullet.radius, saucer.x, saucer.y, saucer.radius)) {
        continue
      }
      this.state.bullets.splice(bulletIndex, 1)
      this.state.score += ASTEROIDS_GAME_CONFIG.saucerScore[saucer.size]
      this.state.saucer = null
      this.state.saucerSpawnTimer = ASTEROIDS_GAME_CONFIG.saucerSpawnIntervalSeconds
      return
    }
  }

  private resolveSaucerBulletShipCollisions(): void {
    const ship = this.state.ship
    if (!ship.visible || ship.invulnerableTimer > 0) return
    for (const bullet of this.state.saucerBullets) {
      if (circlesOverlap(ship.x, ship.y, ship.radius, bullet.x, bullet.y, bullet.radius)) {
        this.loseShip()
        return
      }
    }
  }

  private resolveShipAsteroidCollisions(): void {
    const ship = this.state.ship
    if (!ship.visible || ship.invulnerableTimer > 0) return
    for (const asteroid of this.state.asteroids) {
      if (circlesOverlap(ship.x, ship.y, ship.radius, asteroid.x, asteroid.y, asteroid.radius)) {
        this.loseShip()
        return
      }
    }
  }

  private loseShip(): void {
    this.state.lives -= 1
    this.state.bullets = []
    this.state.saucerBullets = []
    this.state.ship.visible = false
    if (this.state.lives <= 0) {
      this.state.phase = 'gameOver'
      this.state.highScore = Math.max(this.state.highScore, this.state.score)
      this.state.message = 'GAME OVER'
      return
    }
    this.state.phase = 'respawning'
    this.state.ship.respawnTimer = ASTEROIDS_GAME_CONFIG.shipRespawnSeconds
    this.state.message = 'GET READY'
  }

  private spawnWave(): void {
    const count = Math.min(
      ASTEROIDS_GAME_CONFIG.maxAsteroidsPerWave,
      ASTEROIDS_GAME_CONFIG.initialAsteroidCount + this.state.wave - 1,
    )
    for (let i = 0; i < count; i += 1) {
      this.state.asteroids.push(this.createAsteroid('large'))
    }
    this.state.saucerSpawnTimer = ASTEROIDS_GAME_CONFIG.saucerFirstSpawnSeconds
  }

  private createAsteroid(size: AsteroidSize, x?: number, y?: number): AsteroidEntity {
    const radius = ASTEROIDS_GAME_CONFIG.asteroidRadii[size]
    const angle = this.random() * Math.PI * 2
    const speed = ASTEROIDS_GAME_CONFIG.asteroidBaseSpeed[size] * randomRange(this.random, 0.8, 1.25)
    const velocity = velocityFromAngle(angle, speed)
    const spawn = this.pickAsteroidSpawnPoint(radius)
    return {
      id: this.nextId(),
      x: x ?? spawn.x,
      y: y ?? spawn.y,
      vx: velocity.x,
      vy: velocity.y,
      radius,
      size,
      angle: this.random() * Math.PI * 2,
      angularVelocity: randomRange(this.random, -1.3, 1.3),
      vertices: buildAsteroidVertices(this.random),
    }
  }

  private pickAsteroidSpawnPoint(radius: number): { x: number; y: number } {
    const side = Math.floor(this.random() * 4)
    if (side === 0) return { x: -radius - LARGE_ASTEROID_EDGE_MARGIN, y: this.random() * this.state.height }
    if (side === 1) {
      return {
        x: this.state.width + radius + LARGE_ASTEROID_EDGE_MARGIN,
        y: this.random() * this.state.height,
      }
    }
    if (side === 2) return { x: this.random() * this.state.width, y: -radius - LARGE_ASTEROID_EDGE_MARGIN }
    return {
      x: this.random() * this.state.width,
      y: this.state.height + radius + LARGE_ASTEROID_EDGE_MARGIN,
    }
  }

  private splitAsteroid(parent: AsteroidEntity): void {
    const childSize = getChildAsteroidSize(parent.size)
    if (!childSize) return
    for (let i = 0; i < ASTEROIDS_GAME_CONFIG.splitChildCount; i += 1) {
      const child = this.createAsteroid(childSize, parent.x, parent.y)
      const direction = parent.angle + (i === 0 ? -SPLIT_ANGLE_SPREAD_RADIANS : SPLIT_ANGLE_SPREAD_RADIANS)
      const speed = ASTEROIDS_GAME_CONFIG.asteroidBaseSpeed[childSize]
      const velocity = velocityFromAngle(direction, speed)
      child.vx = velocity.x + parent.vx * 0.35
      child.vy = velocity.y + parent.vy * 0.35
      this.state.asteroids.push(child)
    }
  }

  private spawnSaucer(): void {
    const size: SaucerSize =
      this.state.wave >= ASTEROIDS_GAME_CONFIG.smallSaucerWave && this.random() < 0.5
        ? 'small'
        : 'large'
    const fromLeft = this.random() < 0.5
    const radius = ASTEROIDS_GAME_CONFIG.saucerRadius[size]
    this.state.saucer = {
      id: this.nextId(),
      x: fromLeft ? -radius : this.state.width + radius,
      y: randomRange(this.random, radius, this.state.height - radius),
      vx: (fromLeft ? 1 : -1) * ASTEROIDS_GAME_CONFIG.saucerSpeed[size],
      vy: randomSign(this.random) * SAUCER_VERTICAL_DRIFT,
      radius,
      size,
      fireTimer: ASTEROIDS_GAME_CONFIG.saucerFireIntervalSeconds,
    }
  }

  private fireSaucerBullet(saucer: SaucerEntity): void {
    const ship = this.state.ship
    const baseAngle = Math.atan2(ship.y - saucer.y, ship.x - saucer.x)
    const spread = saucer.size === 'small' ? 0.16 : 0.42
    const angle = baseAngle + randomRange(this.random, -spread, spread)
    const velocity = velocityFromAngle(angle, ASTEROIDS_GAME_CONFIG.saucerBulletSpeed)
    this.state.saucerBullets.push({
      id: this.nextId(),
      x: saucer.x,
      y: saucer.y,
      vx: velocity.x,
      vy: velocity.y,
      radius: ASTEROIDS_GAME_CONFIG.bulletRadius,
      life: ASTEROIDS_GAME_CONFIG.saucerBulletLifetimeSeconds,
    })
  }
}

/**
 * Move, wrap, and expire a list of bullets.
 *
 * @param bullets - Bullets to advance.
 * @param dt - Delta time in seconds.
 * @param width - Viewport width in pixels.
 * @param height - Viewport height in pixels.
 */
function tickBulletList(
  bullets: AsteroidsBullet[],
  dt: number,
  width: number,
  height: number,
): AsteroidsBullet[] {
  const next: AsteroidsBullet[] = []
  for (const bullet of bullets) {
    const moved = { ...bullet, life: bullet.life - dt }
    if (moved.life <= 0) continue
    moved.x += moved.vx * dt
    moved.y += moved.vy * dt
    moved.x = wrapCoordinate(moved.x, width, moved.radius)
    moved.y = wrapCoordinate(moved.y, height, moved.radius)
    next.push(moved)
  }
  return next
}

/**
 * Resolve the next split size for a destroyed asteroid.
 *
 * @param size - Parent asteroid size.
 */
function getChildAsteroidSize(size: AsteroidSize): AsteroidSize | null {
  if (size === 'large') return 'medium'
  if (size === 'medium') return 'small'
  return null
}

/**
 * Clone a full simulation state so callers cannot mutate internals.
 *
 * @param state - State to clone.
 */
function cloneState(state: AsteroidsGameState): AsteroidsGameState {
  return {
    ...state,
    ship: { ...state.ship },
    bullets: state.bullets.map((bullet) => ({ ...bullet })),
    saucerBullets: state.saucerBullets.map((bullet) => ({ ...bullet })),
    asteroids: state.asteroids.map((asteroid) => ({
      ...asteroid,
      vertices: asteroid.vertices.map((point) => ({ ...point })),
    })),
    saucer: state.saucer ? { ...state.saucer } : null,
  }
}
