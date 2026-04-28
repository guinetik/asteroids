/**
 * Bunker hatch prop — vertical metal pipe with a side entry door.
 *
 * Same model is used for both the surface hatch (player descends) and the
 * antechamber exit hatch (player extracts). Visual idle: a slow side-door
 * glow when interactable.
 *
 * @author guinetik
 * @date 2026-04-27
 * @spec docs/superpowers/specs/2026-04-27-bunker-mission-design.md
 */
import * as THREE from 'three'
import { LANDER_COLLISION_TOP_OFFSET } from '@/three/landerDimensions'
import type { WorldCollider } from '@/lib/physics/worldCollision'

/** Radius of the chunky metal pipe entrance in world units. */
export const HATCH_PIPE_RADIUS = 10
/** Pipe height as a fraction of the lander's above-ground collision height. */
const HATCH_PIPE_LANDER_HEIGHT_FRACTION = 2.5
/** Height of the pipe entrance rising from the floor. */
const HATCH_PIPE_HEIGHT = LANDER_COLLISION_TOP_OFFSET * HATCH_PIPE_LANDER_HEIGHT_FRACTION
/** How far the pipe body extends below its placement Y to survive uneven terrain. */
const HATCH_PIPE_BURIED_DEPTH = 6
/** Number of radial segments for the pipe cylinder. */
const HATCH_PIPE_SEGMENTS = 48
/** Width of the side door panel. */
const HATCH_DOOR_WIDTH = 4.6
/** Height of the side door panel. */
const HATCH_DOOR_HEIGHT = 12
/** Thickness of the side door panel. */
const HATCH_DOOR_DEPTH = 0.08
/** Gap from visible ground to the bottom of the side door panel. */
const HATCH_DOOR_GROUND_GAP = 1.5
/** Extra offset so the side door sits just outside the pipe surface. */
const HATCH_DOOR_SURFACE_OFFSET = 0.04
/** Open-state sideways slide offset for the side door. */
const HATCH_DOOR_OPEN_OFFSET = 1.8
/** Thickness of each glowing door-frame bar. */
const HATCH_FRAME_BAR_THICKNESS = 0.24
/** Depth of each glowing door-frame bar. */
const HATCH_FRAME_DEPTH = 0.12
/** Extra width beyond the door panel covered by the glowing frame. */
const HATCH_FRAME_WIDTH_PADDING = 0.55
/** Extra height beyond the door panel covered by the glowing frame. */
const HATCH_FRAME_HEIGHT_PADDING = 0.45
/** Offset that keeps the glowing frame in front of the side door. */
const HATCH_FRAME_Z_BIAS = 0.08
/** Point-light intensity at the door frame. */
const HATCH_DOOR_LIGHT_INTENSITY = 3.2
/** Point-light reach around the door frame. */
const HATCH_DOOR_LIGHT_DISTANCE = 18
/** Half-width/depth of the solid collision footprint around the pipe. */
const HATCH_COLLIDER_HALF_EXTENT = HATCH_PIPE_RADIUS
/** Brighter steel used by the pipe body. */
const HATCH_PIPE_COLOR = 0xb6bec8
/** Folder containing the hatch pipe PBR texture set. */
const HATCH_PIPE_TEXTURE_DIR = '/textures/metal'
/** Texture tiling around/across the hatch pipe. */
const HATCH_PIPE_TEXTURE_REPEAT_X = 2
/** Texture tiling vertically along the hatch pipe. */
const HATCH_PIPE_TEXTURE_REPEAT_Y = 4
/** Strength of the metal displacement map. Kept small so the cylinder silhouette stays stable. */
const HATCH_PIPE_DISPLACEMENT_SCALE = 0.08
/** Dark panel color used by the door. */
const HATCH_DOOR_COLOR = 0x121821
/** Metalness for the pipe body. */
const HATCH_PIPE_METALNESS = 0.05
/** Roughness for the pipe body. */
const HATCH_PIPE_ROUGHNESS = 0.72
/** Environment reflection multiplier for the pipe body. */
const HATCH_PIPE_ENV_MAP_INTENSITY = 0.35
/** Metalness for the side door. */
const HATCH_DOOR_METALNESS = 0.45
/** Roughness for the side door. */
const HATCH_DOOR_ROUGHNESS = 0.55
/** Door emissive intensity while idle. */
const HATCH_DOOR_IDLE_EMISSIVE = 0.08
/** Door emissive pulse center while interactable. */
const HATCH_DOOR_PULSE_BASE = 0.3
/** Door emissive pulse amplitude while interactable. */
const HATCH_DOOR_PULSE_AMPLITUDE = 0.22
/** Door pulse speed in radians per second. */
const HATCH_DOOR_PULSE_SPEED = 3
/** Tween duration for open/close in seconds. */
const TWEEN_DURATION = 0.6

