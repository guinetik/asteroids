/**
 * Runtime lander paint channel mapping for the Pimp My Shuttle cosmetic shop.
 *
 * Mirrors the shuttle "v2" pipeline (replace mode + finish profile + Fresnel
 * rim → bloom + base glow). Factory Stock keeps the legacy tint-mode behavior
 * so the baseline lander stays subtle; paid paints override the authored albedo
 * fully, push saturation, and apply per-paint PBR finish + silhouette glow.
 *
 * @author guinetik
 * @date 2026-04-30
 * @spec docs/superpowers/specs/2026-05-02-pimp-my-shuttle-paint-ramp.md
 */

import { findCosmeticOptionById } from '@/lib/cosmetics/catalog'
import { getPlayerCosmetics } from '@/lib/cosmetics/profileCosmetics'
import type {
  CosmeticFinishChannel,
  CosmeticFinishProfile,
  CosmeticRim,
} from '@/lib/cosmetics/types'
import type { PlayerProfile } from '@/lib/player/types'
import * as THREE from 'three'
import {
  applyPaintRampShader,
  buildPaintRampTexture,
  computeMeshToVehicleLocal,
  computePaintRampBounds,
  setPaintRampRim,
  setPaintRampStrength,
  updatePaintRampTexture,
  type PaintRampBounds,
} from './paintRampShader'

/** Lander paint channel inferred from GLB mesh names. */
export type LanderPaintChannel = 'primary' | 'secondary' | 'trim' | 'engine'

/**
 * Authored PBR snapshot captured at clone time. Restored by Factory Stock.
 */
export interface LanderStockPbr {
  /** Authored `metalness` after `tuneLanderMaterials`; `null` if material has no `metalness`. */
  readonly metalness: number | null
  /** Authored `roughness`; `null` if material has no `roughness`. */
  readonly roughness: number | null
  /** Authored `envMapIntensity`; `null` if material has no `envMapIntensity`. */
  readonly envMapIntensity: number | null
  /** Authored `emissive` color (cloned); `null` if material has no `emissive`. */
  readonly emissive: THREE.Color | null
  /** Authored `emissiveIntensity`; `null` if material has none. */
  readonly emissiveIntensity: number | null
}

/**
 * A cloned material and its original color, bound to one lander paint channel.
 */
export interface LanderPaintMaterialTarget {
  /** Material instance assigned to a visible lander mesh. */
  readonly material: THREE.Material
  /** Color captured before any cosmetic paint mix was applied. Used by Factory Stock. */
  readonly baseColor: THREE.Color
  /** Shader channel selected from the source mesh/object name. */
  readonly channel: LanderPaintChannel
  /** Mesh geometry — used to compute ramp axis bounds at first apply. */
  readonly geometry: THREE.BufferGeometry
  /** Mesh-local → vehicle-local transform captured at collection time for ramp sampling. */
  readonly meshToVehicleLocal: THREE.Matrix4
  /** Authored PBR snapshot. Restored by {@link restoreLanderStockPaintMaterials}. */
  readonly stockPbr: LanderStockPbr
}

/** Tint-mode color mix strength used by Factory Stock (legacy LERP path). */
const LANDER_PAINT_COLOR_STRENGTH_TINT = 0.86
/** Replace-mode color strength for paid paints. `1.0` = full chroma. */
const LANDER_PAINT_COLOR_STRENGTH_REPLACE = 1.0
/**
 * Saturation push (additive HSL S) applied to per-channel paint colors in
 * REPLACE mode. Compensates for paint colors going through ACES tonemapping
 * which otherwise mutes them.
 */
const LANDER_PAINT_SATURATION_BOOST = 0.12
/** Catalog id of the bundled "Factory Stock" lander paint row (legacy tint path). */
const LANDER_FACTORY_STOCK_OPTION_ID = 'lander-paintjob-factory-stock'

/** Lander gradient ramp flows top→bottom along the model's Y axis. */
const LANDER_PAINT_RAMP_AXIS = 'y' as const
/** Tint-mode ramp tint strength (Factory Stock). */
const LANDER_PAINT_RAMP_STRENGTH_TINT = 0.22
/** Replace-mode ramp tint strength (paid paints). Slightly stronger so the
 * top→bottom gradient still reads after the per-channel colors fully replace
 * the authored albedo. */
