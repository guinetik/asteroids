/**
 * Unit tests for the {@link DanMinigame} state machine.
 *
 * Focuses on the pure phase machine + reward arithmetic. Visual aspects of
 * the scan controller are exercised indirectly (we run with a real Three.js
 * scene under JSDOM) but the assertions are state-machine-level.
 *
 * @author guinetik
 * @date 2026-04-28
 * @spec docs/superpowers/specs/2026-04-27-dan-mission-design.md
 */
import { describe, expect, it, vi } from 'vitest'
import * as THREE from 'three'
import { Heightmap } from '@/lib/terrain/heightmap'
import type { MiniGameContext } from '@/lib/minigame/MiniGame'
import type { ConcreteObjective } from '@/lib/missions/types'
import type { DanCraterPlacement } from '@/lib/level/danCraterPlacement'
import { ProjectileSystem } from '@/lib/fps/projectileSystem'
import { DanMinigame, DAN_MIN_QUALITY_FOR_COMPLETION } from '@/lib/minigame/DanMinigame'

const HEIGHTMAP = new Heightmap(3, 200)

function makeObjective(overrides: Partial<ConcreteObjective> = {}): ConcreteObjective {
  return {
    type: 'dan',
    x: 0,
    z: 0,
    scanDurationSeconds: 10,
    requiredParticleHits: 50,
    enemyGraceSeconds: 4,
    particleTier: 'medium',
    enemyTier: 'medium',
    reward: 6000,
    rewardMin: 1500,
    ...overrides,
  }
}

/**
 * Minimal `EnemyControllerPool` stand-in. Tests never let the minigame reach
 * the viroid-spawn path (none of the existing specs runs a scan long enough
 * for that), so a stub that returns `null` from acquire is sufficient and
 * keeps the unit test free of Three.js controller wiring.
 */
function makeEnemyControllerPoolStub(): import('@/three/EnemyControllerPool').EnemyControllerPool {
  return {
    acquirePhage: () => null,
    releasePhage: () => undefined,
  } as unknown as import('@/three/EnemyControllerPool').EnemyControllerPool
}

function makePlacement(): DanCraterPlacement {
  return {
    rotation: { x: 0, y: 0, z: 0 },
    crater: { x: 0, z: 0, radius: 60, depth: 12 },
    source: 'natural',
  }
}

function context(overrides: Partial<MiniGameContext> = {}): MiniGameContext {
  return {
    levelState: 'eva',
    // Lander parked at the crater center by default (the LevelViewController
    // overrides ship spawn to the crater origin for DAN missions). Tests
    // override to null when verifying the lander-proximity gate.
    landerPosition: { x: 0, y: 0, z: 0 },
    landerGrounded: true,
    playerPosition: null,
    interactPressed: false,
    terminalInteractPressed: false,
    ...overrides,
  }
}

interface SetupResult {
  minigame: DanMinigame
  objective: ConcreteObjective
  scene: THREE.Scene
  projectileSystem: ProjectileSystem
}

function setup(overrides: Partial<ConcreteObjective> = {}): SetupResult {
  const scene = new THREE.Scene()
  const objective = makeObjective(overrides)
  const projectileSystem = new ProjectileSystem(scene, HEIGHTMAP)
  const minigame = new DanMinigame({
    objectiveIndex: 0,
    objective,
    scene,
    heightmap: HEIGHTMAP,
    craterPlacement: makePlacement(),
    projectileSystem,
    seed: 42,
    enemyControllerPool: makeEnemyControllerPoolStub(),
  })
  return { minigame, objective, scene, projectileSystem }
}

/**
 * Approach the terminal in EVA. The DAN terminal is offset +14 along X from
 * the crater center, so a player at the same X is comfortably in range.
 */
function nearTerminal(): { x: number; y: number; z: number } {
  return { x: 14, y: 0, z: 0 }
}

