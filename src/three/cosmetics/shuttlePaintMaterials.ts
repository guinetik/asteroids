/**
 * Runtime shuttle paint channel mapping for the Pimp My Shuttle cosmetic shop.
 *
 * @author guinetik
 * @date 2026-04-30
 * @spec docs/superpowers/specs/2026-04-30-cosmetic-shader-model-mapping.md
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

/** Shuttle paint channel inferred from GLB material names. */
export type ShuttlePaintChannel = 'primary' | 'secondary' | 'trim' | 'accent'

/**
 * Snapshot of authored GLB PBR fields captured at clone time. Used to restore
 * Factory Stock and as the fall-through value for any finish profile field a
 * paint catalog row leaves unspecified.
 */
interface ShuttleStockPbr {
  /** Authored `metalness` (`MeshStandardMaterial` only); `null` when the material class doesn't expose one. */
  readonly metalness: number | null
  /** Authored `roughness` (`MeshStandardMaterial` only); `null` when the material class doesn't expose one. */
  readonly roughness: number | null
  /** Authored `envMapIntensity` (`MeshStandardMaterial` only); `null` when N/A. */
  readonly envMapIntensity: number | null
  /** Cloned authored `emissive` color; `null` when the material has no emissive channel. */
  readonly emissive: THREE.Color | null
  /** Authored `emissiveIntensity`; `null` when N/A. */
  readonly emissiveIntensity: number | null
}

/**
 * A cloned shuttle material and its original color, bound to one paint channel.
 */
export interface ShuttlePaintMaterialTarget {
  /** Material instance assigned to a visible shuttle mesh. */
  readonly material: THREE.Material
  /** Color captured before the cosmetic paint mix was applied. */
  readonly baseColor: THREE.Color
  /** Shader channel selected from the source material name. */
  readonly channel: ShuttlePaintChannel
  /** Mesh geometry — used to compute ramp axis bounds. */
  readonly geometry: THREE.BufferGeometry
  /** Mesh-local → vehicle-local transform captured at collection time. */
  readonly meshToVehicleLocal: THREE.Matrix4
  /** Authored GLB albedo color before any paint replacement. Used to restore Factory Stock. */
  readonly stockColor: THREE.Color
  /** Authored GLB diffuse map (panel lines / decals / scuffs). `null` when the source had none. */
  readonly stockMap: THREE.Texture | null
  /** Authored GLB PBR snapshot. */
  readonly stockPbr: ShuttleStockPbr
}

const SHUTTLE_PAINT_PRIMARY_MATERIALS = new Set([
  'wingtop',
  'wing flap top',
  'nose top',
  'side stb',
  'side prt',
  'OMS pod stb',
  'OMS pod prt',
  'tail',
  'shut-doors-top',
  'shut-doors-side',
])
const SHUTTLE_PAINT_SECONDARY_MATERIALS = new Set([
  'belly',
  'belly flap',
  'fusolage aft eng',
  'OMS pod prt back',
  'OMS pod stb back',
  'OMS pods side',
  'RCS aft stb',
  'RCS aft prt',
])
const SHUTTLE_PAINT_TRIM_MATERIALS = new Set([
  'nose tip',
  'bay prt wedges',
  'bay stb wedges',
  'bay prt edges',
  'bay stb edges',
  'doors edge',
  'cockpit side',
])
const SHUTTLE_PAINT_ACCENT_MATERIALS = new Set([
  'shut-handrails',
  'arrows top',
  'shut-cam-cargo',
  'bay prt evarail',
  'bay stb evarail',
  'bay prt doorlatc',
  'bay stb doorlatc',
  'eng out',
])
/**
 * Multiplier applied to per-channel paint colors before they replace the GLB
 * albedo. `1.0` keeps the catalog hex value as-is; lower values dim it. Tuned
 * up from the legacy `0.88` so paid paints read at full chroma now that the
 * stock diffuse map no longer competes with them.
 */
