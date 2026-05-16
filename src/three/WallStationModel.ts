/**
 * Wall-mounted utility station prop (`oxygen` or `heal`). Loads the
 * matching optimized GLB (`/models/wall_oxygen.glb`,
 * `/models/wall_heal.glb`) — both baked with the back face at the local
 * Z=0 plane and X/Y centred, so placing the group on a wall surface at
 * the wall's vertical midline yields a flush mount with the body
 * extending into the corridor.
 *
 * Each variant gets a diegetic glow: the inner clone's PBR materials
 * are cloned per-instance and emissive-tinted with the variant accent
 * colour (cyan for O2, green for HP), and a short-range PointLight is
 * tucked inside the body so the spill reads as light bleeding out of
 * the unit. The PointLight remains mounted for the prop's lifetime and
 * is dimmed by intensity instead of `.visible`; changing light visibility
 * can force Three.js to rebuild lit shader variants during interaction.
 * The per-instance material clones let
 * {@link WallStationModel.setLightActive} dim a single prop on
 * cooldown without affecting its siblings.
 *
 * The GLB is fetched once per variant and cached at module scope.
 *
 * @author guinetik
 * @date 2026-05-15
 * @spec docs/space-station-update-gdd.md
 */
import * as THREE from 'three'
import { loadGLB } from '@/three/loadGLB'

/** Variant id selecting which wall-station GLB + accent colour to use. */
export type WallStationVariant = 'oxygen' | 'heal'

/** Public-folder asset URL per variant. */
const WALL_STATION_URL: Readonly<Record<WallStationVariant, string>> = {
  oxygen: '/models/wall_oxygen.glb',
  heal: '/models/wall_heal.glb',
}

/**
 * Target visible height in metres for each variant. The loader measures
 * the cloned subtree and applies one uniform scale so its Y span hits
 * this value — keeps both props within a sensible chunk of the 2.93 m
 * wall regardless of native authoring scale.
 */
const WALL_STATION_TARGET_HEIGHT: Readonly<Record<WallStationVariant, number>> = {
  oxygen: 0.99,
  heal: 0.65,
}

/**
 * Y-axis correction applied to the inner clone after auto-scale. Wall
 * GLBs are baked with back face at local Z=0; the heal source mesh
 * authored its hero face on a side axis, so it needs a -90° rotation to
 * orient cross-facing-out-of-the-wall. Oxygen ships correct.
 */
const WALL_STATION_INNER_YAW_OFFSET: Readonly<Record<WallStationVariant, number>> = {
  oxygen: 0,
  heal: -Math.PI / 2,
}

/** Accent colour per variant — drives both the emissive tint and the light. */
const WALL_STATION_ACCENT_COLOR: Readonly<Record<WallStationVariant, number>> = {
  oxygen: 0x00d5ff,
  heal: 0x2eff5f,
}

/**
 * Emissive intensity applied to every PBR-aware material on the cloned
 * subtree. Low enough that the model still reads as a solid object,
 * high enough that the colour comes through the diffuse texture.
 */
const EMISSIVE_TINT_INTENSITY = 0.6
/** PointLight intensity — tuned for an interior-lit prop in a dim corridor. */
const INTERIOR_LIGHT_INTENSITY = 2.4
/** Cooldown PointLight intensity. Keeps the light pooled without adding visible spill. */
const INTERIOR_LIGHT_OFF_INTENSITY = 0
/** PointLight falloff distance in metres. */
const INTERIOR_LIGHT_DISTANCE = 4.0
/** PointLight inverse-square decay coefficient. */
const INTERIOR_LIGHT_DECAY = 1.4
/**
 * Fraction of the model's depth used to position the interior PointLight
 * relative to the back wall. `0.5` puts it at the centre of the body so
 * spill is symmetric front-to-back.
 */
const INTERIOR_LIGHT_DEPTH_FRACTION = 0.5

/**
 * Sum of `emissive` RGB channels above which a material is considered
 * to already glow on its own. Used to skip materials that ship with an
 * authored emissive map (e.g. screens) so we don't paint over the
 * artist's intent.
 */
