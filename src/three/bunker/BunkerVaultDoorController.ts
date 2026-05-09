/**
 * Circular bank vault-style door.
 *
 * A large circular metallic door with a central spinning wheel handle.
 * When opened, the wheel spins first, then the door swings open on a hinge.
 *
 * @author guinetik
 * @date 2026-04-28
 * @spec docs/superpowers/specs/2026-04-27-bunker-mission-design.md
 */
import * as THREE from 'three'
import { useAudio } from '@/audio/useAudio'
import { applyBunkerMeshStandardSpecularSoften } from '@/three/bunker/bunkerMeshStandardSpecularSoften'
import { ANTECHAMBER, ARENA, CORRIDOR, WALL_THICKNESS } from './BunkerWallBuilder'

/** Base metalness for packed `/textures/metal` on the vault — kept low; map scales up. */
const VAULT_METALNESS = 0.06
/** Uniform roughness before map; mixed with shader soften for mirror-like texels. */
const VAULT_ROUGHNESS = 0.82
/** Tone down IBL on interior metal slabs. */
const VAULT_ENV_MAP_INTENSITY = 0.2
/** Post–roughness-map mix toward diffuse (vault faces helmet light directly). */
const VAULT_SHADER_ROUGH_MIX = 0.38
/** Scale metal channel after sampling (vault wheel/frame share the material). */
const VAULT_SHADER_METAL_SCALE = 0.62

/** Total width of the door frame to cover the corridor gap. */
const FRAME_WIDTH = CORRIDOR.width + WALL_THICKNESS * 2
/** Total height of the door frame. */
const FRAME_HEIGHT = Math.max(ANTECHAMBER.height, ARENA.height)
/** Thickness of the frame and door. */
const DOOR_THICKNESS = 0.6
/** Radius of the circular vault door. */
const VAULT_RADIUS = 6.0
/** Radius of the wheel handle. */
const WHEEL_RADIUS = 2.0
/** Time to spin the wheel (seconds). */
const SPIN_DURATION = 1.0
/** Time to swing the door open (seconds). */
const SWING_DURATION = 1.5

/**
 * Controller for the circular bank vault-style entrance door.
 */
export class BunkerVaultDoorController {
  readonly group = new THREE.Group()

  private readonly frameMesh: THREE.Mesh
  private readonly doorGroup = new THREE.Group()
  private readonly doorMesh: THREE.Mesh
  private readonly wheelGroup = new THREE.Group()
  private readonly mat: THREE.MeshStandardMaterial

  private targetOpen = false
  private phaseTime = 0

