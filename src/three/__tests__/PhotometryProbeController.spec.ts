import { describe, expect, it, vi } from 'vitest'
import * as THREE from 'three'
import { PhotometryProbeController } from '@/three/PhotometryProbeController'
import { WAYPOINT_SURFACE_BEAM_HEIGHT } from '@/three/WaypointMarkers'

describe('PhotometryProbeController', () => {
  it('hovers just above the terminal before climbing', () => {
    const scene = new THREE.Scene()
    const controller = new PhotometryProbeController(scene)
    controller.spawn({
      terminalPosition: new THREE.Vector3(0, 10, 0),
      targetPosition: new THREE.Vector3(100, 80, 0),
      launchApexY: 220,
    })

    controller.tick(0.5)

    const probe = scene.children.find((child) => child instanceof THREE.Group) as THREE.Group
    expect(probe.position.y).toBeCloseTo(18)
    expect(controller.isArrived).toBe(false)
    controller.dispose()
  })

  it('reveals the waypoint after the probe reaches the side standoff', () => {
    const scene = new THREE.Scene()
    const controller = new PhotometryProbeController(scene)
    const targetPosition = new THREE.Vector3(100, 80, 0)
    controller.spawn({
      terminalPosition: new THREE.Vector3(0, 10, 0),
      targetPosition,
      launchApexY: 220,
    })

    expect(controller.hasWaypoint).toBe(false)

    controller.tick(6)

    expect(controller.hasWaypoint).toBe(false)
    expect(controller.isArrived).toBe(false)

    controller.tick(8)

    expect(controller.hasWaypoint).toBe(true)
    expect(controller.isArrived).toBe(true)
    expect(scene.getObjectByName('photometry-probe-waypoint')?.position.y).toBeCloseTo(
      targetPosition.y + WAYPOINT_SURFACE_BEAM_HEIGHT * 0.1,
    )
    controller.dispose()
  })

  it('collects the arrived probe once from lander range', () => {
    const scene = new THREE.Scene()
    const controller = new PhotometryProbeController(scene)
    const onCollect = vi.fn()
    const targetPosition = new THREE.Vector3(100, 80, 0)
    controller.onCollect = onCollect
    controller.spawn({
      terminalPosition: new THREE.Vector3(0, 10, 0),
      targetPosition,
      launchApexY: 220,
    })
    controller.tick(14)

    controller.checkCollection(targetPosition.clone())
    controller.checkCollection(targetPosition.clone())

    expect(controller.collected).toBe(1)
    expect(onCollect).toHaveBeenCalledTimes(1)
    expect(controller.hasWaypoint).toBe(true)
    controller.dispose()
  })

  it('renders the scan target, core beam, glow halo, and muzzle as lock-colored meshes', () => {
    const scene = new THREE.Scene()
    const controller = new PhotometryProbeController(scene)
    const targetPosition = new THREE.Vector3(100, 80, 0)

    controller.showScanTarget(targetPosition)
    controller.updateScanBeam(new THREE.Vector3(0, 80, 0), new THREE.Vector3(1, 0, 0))

    const targetMarker = scene.getObjectByName('photometry-scan-target') as THREE.Mesh
    const beam = scene.getObjectByName('photometry-los-beam') as THREE.Mesh
    const beamGlow = scene.getObjectByName('photometry-los-beam-glow') as THREE.Mesh
    const muzzle = scene.getObjectByName('photometry-los-muzzle') as THREE.Mesh
    const beamGeometry = beam.geometry as THREE.CylinderGeometry
    const glowGeometry = beamGlow.geometry as THREE.CylinderGeometry
    const targetGeometry = targetMarker.geometry as THREE.SphereGeometry
    const targetMaterial = targetMarker.material as THREE.MeshBasicMaterial
    const beamMaterial = beam.material as THREE.MeshBasicMaterial
    const glowMaterial = beamGlow.material as THREE.MeshBasicMaterial
    const muzzleMaterial = muzzle.material as THREE.MeshBasicMaterial

    expect(targetMaterial.color.r).toBeGreaterThan(targetMaterial.color.b)
    expect(beamMaterial.color.r).toBeGreaterThan(beamMaterial.color.b)
    expect(beamMaterial.transparent).toBe(true)
    expect(beamMaterial.opacity).toBeGreaterThan(0.6)
    expect(glowMaterial.opacity).toBeLessThan(beamMaterial.opacity)
    expect(beam.scale.y).toBeCloseTo(2600)
    expect(beamGlow.scale.y).toBeCloseTo(2600)
    expect(beamGeometry.parameters.radiusTop).toBeLessThan(0.3)
    expect(glowGeometry.parameters.radiusTop).toBeGreaterThan(beamGeometry.parameters.radiusTop)
    expect(targetGeometry.parameters.radius).toBeGreaterThan(10)
    expect(muzzle.position.x).toBeCloseTo(0)
    expect(muzzle.position.y).toBeCloseTo(80)

    controller.setScanLocked(true)
    expect(targetMaterial.color.g).toBeGreaterThan(targetMaterial.color.r)
    expect(beamMaterial.color.g).toBeGreaterThan(beamMaterial.color.r)
    expect(glowMaterial.color.g).toBeGreaterThan(glowMaterial.color.r)
    expect(muzzleMaterial.color.g).toBeGreaterThan(muzzleMaterial.color.r)

    controller.setScanLocked(false)
    expect(targetMaterial.color.r).toBeGreaterThan(targetMaterial.color.g)
    expect(beamMaterial.color.r).toBeGreaterThan(beamMaterial.color.g)
    expect(glowMaterial.color.r).toBeGreaterThan(glowMaterial.color.g)

    controller.hideScanVisuals()
    expect(scene.getObjectByName('photometry-scan-target')).toBeUndefined()
    expect(scene.getObjectByName('photometry-los-beam')).toBeUndefined()
    expect(scene.getObjectByName('photometry-los-beam-glow')).toBeUndefined()
    expect(scene.getObjectByName('photometry-los-muzzle')).toBeUndefined()
    controller.dispose()
  })

  it('restores shared asteroid wireframe materials after the scan flash expires', () => {
    const scene = new THREE.Scene()
    const asteroidRoot = new THREE.Group()
    const material = new THREE.MeshStandardMaterial({ color: 0x443322, wireframe: false })
    asteroidRoot.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), material))
    asteroidRoot.add(new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2), material))
    const controller = new PhotometryProbeController(scene, asteroidRoot)
    const originalColor = material.color.clone()

    controller.triggerAsteroidFlash()
    expect(material.wireframe).toBe(true)
    expect(material.color.g).toBeGreaterThan(material.color.r)
    expect(material.color.b).toBeGreaterThan(material.color.r)

    controller.tick(4.9)

    expect(material.wireframe).toBe(true)

    controller.tick(0.2)

    expect(material.wireframe).toBe(false)
    expect(material.color).toEqual(originalColor)
    controller.dispose()
  })
})