const SHUTTLE_PAINT_COLOR_STRENGTH = 1.0
/**
 * Self-illumination strength used in REPLACE mode. Adds `paintColor * this`
 * to `totalEmissiveRadiance` so even unlit faces (dark side of a planet) keep
 * a faint pulse of the paint color — the ship never dissolves into the
 * starfield, NFS-Underground style. Tuned high enough to compensate for the
 * brightness lost when the GLB diffuse map is dropped.
 */
const SHUTTLE_PAINT_BASE_GLOW_REPLACE = 0.2
/** Shuttle gradient ramp flows nose→tail along the raw GLB X axis. */
const SHUTTLE_PAINT_RAMP_AXIS = 'x' as const
/**
 * Ramp tint strength used in REPLACE mode (paid paints, where the GLB diffuse map
 * has been dropped). Higher than the old tint-mode value because the stock panel-
 * line texture is no longer competing with the gradient.
 */
const SHUTTLE_PAINT_RAMP_STRENGTH_REPLACE = 0.35
/**
 * Procedural panel-seam + scuff overlay strength in REPLACE mode. Drives the
 * `paintDetail` branch of the ramp shader, simulating the panel detail that the
 * dropped diffuse map used to provide.
 */
const SHUTTLE_PAINT_DETAIL_STRENGTH_REPLACE = 0.55
/**
 * Saturation push (additive HSL S) applied to per-channel paint colors in
 * REPLACE mode. Helps GLB albedos that were authored greyer than their JSON
 * gradient stops actually pop on the hull.
 */
const SHUTTLE_PAINT_SATURATION_BOOST = 0.12
/**
 * Default finish merged into every paid paint when the catalog row leaves
 * `finish` blank or only specifies some channels. Tuned to feel a little more
 * metallic than the legacy GLB defaults so paints feel like a fresh coat.
 */
const SHUTTLE_PAINT_FINISH_FALLBACK: Required<
  Pick<CosmeticFinishChannel, 'metalness' | 'roughness' | 'envMapIntensity'>
> = {
  metalness: 0.55,
  roughness: 0.4,
  envMapIntensity: 1.2,
}
/**
 * Catalog id of the bundled "Factory Stock" shuttle paint row. Selecting this
 * option restores the authored GLB albedo + diffuse map and disables the ramp
 * + detail overlay.
 */
const SHUTTLE_FACTORY_STOCK_OPTION_ID = 'shuttle-paintjob-factory-stock'
/** Cached ramp bounds per shuttle target list. */
const shuttleRampBoundsCache = new WeakMap<
  ReadonlyArray<ShuttlePaintMaterialTarget>,
  PaintRampBounds
>()

/**
 * Clone each paintable material on a shuttle scene and collect paint targets.
 *
 * @param root - Loaded shuttle scene or subtree.
 */
export function cloneAndCollectShuttlePaintMaterials(
  root: THREE.Object3D,
): ShuttlePaintMaterialTarget[] {
  root.updateMatrixWorld(true)
  const targets: ShuttlePaintMaterialTarget[] = []
  root.traverse((child) => {
    if (!(child instanceof THREE.Mesh) || !child.material) return

    if (Array.isArray(child.material)) {
      child.material = child.material.map((material) =>
        cloneAndCollectShuttlePaintMaterial(material, child, root, targets),
      )
      return
    }

    child.material = cloneAndCollectShuttlePaintMaterial(child.material, child, root, targets)
  })
  return targets
}

/**
 * Apply a shuttle paint catalog option directly to prepared material targets.
 *
 * Factory Stock restores the authored GLB albedo and diffuse map and disables
 * the ramp + detail overlay. Paid paints drop the diffuse map, replace the
 * albedo with the per-channel paint color, and enable the ramp + procedural
 * panel-seam / scuff overlay.
 *
 * @param targets - Prepared shuttle paint material targets.
 * @param optionId - `shuttle-paintjob` catalog row id.
 */
