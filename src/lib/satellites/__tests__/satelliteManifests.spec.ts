import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import { getSatelliteManifest, hasSatelliteManifest, validateManifest } from '../satelliteManifests'

describe('satelliteManifests', () => {
  it('returns the component list for a known manifest key', () => {
    const manifest = getSatelliteManifest('satellite')
    expect(manifest).not.toBeNull()
    expect(manifest!.components.length).toBeGreaterThanOrEqual(4)
  })

  it('returns null for an unknown manifest key', () => {
    expect(getSatelliteManifest('not_a_real_poi_type')).toBeNull()
  })

  it('returns component lists for every pooled servicing variant', () => {
    expect(getSatelliteManifest('satellite')).not.toBeNull()
    expect(getSatelliteManifest('relay_antenna')).not.toBeNull()
    expect(getSatelliteManifest('telescope')).not.toBeNull()
  })

  it('reports presence via hasSatelliteManifest', () => {
    expect(hasSatelliteManifest('satellite')).toBe(true)
    expect(hasSatelliteManifest('relay_antenna')).toBe(true)
    expect(hasSatelliteManifest('telescope')).toBe(true)
    expect(hasSatelliteManifest('not_a_real_poi_type')).toBe(false)
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
    const manifest = getSatelliteManifest('satellite')
    expect(manifest).not.toBeNull()
    const root = new THREE.Object3D()
    for (const n of manifest!.components) {
      const o = new THREE.Object3D()
      o.name = n
      root.add(o)
    }
    const result = validateManifest(root, manifest!.components)
    expect(result.ok).toBe(true)
    expect(result.missing).toEqual([])
    expect(result.found).toEqual([...manifest!.components])
  })
})