  constructor(tint: number) {
    const texLoader = new THREE.TextureLoader()
    const colorMap = texLoader.load('/textures/metal/color.webp', (t) => {
      t.needsUpdate = true
    })
    const normalMap = texLoader.load('/textures/metal/normal.webp', (t) => {
      t.needsUpdate = true
    })
    const roughnessMap = texLoader.load('/textures/metal/roughness.webp', (t) => {
      t.needsUpdate = true
    })
    const metalnessMap = texLoader.load('/textures/metal/metalness.webp', (t) => {
      t.needsUpdate = true
    })

    const setupTex = (t: THREE.Texture) => {
      t.wrapS = THREE.RepeatWrapping
      t.wrapT = THREE.RepeatWrapping
      t.repeat.set(2, 2)
    }

    setupTex(colorMap)
    colorMap.colorSpace = THREE.SRGBColorSpace
    setupTex(normalMap)
    setupTex(roughnessMap)
    setupTex(metalnessMap)

    this.mat = new THREE.MeshStandardMaterial({
      color: 0xb6bec8,
      emissive: tint,
      emissiveIntensity: 0.02,
      map: colorMap,
      normalMap: normalMap,
      roughnessMap: roughnessMap,
      metalnessMap: metalnessMap,
      metalness: VAULT_METALNESS,
      roughness: VAULT_ROUGHNESS,
      envMapIntensity: VAULT_ENV_MAP_INTENSITY,
    })
    applyBunkerMeshStandardSpecularSoften(this.mat, {
      roughnessMixTowardMatte: VAULT_SHADER_ROUGH_MIX,
      metalnessResponseScale: VAULT_SHADER_METAL_SCALE,
    })

    // 1. Build the frame (a square with a circular hole)
    const shape = new THREE.Shape()
    shape.moveTo(-FRAME_WIDTH / 2, 0)
    shape.lineTo(FRAME_WIDTH / 2, 0)
    shape.lineTo(FRAME_WIDTH / 2, FRAME_HEIGHT)
    shape.lineTo(-FRAME_WIDTH / 2, FRAME_HEIGHT)
    shape.lineTo(-FRAME_WIDTH / 2, 0)

    const holePath = new THREE.Path()
    holePath.absarc(0, FRAME_HEIGHT / 2, VAULT_RADIUS, 0, Math.PI * 2, false)
    shape.holes.push(holePath)

    const extrudeSettings = {
      depth: DOOR_THICKNESS,
      bevelEnabled: true,
      bevelSegments: 2,
      steps: 1,
      bevelSize: 0.1,
      bevelThickness: 0.1,
    }

    const frameGeo = new THREE.ExtrudeGeometry(shape, extrudeSettings)
    frameGeo.center() // Center geometry
    this.frameMesh = new THREE.Mesh(frameGeo, this.mat)
    this.frameMesh.position.y = FRAME_HEIGHT / 2
    this.group.add(this.frameMesh)

    // 2. Build the door (cylinder)
    const doorGeo = new THREE.CylinderGeometry(
      VAULT_RADIUS - 0.1,
      VAULT_RADIUS - 0.1,
      DOOR_THICKNESS - 0.1,
      64,
    )
    doorGeo.rotateX(Math.PI / 2) // Orient to face z-axis
    this.doorMesh = new THREE.Mesh(doorGeo, this.mat)

    // Position the door inside the door group so the group can act as a hinge
    this.doorMesh.position.set(VAULT_RADIUS, 0, 0)

    // Wheel handle
    const wheelGeo = new THREE.TorusGeometry(WHEEL_RADIUS, 0.2, 16, 32)
    const spokeGeo = new THREE.CylinderGeometry(0.1, 0.1, WHEEL_RADIUS * 2, 8)
    const wheelMat = this.mat.clone()
    wheelMat.color.setHex(0x555555) // Darker metal for the wheel

    const wheelRing = new THREE.Mesh(wheelGeo, wheelMat)
    const spoke1 = new THREE.Mesh(spokeGeo, wheelMat)
    const spoke2 = new THREE.Mesh(spokeGeo, wheelMat)
    const spoke3 = new THREE.Mesh(spokeGeo, wheelMat)
    const spoke4 = new THREE.Mesh(spokeGeo, wheelMat)

    spoke2.rotation.z = Math.PI / 4
    spoke3.rotation.z = Math.PI / 2
    spoke4.rotation.z = Math.PI * 0.75

    this.wheelGroup.add(wheelRing, spoke1, spoke2, spoke3, spoke4)
    this.wheelGroup.position.set(VAULT_RADIUS, 0, DOOR_THICKNESS / 2 + 0.2) // On the front of the door

    this.doorGroup.add(this.doorMesh, this.wheelGroup)

    // Hinge is on the left side of the door opening
    this.doorGroup.position.set(-VAULT_RADIUS, FRAME_HEIGHT / 2, 0)

    this.group.add(this.doorGroup)
  }

  setOpen(open: boolean): void {
    if (this.targetOpen !== open) {
      if (open && !this.targetOpen) {
        useAudio().play('sfx.hatch.open')
      }
      this.targetOpen = open
      this.phaseTime = 0
    }
  }

  tick(dt: number): void {
    if (this.targetOpen) {
      if (this.phaseTime < SPIN_DURATION + SWING_DURATION) {
        this.phaseTime += dt

        if (this.phaseTime <= SPIN_DURATION) {
          // Phase 1: Spin the wheel
          const progress = easeInOut(this.phaseTime / SPIN_DURATION)
          this.wheelGroup.rotation.z = progress * Math.PI * 2 // Full spin
        } else {
          // Phase 2: Swing open
          this.wheelGroup.rotation.z = Math.PI * 2
          const progress = easeInOut((this.phaseTime - SPIN_DURATION) / SWING_DURATION)
          this.doorGroup.rotation.y = -progress * Math.PI * 0.6 // Swing inwards/outwards 108 degrees
        }
      }
    } else {
      if (this.phaseTime < SPIN_DURATION + SWING_DURATION) {
        this.phaseTime += dt

        if (this.phaseTime <= SWING_DURATION) {
          // Phase 1 (closing): Swing shut
          const progress = 1 - easeInOut(this.phaseTime / SWING_DURATION)
          this.doorGroup.rotation.y = -progress * Math.PI * 0.6
        } else {
          // Phase 2 (closing): Spin wheel to lock
          this.doorGroup.rotation.y = 0
          const progress = 1 - easeInOut((this.phaseTime - SWING_DURATION) / SPIN_DURATION)
          this.wheelGroup.rotation.z = progress * Math.PI * 2
        }
      }
    }
  }

  dispose(): void {
    this.frameMesh.geometry.dispose()
    this.doorMesh.geometry.dispose()
    this.mat.dispose()
    this.wheelGroup.children.forEach((c) => {
      if (c instanceof THREE.Mesh) c.geometry.dispose()
    })
  }
}

/**
 * Ease in-out timing function.
 * @param t - Progress from 0 to 1
 */
function easeInOut(t: number): number {
  return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t
}