export function applyShuttlePaintMaterials(
  targets: readonly ShuttlePaintMaterialTarget[],
  optionId: string,
): void {
  const option = findCosmeticOptionById(optionId)
  if (!option || option.category !== 'shuttle-paintjob') return

  if (optionId === SHUTTLE_FACTORY_STOCK_OPTION_ID) {
    restoreShuttleStockPaintMaterials(targets)
    return
  }

  const primary = new THREE.Color(option.gradientStops[0] ?? '#ffffff')
  const secondary = new THREE.Color(option.gradientStops[1] ?? option.gradientStops[0] ?? '#ffffff')
  const trim = new THREE.Color(
    option.gradientStops[2] ?? option.gradientStops[1] ?? option.gradientStops[0] ?? '#ffffff',
  )
  const accent = new THREE.Color(
    option.gradientStops[2] ?? option.gradientStops[1] ?? option.gradientStops[0] ?? '#ffffff',
  )

  for (const target of targets) {
    const channelColor = {
      primary,
      secondary,
      trim,
      accent,
    }[target.channel]
    setShuttleMaterialDiffuseMap(target.material, null)
    applyMaterialPaintColorReplace(target.material, channelColor)
    applyShuttleChannelFinish(target, option.finish)
  }

  applyShuttlePaintRamp(
    targets,
    option.gradientStops,
    SHUTTLE_PAINT_RAMP_STRENGTH_REPLACE,
    SHUTTLE_PAINT_DETAIL_STRENGTH_REPLACE,
    SHUTTLE_PAINT_BASE_GLOW_REPLACE,
    resolveShuttleRim(option.finish?.rim),
  )
}

/**
 * Restore the authored GLB diffuse map + albedo for every shuttle paint target,
 * and zero out the ramp / detail uniforms so the shader injection becomes a
 * no-op.
 *
 * @param targets - Prepared shuttle paint material targets.
 */
function restoreShuttleStockPaintMaterials(
  targets: readonly ShuttlePaintMaterialTarget[],
): void {
  for (const target of targets) {
    const materialColor = getShuttleMaterialColor(target.material)
    if (materialColor) {
      materialColor.copy(target.stockColor)
    }
    setShuttleMaterialDiffuseMap(target.material, target.stockMap)
    restoreShuttleStockPbr(target)
    setPaintRampStrength(target.material, 0, 0, 0)
    setPaintRampRim(
      target.material,
      SHUTTLE_PAINT_RIM_SCRATCH.setRGB(1, 1, 1),
      0,
      SHUTTLE_PAINT_RIM_DEFAULT_POWER,
      0,
    )
    target.material.needsUpdate = true
  }
}

/**
 * Apply the finish profile for a paint catalog row to one paint target. The
 * resolved finish for the target's channel is `default` block + channel block,
 * with channel block taking precedence per field. Anything still unset falls
 * back to {@link SHUTTLE_PAINT_FINISH_FALLBACK} (or the authored stock value
 * for emissive, so we never accidentally disable a glow that was baked into
 * the GLB).
 *
 * @param target - Prepared paint target.
 * @param profile - Optional finish profile from the catalog row.
 */
function applyShuttleChannelFinish(
  target: ShuttlePaintMaterialTarget,
  profile: CosmeticFinishProfile | undefined,
): void {
  const channelBlock = profile?.[target.channel]
  const defaultBlock = profile?.default
  const merged: CosmeticFinishChannel = { ...defaultBlock, ...channelBlock }
  applyShuttleStandardPbr(target, merged)
  applyShuttleEmissive(target, merged)
}

/**
 * Apply `metalness` / `roughness` / `envMapIntensity` to materials whose class
 * exposes those fields (`MeshStandardMaterial` and subclasses). Falls back to
 * {@link SHUTTLE_PAINT_FINISH_FALLBACK} for unspecified scalars.
 *
 * @param target - Prepared paint target.
 * @param finish - Resolved (default + channel) finish block.
 */
function applyShuttleStandardPbr(
  target: ShuttlePaintMaterialTarget,
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
  material.metalness = finish.metalness ?? SHUTTLE_PAINT_FINISH_FALLBACK.metalness
  material.roughness = finish.roughness ?? SHUTTLE_PAINT_FINISH_FALLBACK.roughness
  material.envMapIntensity =
    finish.envMapIntensity ?? SHUTTLE_PAINT_FINISH_FALLBACK.envMapIntensity
  material.needsUpdate = true
}

