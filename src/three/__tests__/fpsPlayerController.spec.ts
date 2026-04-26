import { describe, it, expect } from 'vitest'
import { FpsPlayerController } from '../FpsPlayerController'
import type { FpsPlayerConfig } from '../FpsPlayerController'
import { Heightmap } from '@/lib/terrain/heightmap'
import { InputManager } from '@/lib/InputManager'
import { FPS_BINDINGS } from '@/lib/defaultBindings'
import { FpsCamera } from '../FpsCamera'
import playerConfigJson from '@/data/fps/player-config.json'
import {
  CollisionWorld,
  type CharacterMoveResult,
  type SupportSurfaceResult,
} from '@/lib/physics/worldCollision'

// Build a flat heightmap at y=0
function flatHeightmap(): Heightmap {
  const resolution = 8
  const worldSize = 200
  return new Heightmap(resolution, worldSize)
}

function createController(): {
  ctrl: FpsPlayerController
  input: InputManager
  cam: FpsCamera
} {
  const input = new InputManager(FPS_BINDINGS)
  const cam = new FpsCamera(playerConfigJson.camera)
  const hm = flatHeightmap()
  const ctrl = new FpsPlayerController(input, cam, playerConfigJson as FpsPlayerConfig, hm)
  cam.setTarget(ctrl.group)
  return { ctrl, input, cam }
}

class ScriptedCollisionWorld extends CollisionWorld {
  supportHeight = 0

  override moveCharacterXZ(
    current: { x: number; y: number; z: number },
    deltaX: number,
    deltaZ: number,
    _bodyBottomY: number,
    _bodyTopY: number,
    _config: Parameters<CollisionWorld['moveCharacterXZ']>[5],
  ): CharacterMoveResult {
    return {
      x: current.x + deltaX,
      z: current.z + deltaZ,
      blocked: false,
      touchedCollider: false,
      groundHeight: this.supportHeight,
      groundNormal: { x: 0, y: 1, z: 0 },
      groundAngleRad: 0,
      groundWalkable: true,
    }
  }

  override getHighestSupportUnderDisc(
    _x: number,
    _z: number,
    _minY: number,
    _maxY: number,
    _radius: number,
    _ignoreColliderId?: string,
  ): SupportSurfaceResult {
    return {
      height: this.supportHeight,
      normal: { x: 0, y: 1, z: 0 },
      colliderId: null,
    }
  }
}

function createControllerWithCollisionWorld(world: CollisionWorld): {
  ctrl: FpsPlayerController
  input: InputManager
  cam: FpsCamera
} {
  const input = new InputManager(FPS_BINDINGS)
  const cam = new FpsCamera(playerConfigJson.camera)
  const hm = flatHeightmap()
  const ctrl = new FpsPlayerController(input, cam, playerConfigJson as FpsPlayerConfig, hm, world)
  cam.setTarget(ctrl.group)
  return { ctrl, input, cam }
}

function pressKey(code: string): void {
  window.dispatchEvent(new KeyboardEvent('keydown', { code }))
}

function releaseKey(code: string): void {
  window.dispatchEvent(new KeyboardEvent('keyup', { code }))
}