/** GPU textures for the repeating steel pipe around the hatch bore. */
interface HatchPipeTextures {
  /** Surface albedo sampled with {@link HATCH_PIPE_TEXTURE_REPEAT_X/Y}. */
  map: THREE.Texture
  /** Packed normal / height style map used as `normalMap`. */
  normalMap: THREE.Texture
  /** Per-pixel roughness modulation. */
  roughnessMap: THREE.Texture
  /** Optional metalness channel (here always present for brushed metal). */
  metalnessMap: THREE.Texture
  /** Small-scale height for parallax-style displacement. */
  displacementMap: THREE.Texture
}

/**
 * Load one hatch pipe texture and configure it for repeated PBR sampling.
 *
 * @param filename - Texture file name within {@link HATCH_PIPE_TEXTURE_DIR}.
 * @param colorSpace - `SRGBColorSpace` for albedo, `NoColorSpace` for data maps.
 */
function loadHatchPipeTexture(filename: string, colorSpace: THREE.ColorSpace): THREE.Texture {
  const texture = new THREE.TextureLoader().load(`${HATCH_PIPE_TEXTURE_DIR}/${filename}`, () => {
    texture.needsUpdate = true
  })
  texture.wrapS = THREE.RepeatWrapping
  texture.wrapT = THREE.RepeatWrapping
  texture.repeat.set(HATCH_PIPE_TEXTURE_REPEAT_X, HATCH_PIPE_TEXTURE_REPEAT_Y)
  texture.colorSpace = colorSpace
  texture.anisotropy = 8
  return texture
}

/**
 * Load the metal PBR texture set used by the hatch pipe body.
 *
 * @returns PBR maps wired into {@link THREE.MeshStandardMaterial}.
 */
function loadHatchPipeTextures(): HatchPipeTextures {
  return {
    map: loadHatchPipeTexture('color.webp', THREE.SRGBColorSpace),
    normalMap: loadHatchPipeTexture('normal.webp', THREE.NoColorSpace),
    roughnessMap: loadHatchPipeTexture('roughness.webp', THREE.NoColorSpace),
    metalnessMap: loadHatchPipeTexture('metalness.webp', THREE.NoColorSpace),
    displacementMap: loadHatchPipeTexture('displacement.webp', THREE.NoColorSpace),
  }
}

/** A single bunker hatch (surface or antechamber). */
export class BunkerHatchModel {
  /** Add this group to the parent scene/group. */
  readonly group = new THREE.Group()

  private readonly body: THREE.Mesh
  private readonly door: THREE.Mesh
  private readonly frame = new THREE.Group()
  private readonly bodyMat: THREE.MeshStandardMaterial
  private readonly doorMat: THREE.MeshStandardMaterial
  private readonly frameMat: THREE.MeshBasicMaterial
  private readonly bodyTextures: THREE.Texture[]
  private targetOpen = 0
  private currentOpen = 0
  private idlePhase = 0
  /** True when the hatch should pulse (player can interact). */
  active = false

