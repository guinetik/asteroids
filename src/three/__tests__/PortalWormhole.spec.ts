import { describe, it, expect, vi } from 'vitest'
import { PortalWormhole } from '../PortalWormhole'
import * as THREE from 'three'

/**
 * Minimal SpaceTimeGrid stub — only the addSource interface matters.
 * The real grid deforms vertices; we just verify the source gets registered.
 */
function createMockGrid() {
  const sources: { x: number; z: number; mass: number }[] = []
  return {
    addSource(s: { x: number; z: number; mass: number }) {
      sources.push(s)
    },
    getDepthAt(_x: number, _z: number) {
      return 0
    },
    sources,
  }
}

describe('PortalWormhole', () => {
  it('starts in idle state', () => {
    const grid = createMockGrid()
    const wormhole = new PortalWormhole(new THREE.Vector3(100, 0, 50), grid)
    expect(wormhole.state).toBe('idle')
    expect(wormhole.isDone).toBe(false)
  })

  it('registers a negative-mass source on the grid', () => {
    const grid = createMockGrid()
    const pos = new THREE.Vector3(100, 0, 50)
    new PortalWormhole(pos, grid)
    expect(grid.sources).toHaveLength(1)

    const src = grid.sources[0]!
    expect(src.mass).toBeLessThan(0)
    expect(src.x).toBe(100)
    expect(src.z).toBe(50)
  })

  it('transitions idle → summoning → ejecting → collapsing → done', () => {
    const grid = createMockGrid()
    const wormhole = new PortalWormhole(new THREE.Vector3(0, 0, 0), grid)

    wormhole.eject()
    expect(wormhole.state).toBe('summoning')

    // Tick through summoning (0.5s)
    wormhole.tick(0.55)
    expect(wormhole.state).toBe('ejecting')

    // Tick through the pulse duration (0.3s)
    wormhole.tick(0.35)
    expect(wormhole.state).toBe('collapsing')

    // Tick through collapse duration (3s)
    wormhole.tick(3.1)
    expect(wormhole.state).toBe('done')
    expect(wormhole.isDone).toBe(true)
  })

  it('fires onEject callback when summoning ends', () => {
    const grid = createMockGrid()
    const wormhole = new PortalWormhole(new THREE.Vector3(0, 0, 0), grid)
    const onEject = vi.fn()
    wormhole.onEject = onEject

    wormhole.eject()
    expect(onEject).not.toHaveBeenCalled()

    wormhole.tick(0.55) // summoning done
    expect(onEject).toHaveBeenCalledOnce()
  })

  it('lerps grid source mass to zero during collapse', () => {
    const grid = createMockGrid()
    const wormhole = new PortalWormhole(new THREE.Vector3(0, 0, 0), grid)

    const initialMass = grid.sources[0]!.mass

    wormhole.eject()
    wormhole.tick(0.55) // summoning done
    wormhole.tick(0.35) // pulse done → collapsing

    // Halfway through collapse
    wormhole.tick(1.5)

    const midMass = grid.sources[0]!.mass
    expect(Math.abs(midMass)).toBeLessThan(Math.abs(initialMass))
    expect(Math.abs(midMass)).toBeGreaterThan(0)

    // Finish collapse
    wormhole.tick(1.6)

    expect(grid.sources[0]!.mass).toBe(0)
  })

  it('calls onDone callback when collapse finishes', () => {
    const grid = createMockGrid()
    const wormhole = new PortalWormhole(new THREE.Vector3(0, 0, 0), grid)
    const onDone = vi.fn()
    wormhole.onDone = onDone

    wormhole.eject()
    wormhole.tick(0.55) // summoning
    wormhole.tick(0.35) // pulse done
    wormhole.tick(3.1) // collapse done
    expect(onDone).toHaveBeenCalledOnce()
  })

  it('does not tick past done state', () => {
    const grid = createMockGrid()
    const wormhole = new PortalWormhole(new THREE.Vector3(0, 0, 0), grid)
    const onDone = vi.fn()
    wormhole.onDone = onDone

    wormhole.eject()
    wormhole.tick(0.55) // summoning
    wormhole.tick(0.35) // pulse
    wormhole.tick(3.1) // done
    wormhole.tick(1.0) // extra tick — should not fire onDone again
    expect(onDone).toHaveBeenCalledOnce()
  })
})