const LANDER_PAINT_RAMP_STRENGTH_REPLACE = 0.3
/**
 * Self-illumination strength used in REPLACE mode. Adds `paintColor * this`
 * to `totalEmissiveRadiance` so the lander stays readable on the dark side
 * of a planet (no scene light). Tuned slightly under the shuttle value because
 * the lander is much smaller — too much glow turns it into a lantern.
 */
const LANDER_PAINT_BASE_GLOW_REPLACE = 0.15
/** Default rim Fresnel exponent when a paint omits `rim.power`. */
const LANDER_PAINT_RIM_DEFAULT_POWER = 2.2
/**
 * Default finish merged into every paid paint when the catalog row leaves
 * `finish` blank or only specifies some channels. Aluminum-panel baseline.
 */
const LANDER_PAINT_FINISH_FALLBACK: Required<
  Pick<CosmeticFinishChannel, 'metalness' | 'roughness' | 'envMapIntensity'>
> = {
  metalness: 0.45,
  roughness: 0.5,
  envMapIntensity: 1.1,
}

/** Ramp bounds depend only on the mesh hierarchy, so cache per target list. */
const landerRampBoundsCache = new WeakMap<
  ReadonlyArray<LanderPaintMaterialTarget>,
  PaintRampBounds
>()

/**
 * Match the authoring names from `public/models/lander.glb`, tolerating
 * underscore-normalized node names from the runtime loader.
 *
 * @param objectName - Mesh or node name from the loaded GLB.
 */
export function getLanderPaintChannelForObjectName(objectName: string): LanderPaintChannel | null {
  const normalized = objectName.replace(/_/g, ' ').replace(/\s+/g, ' ').toLowerCase()

  if (
    normalized.startsWith('top section lunar lander') ||
    normalized.startsWith('bottom section lunar lander') ||
    normalized.startsWith('door lunar lander')
  ) {
    return 'primary'
  }

  if (
    normalized.startsWith('landing legs lunar lander') ||
    normalized.startsWith('ladder lunar lander') ||
    normalized.startsWith('extras lunar lander') ||
    normalized === 'rcs scaffolding'
  ) {
    return 'secondary'
  }

  if (
    normalized.startsWith('antennas lunar lander') ||
    normalized.startsWith('antennas side lunar lander') ||
    normalized === 'antenna front'
  ) {
    return 'trim'
  }

  // Main thruster bell + 16 RCS quad clusters (`rcs bl aft`, `rcs fr up`, …).
  // The scaffolding sits earlier in the secondary branch so it doesn't get
  // captured by the looser `rcs ` prefix below.
  if (
    normalized.startsWith('thruster lunar lander') ||
    normalized.startsWith('thrusters lunar lander') ||
    normalized.startsWith('rcs ')
  ) {
    return 'engine'
  }

  return null
}

/**
 * Clone each paintable material on a lander scene and collect paint targets.
 *
 * @param root - Loaded lander scene or subtree.
 */
export function cloneAndCollectLanderPaintMaterials(
  root: THREE.Object3D,
): LanderPaintMaterialTarget[] {
  root.updateMatrixWorld(true)
  const targets: LanderPaintMaterialTarget[] = []
  root.traverse((child) => {
    if (!(child instanceof THREE.Mesh) || !child.material) return
    const channel = getLanderPaintChannelForObjectName(child.name)
    if (!channel) return

    if (Array.isArray(child.material)) {
      child.material = child.material.map((material) =>
        cloneAndCollectLanderPaintMaterial(material, child, root, channel, targets),
      )
      return
    }

    child.material = cloneAndCollectLanderPaintMaterial(
      child.material,
      child,
      root,
      channel,
      targets,
    )
  })
  return targets
}

/**
 * Record one already-cloned material as a lander paint target.
 *
 * @param material - Material instance assigned to the mesh.
 * @param mesh - Mesh that owns the material (used to capture transform + geometry).
 * @param vehicleRoot - Loaded lander scene root used as the ramp reference frame.
 * @param channel - Paint channel selected from the mesh name.
 * @param targets - Mutable target list owned by the caller.
 */
export function collectLanderPaintMaterial(
  material: THREE.Material,
  mesh: THREE.Mesh,
  vehicleRoot: THREE.Object3D,
  channel: LanderPaintChannel,
  targets: LanderPaintMaterialTarget[],
): void {
  const baseColor = getMaterialColor(material)
  if (!baseColor) return
  targets.push({
    material,
    baseColor: baseColor.clone(),
    channel,
    geometry: mesh.geometry,
    meshToVehicleLocal: computeMeshToVehicleLocal(mesh, vehicleRoot),
    stockPbr: captureLanderStockPbr(material),
  })
}

