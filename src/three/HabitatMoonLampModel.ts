/**
 * Counter-top moon lamp prop. Mounts on the habitat sideboard top opposite the
 * coffee machine + record player. Adds a small warm point light so the corner
 * stops reading as a dark dead-zone.
 *
 * @author guinetik
 * @date 2026-05-09
 * @spec docs/superpowers/specs/2026-04-06-habitat-interior-design.md
 */
import * as THREE from 'three'
import { loadGLB } from '@/three/loadGLB'

/** Asset URL for the moon lamp GLB. */
const MOON_LAMP_MODEL_URL = '/models/lamp.glb'

/** Target longest-dimension size of the moon lamp in world units. */
const MOON_LAMP_TARGET_LONGEST_DIMENSION = 0.55

/** Maximum metalness clamp for imported PBR materials. */
const MOON_LAMP_METALNESS_CLAMP = 0.2

/** Minimum roughness clamp for imported PBR materials. */
const MOON_LAMP_ROUGHNESS_CLAMP = 0.55

/**
 * Emissive intensity floor on the lamp's surface materials. The shipped GLB
 * may not flag the moon shell as emissive — we lift it so the lamp visibly
 * glows even when scene exposure is conservative.
 */
const MOON_LAMP_EMISSIVE_FLOOR = 0.85

/** CSS hex tint applied to the emissive lift, mimicking warm tungsten. */
const MOON_LAMP_EMISSIVE_TINT = 0xffd9a8

/** Warm tungsten tint for the local point light. */
const MOON_LAMP_LIGHT_COLOR = 0xffe2bd

/** Point-light intensity — strong enough to fill the back-right corner. */
const MOON_LAMP_LIGHT_INTENSITY = 5.5

/** Effective range (world units) of the lamp's point light. */
const MOON_LAMP_LIGHT_RANGE = 13

/**
 * Forward (+Z) bias in lamp-local space applied to the point light. Without
 * this the light sits centred inside the moon shell with the −Z hatch wall
 * inches away, so most of the energy lands on the wall. Pushing the light
 * forward toward the cabin centre keeps the lamp body where it is but biases
 * radiance toward the room rather than the wall behind it.
 */
const MOON_LAMP_LIGHT_FORWARD_BIAS = 0.45

/** Vertical offset of the light relative to the lamp's local Y origin. */
const MOON_LAMP_LIGHT_LOCAL_Y = 0.28

/**
 * Moon lamp model wrapper. Designed to mount on the sideboard top — the inner
 * GLB is dropped so its base sits at group-local Y=0; callers place
 * {@link group} at the sideboard's world top Y plus a small clearance.
 */
export class HabitatMoonLampModel {
  /** Public scene-graph node — host scene parents this into the cabin. */
  readonly group: THREE.Group

  /** Inner GLB scene root once loaded. */
  private inner: THREE.Group | null = null

  /** Local point light that lifts the surrounding corner. */
  private readonly light: THREE.PointLight

  /** Guards against repeated load() calls. */
  private loaded = false

  /** Build an empty wrapper. Call {@link load} before adding {@link group} to the scene. */
  constructor() {
    this.group = new THREE.Group()
    this.group.name = 'habitatMoonLamp'
    this.light = new THREE.PointLight(
      MOON_LAMP_LIGHT_COLOR,
      MOON_LAMP_LIGHT_INTENSITY,
      MOON_LAMP_LIGHT_RANGE,
    )
    this.light.position.y = MOON_LAMP_LIGHT_LOCAL_Y
    this.group.add(this.light)
  }

  /**
   * Stream the GLB, normalize materials, scale to {@link MOON_LAMP_TARGET_LONGEST_DIMENSION},
   * and drop the base to local Y=0.
   */
  async load(): Promise<void> {
    if (this.loaded) return
    this.loaded = true

    const inner = await loadGLB(MOON_LAMP_MODEL_URL)
    this.tameMaterials(inner)

    const tempBox = new THREE.Box3().setFromObject(inner)
    const size = tempBox.getSize(new THREE.Vector3())
    const longest = Math.max(size.x, size.y, size.z)
    if (longest > 0) {
      inner.scale.setScalar(MOON_LAMP_TARGET_LONGEST_DIMENSION / longest)
    }

    inner.updateMatrixWorld(true)
    const scaledBox = new THREE.Box3().setFromObject(inner)
    const centre = scaledBox.getCenter(new THREE.Vector3())
    inner.position.x -= centre.x
    inner.position.z -= centre.z
    inner.position.y -= scaledBox.min.y

    this.group.add(inner)
    this.inner = inner

    // Re-centre the light on the visual moon shell now that the inner has scaled.
    // Bias it forward in lamp-local +Z so radiance favours the cabin instead of
    // the wall the lamp's back is pressed against.
    const innerBox = new THREE.Box3().setFromObject(inner)
    const innerCentre = innerBox.getCenter(new THREE.Vector3())
    this.light.position.set(0, innerCentre.y, MOON_LAMP_LIGHT_FORWARD_BIAS)
  }

  /**
   * Recolor the lamp's local point light from a habitat theme stop. Idempotent;
   * keeps the configured intensity and range.
   *
   * @param color - CSS hex color sourced from the active habitat interior theme.
   */
  setLightColor(color: THREE.ColorRepresentation): void {
    this.light.color.set(color)
  }

  /** Release the inner GLB geometries and materials. */
  dispose(): void {
    if (!this.inner) return
    this.inner.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.geometry.dispose()
        const mats = Array.isArray(child.material) ? child.material : [child.material]
        for (const mat of mats) mat.dispose()
      }
    })
    this.group.remove(this.inner)
    this.inner = null
  }

  /**
   * Tame imported PBR materials and lift any low-contrast emissive so the moon
   * shell visibly glows under cabin lighting.
   *
   * @param root - Loaded GLB scene group.
   */
  private tameMaterials(root: THREE.Group): void {
    root.traverse((child) => {
      if (!(child instanceof THREE.Mesh) || !child.material) return
      const mats = Array.isArray(child.material) ? child.material : [child.material]
      for (const mat of mats) {
        if (mat instanceof THREE.MeshStandardMaterial) {
          mat.metalness = Math.min(mat.metalness, MOON_LAMP_METALNESS_CLAMP)
          mat.roughness = Math.max(mat.roughness, MOON_LAMP_ROUGHNESS_CLAMP)
          if (mat.emissiveIntensity < MOON_LAMP_EMISSIVE_FLOOR) {
            mat.emissive.setHex(MOON_LAMP_EMISSIVE_TINT)
            mat.emissiveIntensity = MOON_LAMP_EMISSIVE_FLOOR
          }
          mat.needsUpdate = true
        }
      }
    })
  }
}