/**
 * Apply or clear the emissive channel for a paint target. When the finish
 * specifies neither `emissive` nor `emissiveIntensity`, the authored GLB
 * emissive is restored so we never accidentally trim a baked glow.
 *
 * @param target - Prepared paint target.
 * @param finish - Resolved (default + channel) finish block.
 */
function applyShuttleEmissive(
  target: ShuttlePaintMaterialTarget,
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
 * Restore every authored PBR field captured at clone time. Used by Factory Stock.
 *
 * @param target - Prepared paint target.
 */
function restoreShuttleStockPbr(target: ShuttlePaintMaterialTarget): void {
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
}

/**
 * Wire (or refresh) the gradient ramp shader on every shuttle paint target.
 *
 * @param targets - Shuttle paint targets.
 * @param gradientStops - Hex stops from the active cosmetic option.
 * @param rampStrength - Tint mix strength for the ramp uniform.
 * @param detailStrength - Procedural panel-seam / scuff overlay strength.
 * @param baseGlow - Self-illumination strength (paint color fraction added to emissive).
 * @param rim - Resolved rim parameters, or `null` for no silhouette glow.
 */
function applyShuttlePaintRamp(
  targets: readonly ShuttlePaintMaterialTarget[],
  gradientStops: readonly string[],
  rampStrength: number,
  detailStrength: number,
  baseGlow: number,
  rim: ResolvedShuttleRim | null,
): void {
  if (targets.length === 0) return
  const rampTexture = buildPaintRampTexture(gradientStops)
  const bounds = getOrComputeShuttleRampBounds(targets)
  const rimColor = rim?.color ?? SHUTTLE_PAINT_RIM_SCRATCH.setRGB(1, 1, 1)
  const rimIntensity = rim?.intensity ?? 0
  const rimPower = rim?.power ?? SHUTTLE_PAINT_RIM_DEFAULT_POWER
  const rimBias = rim?.bias ?? 0
  for (const target of targets) {
    const userData = target.material.userData as { paintRampUniforms?: unknown }
    if (userData.paintRampUniforms) {
      updatePaintRampTexture(target.material, rampTexture)
      setPaintRampStrength(target.material, rampStrength, detailStrength, baseGlow)
      setPaintRampRim(target.material, rimColor, rimIntensity, rimPower, rimBias)
      continue
    }
    applyPaintRampShader(target.material, {
      rampTexture,
      axis: SHUTTLE_PAINT_RAMP_AXIS,
      axisBounds: bounds,
      strength: rampStrength,
      meshToVehicleLocal: target.meshToVehicleLocal,
      detailStrength,
      baseGlow,
      rimColor,
      rimIntensity,
      rimPower,
      rimBias,
    })
  }
}

/**
 * Lazily compute and cache the shuttle's vehicle-local X bounds.
 *
 * @param targets - Shuttle paint targets.
 */
function getOrComputeShuttleRampBounds(
  targets: readonly ShuttlePaintMaterialTarget[],
): PaintRampBounds {
  const cached = shuttleRampBoundsCache.get(targets)
  if (cached) return cached
  const bounds = computePaintRampBounds(
    targets.map((target) => ({
      geometry: target.geometry,
      meshToVehicleLocal: target.meshToVehicleLocal,
    })),
    SHUTTLE_PAINT_RAMP_AXIS,
  )
  shuttleRampBoundsCache.set(targets, bounds)
  return bounds
}

/**
 * Apply the active shuttle paint row from a profile snapshot.
 *
 * @param targets - Prepared shuttle paint material targets.
 * @param profile - Player profile carrying active cosmetics.
 */
export function applyShuttlePaintMaterialsFromProfile(
  targets: readonly ShuttlePaintMaterialTarget[],
  profile: PlayerProfile,
): void {
  applyShuttlePaintMaterials(targets, getPlayerCosmetics(profile).shuttlePaintjobId)
}

/**
 * Return the paint channel for a shuttle material name.
 *
 * @param materialName - Material name from `public/models/shuttle.glb`.
 */
export function getShuttlePaintChannelForMaterialName(
  materialName: string,
): ShuttlePaintChannel | null {
  if (SHUTTLE_PAINT_PRIMARY_MATERIALS.has(materialName)) return 'primary'
  if (SHUTTLE_PAINT_SECONDARY_MATERIALS.has(materialName)) return 'secondary'
  if (SHUTTLE_PAINT_TRIM_MATERIALS.has(materialName)) return 'trim'
  if (SHUTTLE_PAINT_ACCENT_MATERIALS.has(materialName)) return 'accent'
  return null
}

/**
 * Read a material albedo color when the Three material type exposes one.
 *
 * @param material - Three.js material candidate.
 */
export function getShuttleMaterialColor(material: THREE.Material): THREE.Color | null {
  if (
    material instanceof THREE.MeshStandardMaterial ||
    material instanceof THREE.MeshPhysicalMaterial ||
    material instanceof THREE.MeshPhongMaterial ||
    material instanceof THREE.MeshLambertMaterial ||
    material instanceof THREE.MeshBasicMaterial
  ) {
    return material.color
  }
  return null
}

/**
 * Clone one shuttle material and append it to the paint target list when paintable.
 *
 * @param material - Source GLB material.
 * @param mesh - Mesh that owns the material (used for ramp transform + geometry).
 * @param vehicleRoot - Loaded shuttle scene root used as the ramp reference frame.
 * @param targets - Mutable target list owned by the caller.
 */
function cloneAndCollectShuttlePaintMaterial(
  material: THREE.Material,
  mesh: THREE.Mesh,
  vehicleRoot: THREE.Object3D,
  targets: ShuttlePaintMaterialTarget[],
): THREE.Material {
  const channel = getShuttlePaintChannelForMaterialName(material.name)
  if (!channel) return material
  const cloned = material.clone()
  const baseColor = getShuttleMaterialColor(cloned)
  if (baseColor) {
    targets.push({
      material: cloned,
      baseColor: baseColor.clone(),
      channel,
      geometry: mesh.geometry,
      meshToVehicleLocal: computeMeshToVehicleLocal(mesh, vehicleRoot),
      stockColor: baseColor.clone(),
      stockMap: getShuttleMaterialDiffuseMap(cloned),
      stockPbr: captureShuttleStockPbr(cloned),
    })
  }
  return cloned
}

/**
 * Capture the authored PBR scalars + emissive from a freshly cloned material.
 * Each field is independently nullable because not every Three material class
 * exposes every PBR slot.
 *
 * @param material - Cloned shuttle paint material.
 */
function captureShuttleStockPbr(material: THREE.Material): ShuttleStockPbr {
  const isStandard =
    material instanceof THREE.MeshStandardMaterial ||
    material instanceof THREE.MeshPhysicalMaterial
  const supportsEmissive =
    isStandard ||
    material instanceof THREE.MeshPhongMaterial ||
    material instanceof THREE.MeshLambertMaterial
  return {
    metalness: isStandard ? material.metalness : null,
    roughness: isStandard ? material.roughness : null,
    envMapIntensity: isStandard ? material.envMapIntensity : null,
    emissive: supportsEmissive ? material.emissive.clone() : null,
    emissiveIntensity:
      supportsEmissive &&
      'emissiveIntensity' in material &&
      typeof material.emissiveIntensity === 'number'
        ? material.emissiveIntensity
        : null,
  }
}

/**
 * Read the diffuse / albedo map (`.map`) from any standard Three material that
 * exposes one. Returns `null` when the field is absent or untyped.
 *
 * @param material - Material to inspect.
 */
function getShuttleMaterialDiffuseMap(material: THREE.Material): THREE.Texture | null {
  if (
    material instanceof THREE.MeshStandardMaterial ||
    material instanceof THREE.MeshPhysicalMaterial ||
    material instanceof THREE.MeshPhongMaterial ||
    material instanceof THREE.MeshLambertMaterial ||
    material instanceof THREE.MeshBasicMaterial
  ) {
    return material.map ?? null
  }
  return null
}

/**
 * Replace or restore the diffuse / albedo map on a paintable shuttle material.
 * When `map` differs from the material's current value, marks the material for
 * recompile so the `USE_MAP` define toggles correctly.
 *
 * @param material - Material to mutate.
 * @param map - Replacement texture, or `null` to drop the map entirely.
 */
function setShuttleMaterialDiffuseMap(
  material: THREE.Material,
  map: THREE.Texture | null,
): void {
  if (
    !(
      material instanceof THREE.MeshStandardMaterial ||
      material instanceof THREE.MeshPhysicalMaterial ||
      material instanceof THREE.MeshPhongMaterial ||
      material instanceof THREE.MeshLambertMaterial ||
      material instanceof THREE.MeshBasicMaterial
    )
  ) {
    return
  }
  const current = material.map ?? null
  if (current === map) return
  material.map = map
  material.needsUpdate = true
}

/**
 * Replace the material albedo with the per-channel paint color (replace mode).
 *
 * In replace mode the GLB diffuse map has been dropped, so all surface color
 * comes from `material.color * paintRamp * detail`. The strength scalar tames
 * the result to match the brightness ceiling the rest of the game's lighting
 * was tuned against, and a saturation push compensates for the GLB albedos
 * having been authored slightly desaturated.
 *
 * @param material - Material to mutate.
 * @param paintColor - Cosmetic shader color for the material's channel.
 */
function applyMaterialPaintColorReplace(
  material: THREE.Material,
  paintColor: THREE.Color,
): void {
  const materialColor = getShuttleMaterialColor(material)
  if (!materialColor) return
  const boosted = paintColor.clone()
  pushColorSaturation(boosted, SHUTTLE_PAINT_SATURATION_BOOST)
  materialColor.copy(boosted).multiplyScalar(SHUTTLE_PAINT_COLOR_STRENGTH)
  material.needsUpdate = true
}

/** Reusable HSL bag — avoid allocating one per material per paint apply. */
const SHUTTLE_PAINT_HSL_BAG = { h: 0, s: 0, l: 0 }

/**
 * Push a color's HSL saturation by `amount` (clamped to `[0, 1]`). No-op for
 * pure greys (S = 0) so neutral hull elements like silver / graphite stay
 * unbiased.
 *
 * @param color - Color mutated in place.
 * @param amount - Additive saturation delta in `[0, 1]`.
 */
function pushColorSaturation(color: THREE.Color, amount: number): void {
  const hsl = color.getHSL(SHUTTLE_PAINT_HSL_BAG)
  if (hsl.s <= 0) return
  color.setHSL(hsl.h, Math.min(1, hsl.s + amount), hsl.l)
}

/** Reusable scratch color used when resolving rim configs to runtime uniforms. */
const SHUTTLE_PAINT_RIM_SCRATCH = new THREE.Color()
/** Default rim Fresnel exponent when a paint omits `rim.power`. */
const SHUTTLE_PAINT_RIM_DEFAULT_POWER = 2.5

/**
 * Resolved rim parameters fed into the paint shader uniforms. `intensity = 0`
 * is the bypass — same shader, zero contribution.
 */
interface ResolvedShuttleRim {
  /** Rim color (mutated in place from a shared scratch instance). */
  readonly color: THREE.Color
  /** Rim glow strength multiplier. */
  readonly intensity: number
  /** Fresnel exponent. */
  readonly power: number
  /** Fresnel additive bias. */
  readonly bias: number
}

/**
 * Resolve a `CosmeticRim` block into the concrete uniform values the shader
 * expects. Missing fields fall back to defaults. Returns `null` when the rim
 * is undefined or its intensity is zero — call sites use that to short-circuit
 * the rim entirely.
 *
 * @param rim - Optional rim block from the active paint catalog row.
 */
function resolveShuttleRim(rim: CosmeticRim | undefined): ResolvedShuttleRim | null {
  if (!rim || (rim.intensity ?? 0) <= 0) return null
  const color = SHUTTLE_PAINT_RIM_SCRATCH
  if (rim.color !== undefined) {
    color.set(rim.color)
  } else {
    color.setRGB(1, 1, 1)
  }
  return {
    color,
    intensity: rim.intensity ?? 0,
    power: rim.power ?? SHUTTLE_PAINT_RIM_DEFAULT_POWER,
    bias: rim.bias ?? 0,
  }
}