/**
 * Apply a lander paint catalog option directly to prepared material targets.
 *
 * Factory Stock keeps the legacy tint-mode path (LERP authored color → catalog
 * stop) so the bundled lander stays subtle. Paid paints use replace mode:
 * full color override, saturation boost, finish profile, rim glow, base glow.
 *
 * @param targets - Prepared lander paint material targets.
 * @param optionId - `lander-paintjob` catalog row id.
 */
export function applyLanderPaintMaterials(
  targets: readonly LanderPaintMaterialTarget[],
  optionId: string,
): void {
  const option = findCosmeticOptionById(optionId)
  if (!option || option.category !== 'lander-paintjob') return

  const primary = new THREE.Color(option.gradientStops[0] ?? '#ffffff')
  const secondary = new THREE.Color(option.gradientStops[1] ?? option.gradientStops[0] ?? '#ffffff')
  const trim = new THREE.Color(
    option.gradientStops[2] ?? option.gradientStops[1] ?? option.gradientStops[0] ?? '#ffffff',
  )
  const engine = new THREE.Color(
    option.gradientStops[3] ??
      option.gradientStops[2] ??
      option.gradientStops[1] ??
      option.gradientStops[0] ??
      '#ffffff',
  )

  const channelColors: Record<LanderPaintChannel, THREE.Color> = {
    primary,
    secondary,
    trim,
    engine,
  }

  if (option.id === LANDER_FACTORY_STOCK_OPTION_ID) {
    for (const target of targets) {
      restoreLanderStockPbr(target)
      applyLanderMaterialPaintColorTint(target.material, target.baseColor, channelColors[target.channel])
    }
    applyLanderPaintRamp(targets, option.gradientStops, {
      strength: LANDER_PAINT_RAMP_STRENGTH_TINT,
      baseGlow: 0,
      rim: null,
    })
    return
  }

  for (const target of targets) {
    applyLanderMaterialPaintColorReplace(target.material, channelColors[target.channel])
    applyLanderChannelFinish(target, option.finish)
  }

  applyLanderPaintRamp(targets, option.gradientStops, {
    strength: LANDER_PAINT_RAMP_STRENGTH_REPLACE,
    baseGlow: LANDER_PAINT_BASE_GLOW_REPLACE,
    rim: resolveLanderRim(option.finish?.rim),
  })
}

/** Optional rim params resolved from the catalog row (or `null` to disable). */
interface ResolvedLanderRim {
  /** Rim tint (mutated in place from a shared scratch instance). */
  readonly color: THREE.Color
  /** Rim glow strength multiplier. Pushes into HDR so bloom picks it up. */
  readonly intensity: number
  /** Fresnel exponent. Lower = wider rim band → more bloom source area. */
  readonly power: number
  /** Fresnel additive bias; raises the floor across the hull. */
  readonly bias: number
}

/** Per-call ramp config bundle so {@link applyLanderPaintRamp} stays focused. */
interface LanderRampApplyConfig {
  /** Ramp tint strength fed to the shader (top→bottom Y axis). */
  readonly strength: number
  /** Self-illumination strength in REPLACE mode (`0` for Factory Stock). */
  readonly baseGlow: number
  /** Optional rim params. `null` short-circuits the rim branch in the shader. */
  readonly rim: ResolvedLanderRim | null
}

/**
 * Build (or reuse) a gradient ramp from the option stops and wire it into every
 * paint target's shader. Subsequent calls just swap the texture + uniforms
 * without recompiling.
 *
 * @param targets - Lander paint targets prepared by `cloneAndCollectLanderPaintMaterials`.
 * @param gradientStops - Hex color stops from the active cosmetic option.
 * @param config - Ramp strength + base glow + optional rim params.
 */