const NATIVE_EMISSIVE_RGB_THRESHOLD = 0.05

/** Per-variant lazy promise cache so multiple instances share one fetch. */
const sceneCache: Partial<Record<WallStationVariant, Promise<THREE.Group>>> = {}

/**
 * Load and cache the source GLB scene for the given wall-station variant.
 *
 * @param variant - Which wall-station GLB to fetch.
 * @returns Promise resolving to the shared parsed scene.
 */
function getWallStationScene(variant: WallStationVariant): Promise<THREE.Group> {
  let p = sceneCache[variant]
  if (!p) {
    p = loadGLB(WALL_STATION_URL[variant])
    sceneCache[variant] = p
  }
  return p
}

/** Tracks a per-instance emissive-tinted material so it can be dimmed on cooldown. */
interface TintedMaterialEntry {
  /** Cloned material so changes don't bleed into the shared GLB cache. */
  mat: THREE.MeshStandardMaterial
  /** Active emissive intensity, restored when the light comes back on. */
  baseIntensity: number
}

/**
 * One wall-mounted station prop instance. The GLB is loaded async and
 * the inner clone + interior light are added to {@link group} as soon
 * as the fetch resolves.
 */
export class WallStationModel {
  /** Public scene-graph node — host parents this onto the corridor group. */
  readonly group: THREE.Group

  private inner: THREE.Group | null = null
  private interiorLight: THREE.PointLight | null = null
  private tintedMaterials: TintedMaterialEntry[] = []
  private lightActive = true
  private loadStarted = false
  private loaded = false

  /**
   * @param variant - Which wall-station variant to spawn.
   */
  constructor(public readonly variant: WallStationVariant) {
    this.group = new THREE.Group()
    this.group.name = `wallStation/${variant}`
    void this.load()
  }

  /**
   * Stream the matching GLB, deep-clone its scene, uniform-scale to the
   * variant's target height, clone + tint the inner materials, and
   * attach the interior PointLight. Idempotent.
   */
  async load(): Promise<void> {
    if (this.loadStarted) return
    this.loadStarted = true

    const scene = await getWallStationScene(this.variant)
    const clone = scene.clone(true)
    clone.updateMatrixWorld(true)

    const bbox = new THREE.Box3().setFromObject(clone)
    if (!bbox.isEmpty()) {
      const size = bbox.getSize(new THREE.Vector3())
      const target = WALL_STATION_TARGET_HEIGHT[this.variant]
      if (size.y > 0) {
        const fit = target / size.y
        clone.scale.multiplyScalar(fit)
      }
    }
    clone.rotation.y += WALL_STATION_INNER_YAW_OFFSET[this.variant]
    clone.updateMatrixWorld(true)
    // Re-snap pivot after scale + variant yaw: back face flush at Z=0
    // (body extends into +Z toward the corridor), X/Y centred at origin.
    const finalBbox = new THREE.Box3().setFromObject(clone)
    if (!finalBbox.isEmpty()) {
      clone.position.x -= (finalBbox.min.x + finalBbox.max.x) * 0.5
      clone.position.y -= (finalBbox.min.y + finalBbox.max.y) * 0.5
      clone.position.z -= finalBbox.min.z
    }

    // Clone every material so emissive can be toggled per-instance, then
    // tint the eligible ones with the variant accent colour.
    this.cloneAndTintMaterials(clone)

    this.group.add(clone)
    this.inner = clone
    // Apply any setLightActive that landed before the GLB resolved.
    if (!this.lightActive) this.applyEmissiveIntensity(0)

    const placedBbox = new THREE.Box3().setFromObject(clone)
    const placedSize = placedBbox.isEmpty()
      ? new THREE.Vector3(0, 0, 0)
      : placedBbox.getSize(new THREE.Vector3())
    const depth = Math.max(0.01, placedSize.z)
    const color = WALL_STATION_ACCENT_COLOR[this.variant]
    const light = new THREE.PointLight(
      color,
      this.lightActive ? INTERIOR_LIGHT_INTENSITY : INTERIOR_LIGHT_OFF_INTENSITY,
      INTERIOR_LIGHT_DISTANCE,
      INTERIOR_LIGHT_DECAY,
    )
    light.position.set(0, 0, depth * INTERIOR_LIGHT_DEPTH_FRACTION)
    light.visible = true
    this.group.add(light)
    this.interiorLight = light

    this.loaded = true
  }

