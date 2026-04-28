/**
 * Unit tests for {@link BunkerDoorController}.
 *
 * @author guinetik
 * @date 2026-04-27
 * @spec docs/superpowers/specs/2026-04-27-bunker-mission-design.md
 */
import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { BunkerDoorController } from '../BunkerDoorController'
import { ARENA, CORRIDOR, WALL_THICKNESS } from '../BunkerWallBuilder'

const TINT = 0x66ccff
const OPEN_TICK_SECONDS = 1

describe('BunkerDoorController', () => {
  it('covers the full corridor opening while closed', () => {
    const door = new BunkerDoorController(TINT)
    const box = new THREE.Box3().setFromObject(door.group)

    expect(box.max.x - box.min.x).toBeGreaterThanOrEqual(CORRIDOR.width + WALL_THICKNESS * 2)
    expect(box.max.y - box.min.y).toBeGreaterThanOrEqual(ARENA.height)
  })

  it('slides fully above the doorway when opened', () => {
    const door = new BunkerDoorController(TINT)
    door.setOpen(true)
    door.tick(OPEN_TICK_SECONDS)

    const box = new THREE.Box3().setFromObject(door.group)
    expect(box.min.y).toBeGreaterThan(ARENA.height)
  })
})