function applyLanderPaintRamp(
  targets: readonly LanderPaintMaterialTarget[],
  gradientStops: readonly string[],
  config: LanderRampApplyConfig,
): void {
  if (targets.length === 0) return
  const rampTexture = buildPaintRampTexture(gradientStops)
  const bounds = getOrComputeLanderRampBounds(targets)
  for (const target of targets) {
    const userData = target.material.userData as { paintRampUniforms?: unknown }
    if (userData.paintRampUniforms) {
      updatePaintRampTexture(target.material, rampTexture)
      setPaintRampStrength(target.material, config.strength, 0, config.baseGlow)
      if (config.rim) {
        setPaintRampRim(
          target.material,
          config.rim.color,
          config.rim.intensity,
          config.rim.power,
          config.rim.bias,
        )
      } else {
        setPaintRampRim(target.material, LANDER_PAINT_RIM_OFF_COLOR, 0, LANDER_PAINT_RIM_DEFAULT_POWER, 0)
      }
      continue
    }
    applyPaintRampShader(target.material, {
      rampTexture,
      axis: LANDER_PAINT_RAMP_AXIS,
      axisBounds: bounds,
      strength: config.strength,
      meshToVehicleLocal: target.meshToVehicleLocal,
      baseGlow: config.baseGlow,
      rimColor: config.rim?.color,
      rimIntensity: config.rim?.intensity ?? 0,
      rimPower: config.rim?.power ?? LANDER_PAINT_RIM_DEFAULT_POWER,
      rimBias: config.rim?.bias ?? 0,
    })
  }
}

/**
 * Lazily compute and cache the lander's vehicle-local Y bounds across all
 * painted meshes. Cached per target array — the bounds don't change once the
 * mesh hierarchy is fixed.
 *
 * @param targets - Lander paint targets.
 */
function getOrComputeLanderRampBounds(
  targets: readonly LanderPaintMaterialTarget[],
): PaintRampBounds {
  const cached = landerRampBoundsCache.get(targets)
  if (cached) return cached
  const bounds = computePaintRampBounds(
    targets.map((target) => ({
      geometry: target.geometry,
      meshToVehicleLocal: target.meshToVehicleLocal,
    })),
    LANDER_PAINT_RAMP_AXIS,
  )
  landerRampBoundsCache.set(targets, bounds)
  return bounds
}

/**
 * Apply the active lander paint row from a profile snapshot.
 *
 * @param targets - Prepared lander paint material targets.
 * @param profile - Player profile carrying active cosmetics.
 */
export function applyLanderPaintMaterialsFromProfile(
  targets: readonly LanderPaintMaterialTarget[],
  profile: PlayerProfile,
): void {
  applyLanderPaintMaterials(targets, getPlayerCosmetics(profile).landerPaintjobId)
}

/**
 * Read a material albedo color when the Three material type exposes one.
 *
 * @param material - Three.js material candidate.
 */
export function getMaterialColor(material: THREE.Material): THREE.Color | null {
  if ('color' in material && material.color instanceof THREE.Color) {
    return material.color
  }
  return null
}

/**
 * Clone one material and append it to the paint target list when it exposes color.
 *
 * @param material - Source GLB material.
 * @param mesh - Mesh that owns the material (used to capture transform + geometry).
 * @param vehicleRoot - Loaded lander scene root used as the ramp reference frame.
 * @param channel - Lander paint channel selected from the mesh name.
 * @param targets - Mutable target list owned by the caller.
 */
function cloneAndCollectLanderPaintMaterial(
  material: THREE.Material,
  mesh: THREE.Mesh,
  vehicleRoot: THREE.Object3D,
  channel: LanderPaintChannel,
  targets: LanderPaintMaterialTarget[],
): THREE.Material {
  const cloned = material.clone()
  collectLanderPaintMaterial(cloned, mesh, vehicleRoot, channel, targets)
  return cloned
}

/**
 * Mix one paint color into a material while preserving some authored albedo
 * (Factory Stock only). Lerps from the captured authored color to the catalog
 * stop at {@link LANDER_PAINT_COLOR_STRENGTH_TINT}.
 *
 * @param material - Material to mutate.
 * @param baseColor - Captured pre-paint color.
 * @param paintColor - Cosmetic shader color for the material's channel.
 */
function applyLanderMaterialPaintColorTint(
  material: THREE.Material,
  baseColor: THREE.Color,
  paintColor: THREE.Color,
): void {
  const color = getMaterialColor(material)
  if (!color) return
  color.copy(baseColor).lerp(paintColor, LANDER_PAINT_COLOR_STRENGTH_TINT)
  material.needsUpdate = true
}