  /**
   * Toggle the prop's emissive glow + interior PointLight intensity as a single
   * unit. Used by the host view to dim the prop while it's on cooldown
   * (just refilled the player) and re-enable it when the timer elapses.
   * The PointLight object stays visible/mounted so Three's active light
   * list remains stable during interaction.
   *
   * @param active - True to power the prop on, false to dim it dark.
   */
  setLightActive(active: boolean): void {
    if (this.lightActive === active) return
    this.lightActive = active
    if (this.interiorLight) {
      this.interiorLight.intensity = active
        ? INTERIOR_LIGHT_INTENSITY
        : INTERIOR_LIGHT_OFF_INTENSITY
    }
    this.applyEmissiveIntensity(active ? null : 0)
  }

  /** Whether the GLB has finished loading and the clone is mounted. */
  isLoaded(): boolean {
    return this.loaded
  }

  /**
   * Detach the inner clone, dispose every per-instance cloned material,
   * and remove the PointLight. Geometries inside the shared GLB cache
   * are NOT disposed — the cache lives for the app's lifetime.
   */
  dispose(): void {
    if (this.inner) {
      this.group.remove(this.inner)
      this.inner = null
    }
    if (this.interiorLight) {
      this.group.remove(this.interiorLight)
      this.interiorLight = null
    }
    for (const entry of this.tintedMaterials) entry.mat.dispose()
    this.tintedMaterials = []
  }

  /**
   * Walk every mesh under {@link root}, clone its materials so they're
   * owned by this instance, and stamp the accent tint onto any slot
   * whose native emissive is below {@link NATIVE_EMISSIVE_RGB_THRESHOLD}.
   *
   * @param root - Cloned subtree to mutate.
   */
  private cloneAndTintMaterials(root: THREE.Object3D): void {
    const tint = new THREE.Color(WALL_STATION_ACCENT_COLOR[this.variant])
    root.traverse((obj) => {
      if (!(obj instanceof THREE.Mesh)) return
      if (Array.isArray(obj.material)) {
        const cloned: THREE.Material[] = []
        for (const m of obj.material) cloned.push(this.cloneOne(m, tint))
        obj.material = cloned
      } else if (obj.material) {
        obj.material = this.cloneOne(obj.material, tint)
      }
    })
  }

  /**
   * Clone a single source material and, when it has a near-black native
   * emissive, replace that emissive with the variant tint at the
   * configured intensity. Records the tinted clone so the cooldown
   * toggle can dim it later.
   *
   * @param source - Source material from the shared GLB.
   * @param tint - Accent colour to apply when eligible.
   * @returns Per-instance cloned material (already mounted by caller).
   */
  private cloneOne(source: THREE.Material, tint: THREE.Color): THREE.Material {
    const cloned = source.clone() as THREE.MeshStandardMaterial
    if (!cloned.emissive) return cloned
    const e = cloned.emissive
    const native = Math.abs(e.r) + Math.abs(e.g) + Math.abs(e.b)
    if (native > NATIVE_EMISSIVE_RGB_THRESHOLD) return cloned
    cloned.emissive = tint.clone()
    cloned.emissiveIntensity = EMISSIVE_TINT_INTENSITY
    cloned.needsUpdate = true
    this.tintedMaterials.push({ mat: cloned, baseIntensity: EMISSIVE_TINT_INTENSITY })
    return cloned
  }

  /**
   * Force every tinted material's `emissiveIntensity` to a value. Pass
   * `null` to restore each one to its `baseIntensity`.
   *
   * @param value - Override intensity, or `null` to restore the base.
   */
  private applyEmissiveIntensity(value: number | null): void {
    for (const entry of this.tintedMaterials) {
      entry.mat.emissiveIntensity = value ?? entry.baseIntensity
    }
  }
}