describe('FpsPlayerController', () => {
  it('spawns at given position', () => {
    const { ctrl } = createController()
    ctrl.group.position.set(0, 10, 0)
    expect(ctrl.group.position.y).toBe(10)
  })

  it('falls under gravity when above ground', () => {
    const { ctrl } = createController()
    ctrl.group.position.y = 10
    ctrl.tick(0.1)
    expect(ctrl.group.position.y).toBeLessThan(10)
  })

  it('lands on terrain and becomes grounded', () => {
    const { ctrl } = createController()
    ctrl.group.position.y = 0.01
    ctrl.tick(0.1)
    expect(ctrl.grounded).toBe(true)
    expect(ctrl.group.position.y).toBe(0)
  })

  it('jump impulse launches player upward when grounded', () => {
    const { ctrl } = createController()
    ctrl.group.position.y = 0
    ctrl.tick(0.016) // settle to ground
    ctrl.jump()
    ctrl.tick(0.016)
    expect(ctrl.group.position.y).toBeGreaterThan(0)
    expect(ctrl.grounded).toBe(false)
  })

  it('cannot double-jump', () => {
    const { ctrl } = createController()
    ctrl.group.position.y = 0
    ctrl.tick(0.016) // settle
    ctrl.jump()
    ctrl.tick(0.016) // now airborne
    ctrl.jump() // should do nothing
    ctrl.tick(0.016)
    // Should still be falling/rising normally, not boosted
    expect(ctrl.grounded).toBe(false)
  })

  it('o2 drains over time even when idle', () => {
    const { ctrl } = createController()
    const before = ctrl.o2Level
    ctrl.tick(1.0)
    expect(ctrl.o2Level).toBeLessThan(before)
  })

  it('hypoxia drains HP when o2 is empty', () => {
    const { ctrl } = createController()
    const initialHp = ctrl.hp
    // Drain all O2
    for (let i = 0; i < 500; i++) ctrl.tick(1.0)
    expect(ctrl.o2Level).toBe(0)
    expect(ctrl.hp).toBeLessThan(initialHp)
  })

  it('death fires when HP reaches zero from hypoxia', () => {
    const { ctrl } = createController()
    let died = false
    ctrl.onDeath = () => {
      died = true
    }
    // Drain O2 then keep ticking until HP hits 0
    for (let i = 0; i < 1000; i++) ctrl.tick(1.0)
    expect(ctrl.hp).toBe(0)
    expect(ctrl.isDead).toBe(true)
    expect(died).toBe(true)
  })

  it('holding jump in mid-air hovers and consumes extra o2', () => {
    const { ctrl, input } = createController()
    ctrl.group.position.y = 0
    ctrl.tick(0.016)
    ctrl.jump()

    pressKey('Space')
    input.tick(0.016)
    const beforeY = ctrl.group.position.y
    const beforeO2 = ctrl.o2Level
    ctrl.tick(0.25)
    releaseKey('Space')
    input.tick(0.016)

    expect(ctrl.group.position.y).toBeGreaterThan(beforeY)
    expect(ctrl.o2Level).toBeLessThan(beforeO2 - playerConfigJson.o2.baseDrainRate * 0.25)
  })

  it('ground friction decelerates lateral velocity', () => {
    const { ctrl } = createController()
    ctrl.group.position.y = 0
    ctrl.tick(0.016) // ground
    // Use impulse below maxSpeed (8) so speed clamp doesn't interfere
    ctrl.applyLateralImpulse(5, 0)
    const speed1 = ctrl.speed
    ctrl.tick(0.1) // friction should slow it
    expect(ctrl.speed).toBeLessThan(speed1)
  })

  it('air friction is weaker than ground friction', () => {
    const { ctrl } = createController()

    // Ground test: apply impulse below maxSpeed, measure deceleration
    ctrl.group.position.y = 0
    ctrl.tick(0.016)
    ctrl.applyLateralImpulse(5, 0)
    const groundSpeedBefore = ctrl.speed
    ctrl.tick(0.1)
    const groundDecel = groundSpeedBefore - ctrl.speed

    // Reset: airborne test
    const { ctrl: ctrl2 } = createController()
    ctrl2.group.position.y = 50
    ctrl2.tick(0.001) // tiny dt so barely falls
    ctrl2.applyLateralImpulse(5, 0)
    const airSpeedBefore = ctrl2.speed
    ctrl2.tick(0.1)
    const airDecel = airSpeedBefore - ctrl2.speed

    expect(airDecel).toBeLessThan(groundDecel)
  })

  it('keeps boots-grounded over a tiny support dip while moving', () => {
    const world = new ScriptedCollisionWorld()
    const { ctrl, input } = createControllerWithCollisionWorld(world)

    ctrl.group.position.y = 0
    ctrl.tick(0.016)
    world.supportHeight = -0.1

    pressKey('KeyW')
    input.tick(0.016)
    ctrl.tick(0.016)
    releaseKey('KeyW')
    input.tick(0.016)

    expect(ctrl.grounded).toBe(true)
    expect(ctrl.speed).toBe(playerConfigJson.movement.maxSpeed)
  })

  it('keeps sprint engaged across a tiny support dip while moving', () => {
    const world = new ScriptedCollisionWorld()
    const { ctrl, input } = createControllerWithCollisionWorld(world)

    ctrl.group.position.y = 0
    ctrl.tick(0.016)
    world.supportHeight = -0.1

    pressKey('KeyW')
    pressKey('ShiftLeft')
    input.tick(0.016)
    ctrl.tick(0.016)
    releaseKey('KeyW')
    releaseKey('ShiftLeft')
    input.tick(0.016)

    expect(ctrl.grounded).toBe(true)
    expect(ctrl.isSprinting).toBe(true)
    expect(ctrl.speed).toBe(playerConfigJson.movement.maxSprintSpeed)
  })

  it('jump exits boots-grounded immediately', () => {
    const world = new ScriptedCollisionWorld()
    const { ctrl, input } = createControllerWithCollisionWorld(world)

    ctrl.group.position.y = 0
    ctrl.tick(0.016)

    pressKey('KeyW')
    pressKey('Space')
    input.tick(0.016)
    ctrl.tick(0.016)
    releaseKey('KeyW')
    releaseKey('Space')
    input.tick(0.016)

    expect(ctrl.grounded).toBe(false)
    expect(ctrl.physicsGrounded).toBe(false)
    expect(ctrl.group.position.y).toBeGreaterThan(0)
  })

  it('drops out of boots-grounded when walking off a real ledge', () => {
    const world = new ScriptedCollisionWorld()
    const { ctrl, input } = createControllerWithCollisionWorld(world)

    ctrl.group.position.y = 0
    ctrl.tick(0.016)
    world.supportHeight = -1

    pressKey('KeyW')
    input.tick(0.016)
    ctrl.tick(0.016)
    releaseKey('KeyW')
    input.tick(0.016)

    expect(ctrl.grounded).toBe(false)
    expect(ctrl.physicsGrounded).toBe(false)
  })

  it('uses airborne steering rules after leaving support', () => {
    const world = new ScriptedCollisionWorld()
    const { ctrl, input } = createControllerWithCollisionWorld(world)

    world.supportHeight = -10
    ctrl.group.position.y = 5

    pressKey('KeyW')
    input.tick(0.016)
    ctrl.tick(0.1)
    releaseKey('KeyW')
    input.tick(0.016)

    expect(ctrl.grounded).toBe(false)
    expect(ctrl.speed).toBeLessThan(playerConfigJson.movement.maxSpeed)
  })

  it('lets knockback break boots-grounded over a tiny support dip', () => {
    const world = new ScriptedCollisionWorld()
    const { ctrl, input } = createControllerWithCollisionWorld(world)

    ctrl.group.position.y = 0
    ctrl.tick(0.016)
    world.supportHeight = -0.1
    ctrl.applyLateralImpulse(4, 0)

    pressKey('KeyW')
    input.tick(0.016)
    ctrl.tick(0.016)
    releaseKey('KeyW')
    input.tick(0.016)

    expect(ctrl.grounded).toBe(false)
    expect(ctrl.physicsGrounded).toBe(false)
  })
})