/**
 * Replace-mode color: full override at {@link LANDER_PAINT_COLOR_STRENGTH_REPLACE}
 * after pushing HSL saturation by {@link LANDER_PAINT_SATURATION_BOOST}. Keeps
 * paid paints from going muddy through ACES tonemapping.
 *
 * @param material - Material to mutate.
 * @param paintColor - Cosmetic shader color for the material's channel.
 */
function applyLanderMaterialPaintColorReplace(
  material: THREE.Material,
  paintColor: THREE.Color,
): void {
  const color = getMaterialColor(material)
  if (!color) return
  const boosted = paintColor.clone()
  pushLanderColorSaturation(boosted, LANDER_PAINT_SATURATION_BOOST)
  color.copy(boosted).multiplyScalar(LANDER_PAINT_COLOR_STRENGTH_REPLACE)
  material.needsUpdate = true
}

/** Reusable HSL bag — avoids one allocation per material per paint apply. */
const LANDER_PAINT_HSL_BAG = { h: 0, s: 0, l: 0 }

/**
 * Push a color's HSL saturation by `amount` (clamped to `[0, 1]`). No-op for
 * pure greys (S = 0) so neutral hardware (graphite trim, ash panels) stays
 * unbiased.
 *
 * @param color - Color mutated in place.
 * @param amount - Additive saturation delta in `[0, 1]`.
 */
function pushLanderColorSaturation(color: THREE.Color, amount: number): void {
  const hsl = color.getHSL(LANDER_PAINT_HSL_BAG)
  if (hsl.s <= 0) return
  color.setHSL(hsl.h, Math.min(1, hsl.s + amount), hsl.l)
}

/**
 * Apply the merged finish for a paint target's channel. Resolution chain is
 * channel block → default block → field-level fallbacks. Authored emissive is
 * preserved when neither `emissive` nor `emissiveIntensity` are specified.
 *
 * @param target - Prepared paint target.
 * @param profile - Optional finish profile from the catalog row.
 */
function applyLanderChannelFinish(
  target: LanderPaintMaterialTarget,
  profile: CosmeticFinishProfile | undefined,
): void {
  const channelBlock = profile?.[target.channel]
  const defaultBlock = profile?.default
  const merged: CosmeticFinishChannel = { ...defaultBlock, ...channelBlock }
  applyLanderStandardPbr(target, merged)
  applyLanderEmissive(target, merged)
}

/**
 * Apply `metalness` / `roughness` / `envMapIntensity` to materials whose class
 * exposes those fields (`MeshStandardMaterial` and subclasses). Fields not
 * declared in the merged finish fall back to {@link LANDER_PAINT_FINISH_FALLBACK}.
 *
 * @param target - Prepared paint target.
 * @param finish - Resolved (default + channel) finish block.
 */
function applyLanderStandardPbr(
  target: LanderPaintMaterialTarget,
  finish: CosmeticFinishChannel,
): void {
  const material = target.material
  if (
    !(
      material instanceof THREE.MeshStandardMaterial ||
      material instanceof THREE.MeshPhysicalMaterial
    )
  ) {
    return
  }
  material.metalness = finish.metalness ?? LANDER_PAINT_FINISH_FALLBACK.metalness
  material.roughness = finish.roughness ?? LANDER_PAINT_FINISH_FALLBACK.roughness
  material.envMapIntensity =
    finish.envMapIntensity ?? LANDER_PAINT_FINISH_FALLBACK.envMapIntensity
  material.needsUpdate = true
}

/**
 * Apply or clear the emissive channel for a paint target. When the finish
 * specifies neither `emissive` nor `emissiveIntensity`, the authored GLB
 * emissive snapshot is restored so we never accidentally trim a baked glow.
 *
 * @param target - Prepared paint target.
 * @param finish - Resolved (default + channel) finish block.
 */
function applyLanderEmissive(
  target: LanderPaintMaterialTarget,
  finish: CosmeticFinishChannel,
): void {
  const material = target.material
  if (
    !(
      material instanceof THREE.MeshStandardMaterial ||
      material instanceof THREE.MeshPhysicalMaterial ||
      material instanceof THREE.MeshPhongMaterial ||
      material instanceof THREE.MeshLambertMaterial
    )
  ) {
    return
  }
  const stock = target.stockPbr
  if (finish.emissive === undefined && finish.emissiveIntensity === undefined) {
    if (stock.emissive) material.emissive.copy(stock.emissive)
    if (
      stock.emissiveIntensity !== null &&
      'emissiveIntensity' in material &&
      typeof material.emissiveIntensity === 'number'
    ) {
      material.emissiveIntensity = stock.emissiveIntensity
    }
    return
  }
  if (finish.emissive !== undefined) {
    material.emissive.set(finish.emissive)
  } else if (stock.emissive) {
    material.emissive.copy(stock.emissive)
  }
  if (
    finish.emissiveIntensity !== undefined &&
    'emissiveIntensity' in material &&
    typeof material.emissiveIntensity === 'number'
  ) {
    material.emissiveIntensity = finish.emissiveIntensity
  }
  material.needsUpdate = true
}