describe('DanMinigame', () => {
  describe('start()', () => {
    it('moves from idle to active and refuels on terminal interact', () => {
      const { minigame } = setup()
      const onRefuel = vi.fn()
      const onRegister = vi.fn()
      minigame.onRefuel = onRefuel
      minigame.onRegisterTickable = onRegister

      minigame.tick(0, context({ playerPosition: nearTerminal(), terminalInteractPressed: true }))

      expect(minigame.status).toBe('active')
      expect(minigame.phase).toBe('scanning')
      expect(onRefuel).toHaveBeenCalledTimes(1)
      expect(onRegister).toHaveBeenCalledTimes(1)
      expect(minigame.timeRemaining).toBeGreaterThan(0)
      expect(minigame.progressCurrent).toBe(0)
      expect(minigame.progressTotal).toBe(50)
      minigame.dispose()
    })

    it('refuses to start when the lander is parked far from the terminal', () => {
      const { minigame } = setup()
      const onRefuel = vi.fn()
      const onPrompt = vi.fn()
      minigame.onRefuel = onRefuel
      minigame.onPrompt = onPrompt

      // Lander stranded ~80 units from the terminal at (14, 0, 0).
      minigame.tick(
        0,
        context({
          playerPosition: nearTerminal(),
          landerPosition: { x: 100, y: 0, z: 0 },
          terminalInteractPressed: true,
        }),
      )

      expect(minigame.status).toBe('idle')
      expect(onRefuel).not.toHaveBeenCalled()
      expect(onPrompt).toHaveBeenCalledWith('PARK LANDER NEAR DAN TERMINAL')
      minigame.dispose()
    })

    it('refuses to start when no lander telemetry is available (fail closed)', () => {
      const { minigame } = setup()
      const onRefuel = vi.fn()
      minigame.onRefuel = onRefuel

      minigame.tick(
        0,
        context({
          playerPosition: nearTerminal(),
          landerPosition: null,
          terminalInteractPressed: true,
        }),
      )

      expect(minigame.status).toBe('idle')
      expect(onRefuel).not.toHaveBeenCalled()
      minigame.dispose()
    })

    it('is a no-op while already scanning', () => {
      const { minigame } = setup()
      const onRegister = vi.fn()
      minigame.onRegisterTickable = onRegister

      minigame.tick(0, context({ playerPosition: nearTerminal(), terminalInteractPressed: true }))
      expect(onRegister).toHaveBeenCalledTimes(1)

      // Keep pressing E — start() should refuse to re-init while scanning.
      minigame.tick(0, context({ playerPosition: nearTerminal(), terminalInteractPressed: true }))
      expect(onRegister).toHaveBeenCalledTimes(1)
      minigame.dispose()
    })
  })

  describe('tick → awaiting-delivery', () => {
    it('transitions when the timer reaches zero (not failure)', () => {
      const { minigame } = setup({ scanDurationSeconds: 2 })
      minigame.tick(0, context({ playerPosition: nearTerminal(), terminalInteractPressed: true }))
      expect(minigame.phase).toBe('scanning')

      // Move out to lander to keep ticking from neutral state.
      minigame.tick(2.1, context({ levelState: 'lander', landerPosition: { x: 0, y: 0, z: 0 } }))

      expect(minigame.phase).toBe('awaiting-delivery')
      expect(minigame.status).toBe('active')
      // Window closed — timer reads 0 (HUD stays mounted with deliver prompt).
      expect(minigame.timeRemaining).toBe(0)
      expect(minigame.failure).toBeNull()
      minigame.dispose()
    })
  })

  describe('recordParticleHit', () => {
    it('increments hit counter while scanning', () => {
      const { minigame } = setup()
      minigame.tick(0, context({ playerPosition: nearTerminal(), terminalInteractPressed: true }))

      minigame.recordParticleHit()
      minigame.recordParticleHit()
      minigame.recordParticleHit()

      expect(minigame.progressCurrent).toBe(3)
      minigame.dispose()
    })

    it('is a no-op outside the scanning phase', () => {
      const { minigame } = setup({ scanDurationSeconds: 1 })
      minigame.tick(0, context({ playerPosition: nearTerminal(), terminalInteractPressed: true }))

      // Push past the timer into awaiting-delivery.
      minigame.tick(1.5, context({ levelState: 'lander', landerPosition: { x: 0, y: 0, z: 0 } }))
      expect(minigame.phase).toBe('awaiting-delivery')
      const before = minigame.progressCurrent

      minigame.recordParticleHit()
      expect(minigame.progressCurrent).toBe(before)
      minigame.dispose()
    })

    it('does not auto-complete when the meter caps — window runs full duration', () => {
      const { minigame } = setup({ requiredParticleHits: 3, scanDurationSeconds: 5 })
      minigame.tick(0, context({ playerPosition: nearTerminal(), terminalInteractPressed: true }))

      minigame.recordParticleHit()
      minigame.recordParticleHit()
      minigame.recordParticleHit()
      minigame.recordParticleHit() // capped above required

      // Phase should remain `scanning` — timer is the only path out.
      expect(minigame.phase).toBe('scanning')
      expect(minigame.status).toBe('active')
      minigame.dispose()
    })
  })

  describe('deliver()', () => {
    it('completes with interpolated actualReward at mid-quality', () => {
      const { minigame, objective } = setup({
        scanDurationSeconds: 1,
        requiredParticleHits: 50,
        reward: 6000,
        rewardMin: 1500,
      })
      const onComplete = vi.fn()
      minigame.onComplete = onComplete

      minigame.tick(0, context({ playerPosition: nearTerminal(), terminalInteractPressed: true }))
      // Capture exactly half the required hits.
      for (let i = 0; i < 25; i++) minigame.recordParticleHit()
      // Run timer out.
      minigame.tick(1.5, context({ levelState: 'lander', landerPosition: { x: 0, y: 0, z: 0 } }))
      expect(minigame.phase).toBe('awaiting-delivery')

      // Walk back to terminal and deliver.
      minigame.tick(0, context({ playerPosition: nearTerminal(), terminalInteractPressed: true }))

      expect(minigame.status).toBe('completed')
      expect(onComplete).toHaveBeenCalledWith(0)
      // quality = 0.5 → actualReward = 1500 + (6000-1500)*0.5 = 3750
      expect(objective.actualReward).toBe(3750)
      minigame.dispose()
    })

    it('pays full template reward when capture caps the meter', () => {
      const { minigame, objective } = setup({
        scanDurationSeconds: 1,
        requiredParticleHits: 10,
        reward: 8000,
        rewardMin: 2000,
      })
      minigame.tick(0, context({ playerPosition: nearTerminal(), terminalInteractPressed: true }))
      for (let i = 0; i < 10; i++) minigame.recordParticleHit()
      minigame.tick(1.5, context({ levelState: 'lander', landerPosition: { x: 0, y: 0, z: 0 } }))
      minigame.tick(0, context({ playerPosition: nearTerminal(), terminalInteractPressed: true }))

      expect(objective.actualReward).toBe(8000)
      minigame.dispose()
    })

    it('fails with no-data-captured below the quality floor and pays nothing', () => {
      const { minigame, objective } = setup({
        scanDurationSeconds: 1,
        requiredParticleHits: 100,
      })
      minigame.tick(0, context({ playerPosition: nearTerminal(), terminalInteractPressed: true }))
      // Capture only 1/100 = 1% — below the 5% floor.
      minigame.recordParticleHit()
      minigame.tick(1.5, context({ levelState: 'lander', landerPosition: { x: 0, y: 0, z: 0 } }))
      minigame.tick(0, context({ playerPosition: nearTerminal(), terminalInteractPressed: true }))

      expect(minigame.status).toBe('failed')
      expect(minigame.failure).toBe('no-data-captured')
      expect(objective.actualReward).toBe(0)
      minigame.dispose()
    })

    it('treats the exact quality threshold as success (closed lower bound)', () => {
      const required = 100
      const hits = Math.ceil(required * DAN_MIN_QUALITY_FOR_COMPLETION) // exact threshold
      const { minigame, objective } = setup({
        scanDurationSeconds: 1,
        requiredParticleHits: required,
      })
      minigame.tick(0, context({ playerPosition: nearTerminal(), terminalInteractPressed: true }))
      for (let i = 0; i < hits; i++) minigame.recordParticleHit()
      minigame.tick(1.5, context({ levelState: 'lander', landerPosition: { x: 0, y: 0, z: 0 } }))
      minigame.tick(0, context({ playerPosition: nearTerminal(), terminalInteractPressed: true }))

      expect(minigame.status).toBe('completed')
      expect(objective.actualReward).toBeGreaterThan(0)
      minigame.dispose()
    })

    it('is a no-op outside awaiting-delivery', () => {
      const { minigame, objective } = setup()
      minigame.deliver() // from idle
      expect(minigame.status).toBe('idle')
      expect(objective.actualReward).toBeUndefined()

      minigame.tick(0, context({ playerPosition: nearTerminal(), terminalInteractPressed: true }))
      minigame.deliver() // from scanning
      expect(minigame.status).toBe('active')
      expect(objective.actualReward).toBeUndefined()
      minigame.dispose()
    })
  })

  describe('failure routing', () => {
    it('fails with lander-destroyed from scanning phase', () => {
      const { minigame, objective } = setup()
      minigame.tick(0, context({ playerPosition: nearTerminal(), terminalInteractPressed: true }))

      minigame.notifyLanderDestroyed()

      expect(minigame.status).toBe('failed')
      expect(minigame.failure).toBe('lander-destroyed')
      expect(objective.actualReward).toBe(0)
      minigame.dispose()
    })

    it('fails with player-died from awaiting-delivery phase', () => {
      const { minigame, objective } = setup({ scanDurationSeconds: 1 })
      minigame.tick(0, context({ playerPosition: nearTerminal(), terminalInteractPressed: true }))
      minigame.tick(1.5, context({ levelState: 'lander', landerPosition: { x: 0, y: 0, z: 0 } }))
      expect(minigame.phase).toBe('awaiting-delivery')

      minigame.notifyPlayerDied()

      expect(minigame.status).toBe('failed')
      expect(minigame.failure).toBe('player-died')
      expect(objective.actualReward).toBe(0)
      minigame.dispose()
    })

    it('preserves the first failure reason', () => {
      const { minigame } = setup()
      minigame.tick(0, context({ playerPosition: nearTerminal(), terminalInteractPressed: true }))

      minigame.notifyLanderDestroyed()
      minigame.notifyPlayerDied()

      expect(minigame.failure).toBe('lander-destroyed')
      minigame.dispose()
    })

    it('ignores notifications outside scanning/awaiting-delivery', () => {
      const { minigame } = setup()
      minigame.notifyLanderDestroyed() // idle
      minigame.notifyPlayerDied() // idle
      expect(minigame.status).toBe('idle')
      expect(minigame.failure).toBeNull()
      minigame.dispose()
    })
  })

  describe('viroid pressure gate', () => {
    it('exposes shouldSpawnEnemies only after grace expires while scanning', () => {
      const { minigame } = setup({ enemyGraceSeconds: 2, scanDurationSeconds: 10 })
      expect(minigame.shouldSpawnEnemies).toBe(false)

      minigame.tick(0, context({ playerPosition: nearTerminal(), terminalInteractPressed: true }))
      expect(minigame.shouldSpawnEnemies).toBe(false)
      expect(minigame.enemyGraceRemaining).toBeGreaterThan(0)

      minigame.tick(2.1, context({ levelState: 'lander', landerPosition: { x: 0, y: 0, z: 0 } }))
      expect(minigame.shouldSpawnEnemies).toBe(true)
      expect(minigame.enemyGraceRemaining).toBe(0)

      // After window closes, viroid rolls stop even though grace is past.
      minigame.tick(10, context({ levelState: 'lander', landerPosition: { x: 0, y: 0, z: 0 } }))
      expect(minigame.phase).toBe('awaiting-delivery')
      expect(minigame.shouldSpawnEnemies).toBe(false)
      minigame.dispose()
    })
  })

  describe('retry from terminal', () => {
    it('restarts the scan after a no-data-captured failure', () => {
      const { minigame } = setup({ scanDurationSeconds: 1, requiredParticleHits: 100 })
      minigame.tick(0, context({ playerPosition: nearTerminal(), terminalInteractPressed: true }))
      minigame.tick(1.5, context({ levelState: 'lander', landerPosition: { x: 0, y: 0, z: 0 } }))
      minigame.tick(0, context({ playerPosition: nearTerminal(), terminalInteractPressed: true }))
      expect(minigame.status).toBe('failed')

      // Press E again — should restart.
      minigame.tick(0, context({ playerPosition: nearTerminal(), terminalInteractPressed: true }))
      expect(minigame.status).toBe('active')
      expect(minigame.phase).toBe('scanning')
      expect(minigame.failure).toBeNull()
      minigame.dispose()
    })
  })
})