  /**
   * @param tint - Faction tint hex
   */
  constructor(tint: number) {
    const pipeTextures = loadHatchPipeTextures()
    this.bodyTextures = Object.values(pipeTextures)
    this.bodyMat = new THREE.MeshStandardMaterial({
      color: HATCH_PIPE_COLOR,
      map: pipeTextures.map,
      normalMap: pipeTextures.normalMap,
      roughnessMap: pipeTextures.roughnessMap,
      metalnessMap: pipeTextures.metalnessMap,
      displacementMap: pipeTextures.displacementMap,
      displacementScale: HATCH_PIPE_DISPLACEMENT_SCALE,
      metalness: HATCH_PIPE_METALNESS,
      roughness: HATCH_PIPE_ROUGHNESS,
      envMapIntensity: HATCH_PIPE_ENV_MAP_INTENSITY,
      side: THREE.DoubleSide,
    })
    const bodyGeo = new THREE.CylinderGeometry(
      HATCH_PIPE_RADIUS,
      HATCH_PIPE_RADIUS,
      HATCH_PIPE_HEIGHT,
      HATCH_PIPE_SEGMENTS,
      8,
      false,
    )
    this.body = new THREE.Mesh(bodyGeo, this.bodyMat)
    this.body.name = 'bunkerHatchBody'
    this.body.position.y = HATCH_PIPE_HEIGHT / 2 - HATCH_PIPE_BURIED_DEPTH
    this.group.add(this.body)

    this.frameMat = new THREE.MeshBasicMaterial({
      color: tint,
      transparent: true,
      opacity: 0.82,
    })
    this.doorMat = new THREE.MeshStandardMaterial({
      color: HATCH_DOOR_COLOR,
      emissive: tint,
      emissiveIntensity: HATCH_DOOR_IDLE_EMISSIVE,
      metalness: HATCH_DOOR_METALNESS,
      roughness: HATCH_DOOR_ROUGHNESS,
    })
    const doorGeo = new THREE.BoxGeometry(HATCH_DOOR_WIDTH, HATCH_DOOR_HEIGHT, HATCH_DOOR_DEPTH)
    this.door = new THREE.Mesh(doorGeo, this.doorMat)
    this.door.name = 'bunkerHatchDoor'
    this.door.position.set(
      0,
      HATCH_DOOR_GROUND_GAP + HATCH_DOOR_HEIGHT / 2,
      -HATCH_PIPE_RADIUS - HATCH_DOOR_SURFACE_OFFSET,
    )

    this.frame.name = 'bunkerHatchDoorFrame'
    this.frame.position.set(0, this.door.position.y, this.door.position.z - HATCH_FRAME_Z_BIAS)
    const frameWidth = HATCH_DOOR_WIDTH + HATCH_FRAME_WIDTH_PADDING
    const frameHeight = HATCH_DOOR_HEIGHT + HATCH_FRAME_HEIGHT_PADDING
    const verticalBarGeo = new THREE.BoxGeometry(
      HATCH_FRAME_BAR_THICKNESS,
      frameHeight,
      HATCH_FRAME_DEPTH,
    )
    const horizontalBarGeo = new THREE.BoxGeometry(
      frameWidth,
      HATCH_FRAME_BAR_THICKNESS,
      HATCH_FRAME_DEPTH,
    )
    const leftBar = new THREE.Mesh(verticalBarGeo, this.frameMat)
    leftBar.position.x = -frameWidth / 2
    const rightBar = new THREE.Mesh(verticalBarGeo.clone(), this.frameMat)
    rightBar.position.x = frameWidth / 2
    const topBar = new THREE.Mesh(horizontalBarGeo, this.frameMat)
    topBar.position.y = frameHeight / 2
    const bottomBar = new THREE.Mesh(horizontalBarGeo.clone(), this.frameMat)
    bottomBar.position.y = -frameHeight / 2
    this.frame.add(leftBar, rightBar, topBar, bottomBar)

    const doorLight = new THREE.PointLight(
      tint,
      HATCH_DOOR_LIGHT_INTENSITY,
      HATCH_DOOR_LIGHT_DISTANCE,
    )
    doorLight.name = 'bunkerHatchDoorLight'
    doorLight.position.set(0, this.door.position.y, this.door.position.z - 1)

    this.group.add(this.door, this.frame, doorLight)
  }

  /** Mark the hatch as open (1) or closed (0); animation follows in `tick`. */
  setOpen(open: boolean): void {
    this.targetOpen = open ? 1 : 0
  }

