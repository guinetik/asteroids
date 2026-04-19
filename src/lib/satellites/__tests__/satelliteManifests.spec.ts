import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import {
  getSatelliteManifest,
  hasSatelliteManifest,
  validateManifest,
} from '../satelliteManifests'

describe('satelliteManifests', () => {
  it('returns the component list for a known manifest key', () => {
    const manifest = getSatelliteManifest('satellite')
    expect(manifest).not.toBeNull()
    expect(manifest!.components.length).toBeGreaterThanOrEqual(4)
  })

  it('returns null for an unknown manifest key', () => {
    expect(getSatelliteManifest('telescope')).toBeNull()
    expect(getSatelliteManifest('relay_antenna')).toBeNull()
  })

  it('reports presence via hasSatelliteManifest', () => {
    expect(hasSatelliteManifest('satellite')).toBe(true)
    expect(hasSatelliteManifest('telescope')).toBe(false)
  })

  it('validateManifest returns missing components absent from the object tree', () => {
    const root = new THREE.Object3D()
    const present = new THREE.Object3D()
    present.name = 'satellite_antenna'
    root.add(present)
    const result = validateManifest(root, ['satellite_antenna', 'does_not_exist'])
    expect(result.ok).toBe(false)
    expect(result.missing).toEqual(['does_not_exist'])
    expect(result.found).toEqual(['satellite_antenna'])
  })

  it('validateManifest reports ok when all components are present', () => {
    const root = new THREE.Object3D()
    for (const n of ['a', 'b', 'c']) {
      const o = new THREE.Object3D()
      o.name = n
      root.add(o)
    }
    const result = validateManifest(root, ['a', 'b', 'c'])
    expect(result.ok).toBe(true)
    expect(result.missing).toEqual([])
    expect(result.found).toEqual(['a', 'b', 'c'])
  })
})