/**
 * Restore every authored PBR field captured at clone time. Used by Factory
 * Stock so the lander reverts to its tuned authored finish (post
 * `tuneLanderMaterials`) rather than carrying over a paid paint's metallic
 * personality.
 *
 * @param target - Prepared paint target.
 */
function restoreLanderStockPbr(target: LanderPaintMaterialTarget): void {
  const material = target.material
  const stock = target.stockPbr
  if (
    material instanceof THREE.MeshStandardMaterial ||
    material instanceof THREE.MeshPhysicalMaterial
  ) {
    if (stock.metalness !== null) material.metalness = stock.metalness
    if (stock.roughness !== null) material.roughness = stock.roughness
    if (stock.envMapIntensity !== null) material.envMapIntensity = stock.envMapIntensity
  }
  if (
    material instanceof THREE.MeshStandardMaterial ||
    material instanceof THREE.MeshPhysicalMaterial ||
    material instanceof THREE.MeshPhongMaterial ||
    material instanceof THREE.MeshLambertMaterial
  ) {
    if (stock.emissive) material.emissive.copy(stock.emissive)
    if (
      stock.emissiveIntensity !== null &&
      'emissiveIntensity' in material &&
      typeof material.emissiveIntensity === 'number'
    ) {
      material.emissiveIntensity = stock.emissiveIntensity
    }
  }
  material.needsUpdate = true
}

/**
 * Snapshot the authored PBR fields exposed by a material so Factory Stock can
 * restore them later. Fields that aren't on the material's class come back
 * as `null`.
 *
 * @param material - Material to introspect.
 */
function captureLanderStockPbr(material: THREE.Material): LanderStockPbr {
  const standard =
    material instanceof THREE.MeshStandardMaterial ||
    material instanceof THREE.MeshPhysicalMaterial
      ? material
      : null
  const emissiveSource =
    material instanceof THREE.MeshStandardMaterial ||
    material instanceof THREE.MeshPhysicalMaterial ||
    material instanceof THREE.MeshPhongMaterial ||
    material instanceof THREE.MeshLambertMaterial
      ? material
      : null
  return {
    metalness: standard ? standard.metalness : null,
    roughness: standard ? standard.roughness : null,
    envMapIntensity: standard ? standard.envMapIntensity : null,
    emissive: emissiveSource ? emissiveSource.emissive.clone() : null,
    emissiveIntensity:
      emissiveSource && typeof emissiveSource.emissiveIntensity === 'number'
        ? emissiveSource.emissiveIntensity
        : null,
  }
}

/** Reusable scratch color used when resolving rim configs to runtime uniforms. */
const LANDER_PAINT_RIM_SCRATCH = new THREE.Color()
/** Color passed to {@link setPaintRampRim} when the rim is disabled. */
const LANDER_PAINT_RIM_OFF_COLOR = new THREE.Color(1, 1, 1)

/**
 * Resolve a `CosmeticRim` block into the concrete uniform values the shader
 * expects. Missing fields fall back to defaults. Returns `null` when the rim
 * is undefined or its intensity is zero — call sites use that to short-circuit
 * the rim entirely (zero `pow` cost in the fragment shader).
 *
 * @param rim - Optional rim block from the active paint catalog row.
 */
function resolveLanderRim(rim: CosmeticRim | undefined): ResolvedLanderRim | null {
  if (!rim || (rim.intensity ?? 0) <= 0) return null
  const color = LANDER_PAINT_RIM_SCRATCH
  if (rim.color !== undefined) {
    color.set(rim.color)
  } else {
    color.setRGB(1, 1, 1)
  }
  return {
    color,
    intensity: rim.intensity ?? 0,
    power: rim.power ?? LANDER_PAINT_RIM_DEFAULT_POWER,
    bias: rim.bias ?? 0,
  }
}