  /**
   * Advance the open/close tween + idle pulse.
   *
   * @param dt - Delta time in seconds
   */
  tick(dt: number): void {
    const step = dt / TWEEN_DURATION
    if (this.currentOpen < this.targetOpen) {
      this.currentOpen = Math.min(this.targetOpen, this.currentOpen + step)
    } else if (this.currentOpen > this.targetOpen) {
      this.currentOpen = Math.max(this.targetOpen, this.currentOpen - step)
    }
    const offset = HATCH_DOOR_OPEN_OFFSET * easeOut(this.currentOpen)
    this.door.position.x = offset

    this.idlePhase += dt
    const pulse = this.active
      ? HATCH_DOOR_PULSE_BASE +
        HATCH_DOOR_PULSE_AMPLITUDE * Math.sin(this.idlePhase * HATCH_DOOR_PULSE_SPEED)
      : HATCH_DOOR_IDLE_EMISSIVE
    this.doorMat.emissiveIntensity = pulse
    this.frameMat.opacity = this.active ? Math.min(1, 0.72 + pulse) : 0.62
  }

  /**
   * Build the analytic collision volume used by EVA and lander movement.
   *
   * The pipe is visually cylindrical, but the level collision system uses
   * AABBs for solid props. The footprint intentionally follows the pipe body
   * instead of the animated side door so opening the door never changes where
   * the player or lander can clip.
   *
   * @param id - Stable collider id for debug and ignore filters.
   * @returns Lazy world-space AABB collider for the hatch pipe.
   */
  createWorldCollider(id: string): WorldCollider {
    const min = new THREE.Vector3()
    const max = new THREE.Vector3()
    const localMin = new THREE.Vector3(
      -HATCH_COLLIDER_HALF_EXTENT,
      -HATCH_PIPE_BURIED_DEPTH,
      -HATCH_COLLIDER_HALF_EXTENT,
    )
    const localMax = new THREE.Vector3(
      HATCH_COLLIDER_HALF_EXTENT,
      HATCH_PIPE_HEIGHT - HATCH_PIPE_BURIED_DEPTH,
      HATCH_COLLIDER_HALF_EXTENT,
    )
    const corners = [
      new THREE.Vector3(localMin.x, localMin.y, localMin.z),
      new THREE.Vector3(localMin.x, localMin.y, localMax.z),
      new THREE.Vector3(localMin.x, localMax.y, localMin.z),
      new THREE.Vector3(localMin.x, localMax.y, localMax.z),
      new THREE.Vector3(localMax.x, localMin.y, localMin.z),
      new THREE.Vector3(localMax.x, localMin.y, localMax.z),
      new THREE.Vector3(localMax.x, localMax.y, localMin.z),
      new THREE.Vector3(localMax.x, localMax.y, localMax.z),
    ]
    const worldCorner = new THREE.Vector3()

    return {
      id,
      kind: 'aabb',
      min: () => {
        this.group.updateWorldMatrix(true, false)
        min.set(Infinity, Infinity, Infinity)
        for (const corner of corners) {
          worldCorner.copy(corner).applyMatrix4(this.group.matrixWorld)
          min.min(worldCorner)
        }
        return min
      },
      max: () => {
        this.group.updateWorldMatrix(true, false)
        max.set(-Infinity, -Infinity, -Infinity)
        for (const corner of corners) {
          worldCorner.copy(corner).applyMatrix4(this.group.matrixWorld)
          max.max(worldCorner)
        }
        return max
      },
      enabled: () => this.group.visible,
    }
  }

  /** Free GPU resources. */
  dispose(): void {
    this.body.geometry.dispose()
    this.bodyMat.dispose()
    for (const texture of this.bodyTextures) texture.dispose()
    this.door.geometry.dispose()
    this.doorMat.dispose()
    for (const child of this.frame.children) {
      if (child instanceof THREE.Mesh) child.geometry.dispose()
    }
    this.frameMat.dispose()
  }
}

/**
 * Cubic ease-out for the open animation.
 *
 * @param t - 0..1 progress
 */
function easeOut(t: number): number {
  const inv = 1 - t
  return 1 - inv * inv * inv
}
