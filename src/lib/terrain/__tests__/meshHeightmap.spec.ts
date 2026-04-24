import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import { bakeHeightmapFromMesh, OFF_SURFACE_HEIGHT } from '../meshHeightmap'

function buildFlatPlaneMesh(size: number, elevation: number): THREE.Mesh {
  const geo = new THREE.PlaneGeometry(size, size, 1, 1)
  geo.rotateX(-Math.PI / 2) // face +Y
  geo.translate(0, elevation, 0)
  return new THREE.Mesh(geo)
}

/** Build a small disc (radius `r`) at `elevation`, centred at origin, facing +Y. */
function buildDiscMesh(radius: number, elevation: number): THREE.Mesh {
  const geo = new THREE.CircleGeometry(radius, 64)
  geo.rotateX(-Math.PI / 2)
  geo.translate(0, elevation, 0)
  return new THREE.Mesh(geo)
}

describe('bakeHeightmapFromMesh', () => {
  it('records hit heights at every grid cell when the mesh covers the world', () => {
    const mesh = buildFlatPlaneMesh(100, 5)
    const hm = bakeHeightmapFromMesh(mesh, {
      resolution: 16,
      worldSize: 100,
      rayStartAltitude: 50,
    })
    // Every cell should be valid and at height 5
    for (let gz = 0; gz < 16; gz++) {
      for (let gx = 0; gx < 16; gx++) {
        expect(hm.isValid(gx, gz)).toBe(true)
        expect(hm.get(gx, gz)).toBeCloseTo(5, 3)
      }
    }
  })

  it('marks off-mesh cells invalid and writes the sentinel height', () => {
    // Disc radius 20 at elevation 0 inside a world of size 100 — corners miss the disc.
    const mesh = buildDiscMesh(20, 0)
    const hm = bakeHeightmapFromMesh(mesh, {
      resolution: 16,
      worldSize: 100,
      rayStartAltitude: 50,
    })
    // Centre cell should be valid
    expect(hm.isValidAt(0, 0)).toBe(true)
    // Corner should be off-surface
    expect(hm.isValidAt(-48, -48)).toBe(false)
    expect(hm.heightAt(-48, -48)).toBeLessThanOrEqual(OFF_SURFACE_HEIGHT)
  })

  it('is deterministic (pure function of mesh + options)', () => {
    const mesh = buildFlatPlaneMesh(100, 3)
    const a = bakeHeightmapFromMesh(mesh, { resolution: 8, worldSize: 100, rayStartAltitude: 50 })
    const b = bakeHeightmapFromMesh(mesh, { resolution: 8, worldSize: 100, rayStartAltitude: 50 })
    expect(Array.from(a.grid)).toEqual(Array.from(b.grid))
    expect(Array.from(a.validity)).toEqual(Array.from(b.validity))
  })
})
