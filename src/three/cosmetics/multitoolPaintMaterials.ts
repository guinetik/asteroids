/**
 * Runtime multitool paint channel mapping for the Pimp My Shuttle cosmetic shop.
 *
 * Mirrors the lander "v2" pipeline but tuned for a held FPS prop: paid paints
 * use replace mode (full color override + saturation boost + per-paint PBR
 * finish) while Fleet Issue keeps the legacy tint-mode path so the bundled
 * multitool stays subtle. The viewmodel layer already has dedicated lighting,
 * so we skip silhouette rim glow and base self-illumination — both would
 * over-bloom or wash out at this distance from the camera. Procedural detail
 * is restricted to grain only (no panel seams, no scuff cells) because the
 * multitool is a mechanical prop, not a panelled hull.
 *
 * @author guinetik
 * @date 2026-04-30
 * @spec docs/superpowers/specs/2026-05-02-pimp-my-shuttle-paint-ramp.md
 */

import { findCosmeticOptionById } from '@/lib/cosmetics/catalog'
import { getPlayerCosmetics } from '@/lib/cosmetics/profileCosmetics'
import type { CosmeticFinishChannel, CosmeticFinishProfile } from '@/lib/cosmetics/types'
import type { PlayerProfile } from '@/lib/player/types'
import partsJson from '@/data/multitool/identified-parts.json'
import * as THREE from 'three'
import {
  applyPaintRampShader,
  buildPaintRampTexture,
  computeMeshToVehicleLocal,
  computePaintRampBounds,
  setPaintRampDetailWeights,
  setPaintRampStrength,
  updatePaintRampTexture,
  type PaintRampBounds,
} from './paintRampShader'

/** Multitool paint channel inferred from GLB node names. */
export type MultitoolPaintChannel = 'primary' | 'secondary' | 'trim'

/**
 * Authored PBR snapshot captured at clone time. Restored by Fleet Issue so
 * the baseline multitool reverts to its tuned authored finish.
 */
export interface MultitoolStockPbr {
  /** Authored `metalness`; `null` if material has no `metalness`. */
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
 * A cloned multitool material and its original color, bound to one paint channel.
 */
export interface MultitoolPaintMaterialTarget {
  /** Material instance assigned to a visible multitool mesh. */
  readonly material: THREE.Material
  /** Color captured before the cosmetic paint mix was applied. Used by Fleet Issue. */
  readonly baseColor: THREE.Color
  /** Shader channel selected from the source node name. */
  readonly channel: MultitoolPaintChannel
  /** Mesh geometry — used to compute ramp axis bounds. */
  readonly geometry: THREE.BufferGeometry
  /** Mesh-local → vehicle-local transform captured at collection time. */
  readonly meshToVehicleLocal: THREE.Matrix4
  /** Authored PBR snapshot. Restored by {@link applyMultitoolPaintMaterials} on Fleet Issue. */
  readonly stockPbr: MultitoolStockPbr
}

/** Tint-mode color mix strength used by Fleet Issue (legacy LERP path). */
const MULTITOOL_PAINT_COLOR_STRENGTH_TINT = 0.9
/** Replace-mode color strength for paid paints. `1.0` = full chroma override. */
const MULTITOOL_PAINT_COLOR_STRENGTH_REPLACE = 1.0
/**
 * Saturation push (additive HSL S) applied to per-channel paint colors in
 * REPLACE mode. Matches the ship pipelines so paint reads punchy through the
 * ACES tonemap.
 */
const MULTITOOL_PAINT_SATURATION_BOOST = 0.12
/** Catalog id of the bundled "Fleet Issue" multitool paint row (legacy tint path). */
const MULTITOOL_FACTORY_STOCK_OPTION_ID = 'multitool-paintjob-factory-stock'

/** Multitool gradient ramp flows top→bottom along the model's Y axis (slide → grip). */
const MULTITOOL_PAINT_RAMP_AXIS = 'y' as const
/** Tint-mode ramp tint strength (Fleet Issue). */
const MULTITOOL_PAINT_RAMP_STRENGTH_TINT = 0.26
/**
 * Replace-mode ramp tint strength (paid paints). A touch stronger than tint so
 * the slide→grip gradient still reads after the per-channel colors fully
 * replace the authored albedo.
 */
const MULTITOOL_PAINT_RAMP_STRENGTH_REPLACE = 0.32
/**
 * Procedural detail master strength in REPLACE mode. The multitool is held
 * close to the camera, so even a modest detail signal reads — going higher
 * makes the prop look noisy. `0` for tint mode (no procedural overlay on the
 * authored albedo).
 */
const MULTITOOL_PAINT_DETAIL_STRENGTH_REPLACE = 0.5
/**
 * Per-component detail weights used in REPLACE mode. The multitool is a
 * mechanical part, not a panelled hull — seams and scuff cells would lie on
 * top of injection-mould geometry that has none. Grain only keeps the surface
 * feeling like a real material without inventing seams.
 */
const MULTITOOL_PAINT_DETAIL_WEIGHTS_GRAIN_ONLY = /* @__PURE__ */ new THREE.Vector3(0, 0, 1)
/**
 * Per-component detail weights used in TINT mode (Fleet Issue). Detail master
 * strength is zero in this mode so weights effectively don't matter, but we
 * still flip them off explicitly so a mid-session swap from a paid paint back
 * to Fleet Issue doesn't leak grain into the authored finish.
 */
const MULTITOOL_PAINT_DETAIL_WEIGHTS_OFF = /* @__PURE__ */ new THREE.Vector3(0, 0, 0)
/**
 * Default finish merged into every paid paint when the catalog row leaves
 * `finish` blank or only specifies some channels. Mid-grade plastic baseline.
 */
const MULTITOOL_PAINT_FINISH_FALLBACK: Required<
  Pick<CosmeticFinishChannel, 'metalness' | 'roughness' | 'envMapIntensity'>
> = {
  metalness: 0.4,
  roughness: 0.5,
  envMapIntensity: 1.0,
}

/** Cached ramp bounds per multitool target list. */
const multitoolRampBoundsCache = new WeakMap<
  ReadonlyArray<MultitoolPaintMaterialTarget>,
  PaintRampBounds
>()
const MULTITOOL_BODY_NODE = partsJson.body.nodeName
const MULTITOOL_TRIGGER_NODE = partsJson.controls.find((part) => part.id === 'trigger')?.nodeName
const MULTITOOL_TRIGGER_LOCK_NODE = partsJson.controls.find(
  (part) => part.id === 'trigger_lock',
)?.nodeName
const MULTITOOL_EXCLUDED_NODES = new Set([
  ...partsJson.statusLeds.map((part) => part.nodeName),
  ...partsJson.powerIndicators.map((part) => part.nodeName),
])

/**
 * Clone each paintable material on a multitool scene and collect paint targets.
 *
 * @param root - Loaded multitool scene or subtree.
 */
export function cloneAndCollectMultitoolPaintMaterials(
  root: THREE.Object3D,
): MultitoolPaintMaterialTarget[] {
  root.updateMatrixWorld(true)
  const targets: MultitoolPaintMaterialTarget[] = []
  root.traverse((child) => {
    if (!(child instanceof THREE.Mesh) || !child.material) return
    const channel = getMultitoolPaintChannelForObjectName(child.name)
    if (!channel) return

    if (Array.isArray(child.material)) {
      child.material = child.material.map((material) =>
        cloneAndCollectMultitoolPaintMaterial(material, child, root, channel, targets),
      )
      return
    }

    child.material = cloneAndCollectMultitoolPaintMaterial(
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
 * Apply a multitool paint catalog option directly to prepared material targets.
 *
 * Fleet Issue keeps the legacy tint-mode path (LERP authored color → catalog
 * stop) so the bundled multitool stays subtle. Paid paints use replace mode:
 * full color override, saturation boost, per-paint PBR finish, grain-only
 * procedural detail. No rim glow, no base glow — the multitool always has
 * dedicated viewmodel lighting and never silhouettes against dark space.
 *
 * @param targets - Prepared multitool paint material targets.
 * @param optionId - `multitool-paintjob` catalog row id.
 */
export function applyMultitoolPaintMaterials(
  targets: readonly MultitoolPaintMaterialTarget[],
  optionId: string,
): void {
  const option = findCosmeticOptionById(optionId)
  if (!option || option.category !== 'multitool-paintjob') return

  const primary = new THREE.Color(option.gradientStops[0] ?? '#ffffff')
  const secondary = new THREE.Color(option.gradientStops[1] ?? option.gradientStops[0] ?? '#ffffff')
  const trim = new THREE.Color(
    option.gradientStops[2] ?? option.gradientStops[1] ?? option.gradientStops[0] ?? '#ffffff',
  )

  const channelColors: Record<MultitoolPaintChannel, THREE.Color> = {
    primary,
    secondary,
    trim,
  }

  if (option.id === MULTITOOL_FACTORY_STOCK_OPTION_ID) {
    for (const target of targets) {
      restoreMultitoolStockPbr(target)
      applyMultitoolMaterialPaintColorTint(
        target.material,
        target.baseColor,
        channelColors[target.channel],
      )
    }
    applyMultitoolPaintRamp(targets, option.gradientStops, {
      strength: MULTITOOL_PAINT_RAMP_STRENGTH_TINT,
      detailStrength: 0,
      detailWeights: MULTITOOL_PAINT_DETAIL_WEIGHTS_OFF,
    })
    return
  }

  for (const target of targets) {
    applyMultitoolMaterialPaintColorReplace(target.material, channelColors[target.channel])
    applyMultitoolChannelFinish(target, option.finish)
  }
  applyMultitoolPaintRamp(targets, option.gradientStops, {
    strength: MULTITOOL_PAINT_RAMP_STRENGTH_REPLACE,
    detailStrength: MULTITOOL_PAINT_DETAIL_STRENGTH_REPLACE,
    detailWeights: MULTITOOL_PAINT_DETAIL_WEIGHTS_GRAIN_ONLY,
  })
}

/** Per-call ramp config bundle for {@link applyMultitoolPaintRamp}. */
interface MultitoolRampApplyConfig {
  /** Ramp tint strength fed to the shader (slide→grip Y axis). */
  readonly strength: number
  /** Procedural detail master strength (`0` to disable the detail branch). */
  readonly detailStrength: number
  /** Per-component detail weights `(seam, scuff, grain)`. */
  readonly detailWeights: THREE.Vector3
}

/**
 * Build (or reuse) a gradient ramp from the option stops and wire it into
 * every paint target's shader. Subsequent calls just swap the texture and
 * uniforms without recompiling.
 *
 * @param targets - Prepared multitool paint targets.
 * @param gradientStops - Hex color stops from the active cosmetic option.
 * @param config - Ramp tint strength + detail strength + detail weights.
 */
function applyMultitoolPaintRamp(
  targets: readonly MultitoolPaintMaterialTarget[],
  gradientStops: readonly string[],
  config: MultitoolRampApplyConfig,
): void {
  if (targets.length === 0) return
  const rampTexture = buildPaintRampTexture(gradientStops)
  const bounds = getOrComputeMultitoolRampBounds(targets)
  for (const target of targets) {
    const userData = target.material.userData as { paintRampUniforms?: unknown }
    if (userData.paintRampUniforms) {
      updatePaintRampTexture(target.material, rampTexture)
      setPaintRampStrength(target.material, config.strength, config.detailStrength, 0)
      setPaintRampDetailWeights(target.material, config.detailWeights)
      continue
    }
    applyPaintRampShader(target.material, {
      rampTexture,
      axis: MULTITOOL_PAINT_RAMP_AXIS,
      axisBounds: bounds,
      strength: config.strength,
      meshToVehicleLocal: target.meshToVehicleLocal,
      detailStrength: config.detailStrength,
      detailWeights: config.detailWeights,
    })
  }
}

/**
 * Lazily compute and cache the multitool's vehicle-local Y bounds.
 *
 * @param targets - Multitool paint targets.
 */
function getOrComputeMultitoolRampBounds(
  targets: readonly MultitoolPaintMaterialTarget[],
): PaintRampBounds {
  const cached = multitoolRampBoundsCache.get(targets)
  if (cached) return cached
  const bounds = computePaintRampBounds(
    targets.map((target) => ({
      geometry: target.geometry,
      meshToVehicleLocal: target.meshToVehicleLocal,
    })),
    MULTITOOL_PAINT_RAMP_AXIS,
  )
  multitoolRampBoundsCache.set(targets, bounds)
  return bounds
}

/**
 * Apply the active multitool paint row from a profile snapshot.
 *
 * @param targets - Prepared multitool paint material targets.
 * @param profile - Player profile carrying active cosmetics.
 */
export function applyMultitoolPaintMaterialsFromProfile(
  targets: readonly MultitoolPaintMaterialTarget[],
  profile: PlayerProfile,
): void {
  applyMultitoolPaintMaterials(targets, getPlayerCosmetics(profile).multitoolPaintjobId)
}

/**
 * Return the paint channel for a multitool node name.
 *
 * @param objectName - Object name from `public/models/multitool.glb`.
 */
export function getMultitoolPaintChannelForObjectName(
  objectName: string,
): MultitoolPaintChannel | null {
  if (MULTITOOL_EXCLUDED_NODES.has(objectName)) return null
  if (objectName === MULTITOOL_BODY_NODE) return 'primary'
  if (objectName === MULTITOOL_TRIGGER_NODE) return 'secondary'
  if (objectName === MULTITOOL_TRIGGER_LOCK_NODE) return 'trim'
  return null
}

/**
 * Read a material albedo color when the Three material type exposes one.
 *
 * @param material - Three.js material candidate.
 */
export function getMultitoolMaterialColor(material: THREE.Material): THREE.Color | null {
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
 * Clone one multitool material and append it to the paint target list when colorable.
 *
 * @param material - Source GLB material.
 * @param mesh - Mesh that owns the material (used for ramp transform + geometry).
 * @param vehicleRoot - Loaded multitool scene root used as the ramp reference frame.
 * @param channel - Multitool paint channel selected from the mesh name.
 * @param targets - Mutable target list owned by the caller.
 */
function cloneAndCollectMultitoolPaintMaterial(
  material: THREE.Material,
  mesh: THREE.Mesh,
  vehicleRoot: THREE.Object3D,
  channel: MultitoolPaintChannel,
  targets: MultitoolPaintMaterialTarget[],
): THREE.Material {
  const cloned = material.clone()
  const baseColor = getMultitoolMaterialColor(cloned)
  if (baseColor) {
    targets.push({
      material: cloned,
      baseColor: baseColor.clone(),
      channel,
      geometry: mesh.geometry,
      meshToVehicleLocal: computeMeshToVehicleLocal(mesh, vehicleRoot),
      stockPbr: captureMultitoolStockPbr(cloned),
    })
  }
  return cloned
}

/**
 * Mix one paint color into a material while preserving some authored albedo
 * (Fleet Issue only). Lerps from the captured authored color to the catalog
 * stop at {@link MULTITOOL_PAINT_COLOR_STRENGTH_TINT}.
 *
 * @param material - Material to mutate.
 * @param baseColor - Captured pre-paint color.
 * @param paintColor - Cosmetic shader color for the material's channel.
 */
function applyMultitoolMaterialPaintColorTint(
  material: THREE.Material,
  baseColor: THREE.Color,
  paintColor: THREE.Color,
): void {
  const color = getMultitoolMaterialColor(material)
  if (!color) return
  color.copy(baseColor).lerp(paintColor, MULTITOOL_PAINT_COLOR_STRENGTH_TINT)
  material.needsUpdate = true
}

/**
 * Replace-mode color: full override at
 * {@link MULTITOOL_PAINT_COLOR_STRENGTH_REPLACE} after pushing HSL saturation
 * by {@link MULTITOOL_PAINT_SATURATION_BOOST}. Keeps paid paints from going
 * muddy through the ACES tonemap.
 *
 * @param material - Material to mutate.
 * @param paintColor - Cosmetic shader color for the material's channel.
 */
function applyMultitoolMaterialPaintColorReplace(
  material: THREE.Material,
  paintColor: THREE.Color,
): void {
  const color = getMultitoolMaterialColor(material)
  if (!color) return
  const boosted = paintColor.clone()
  pushMultitoolColorSaturation(boosted, MULTITOOL_PAINT_SATURATION_BOOST)
  color.copy(boosted).multiplyScalar(MULTITOOL_PAINT_COLOR_STRENGTH_REPLACE)
  material.needsUpdate = true
}

/** Reusable HSL bag — avoids one allocation per material per paint apply. */
const MULTITOOL_PAINT_HSL_BAG = { h: 0, s: 0, l: 0 }

/**
 * Push a color's HSL saturation by `amount` (clamped to `[0, 1]`). No-op for
 * pure greys (S = 0) so neutral hardware stays unbiased.
 *
 * @param color - Color mutated in place.
 * @param amount - Additive saturation delta in `[0, 1]`.
 */
function pushMultitoolColorSaturation(color: THREE.Color, amount: number): void {
  const hsl = color.getHSL(MULTITOOL_PAINT_HSL_BAG)
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
function applyMultitoolChannelFinish(
  target: MultitoolPaintMaterialTarget,
  profile: CosmeticFinishProfile | undefined,
): void {
  const channelBlock = profile?.[target.channel]
  const defaultBlock = profile?.default
  const merged: CosmeticFinishChannel = { ...defaultBlock, ...channelBlock }
  applyMultitoolStandardPbr(target, merged)
  applyMultitoolEmissive(target, merged)
}

/**
 * Apply `metalness` / `roughness` / `envMapIntensity` to materials whose class
 * exposes those fields. Fields not declared in the merged finish fall back to
 * {@link MULTITOOL_PAINT_FINISH_FALLBACK}.
 *
 * @param target - Prepared paint target.
 * @param finish - Resolved (default + channel) finish block.
 */
function applyMultitoolStandardPbr(
  target: MultitoolPaintMaterialTarget,
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
  material.metalness = finish.metalness ?? MULTITOOL_PAINT_FINISH_FALLBACK.metalness
  material.roughness = finish.roughness ?? MULTITOOL_PAINT_FINISH_FALLBACK.roughness
  material.envMapIntensity =
    finish.envMapIntensity ?? MULTITOOL_PAINT_FINISH_FALLBACK.envMapIntensity
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
function applyMultitoolEmissive(
  target: MultitoolPaintMaterialTarget,
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
 * Restore every authored PBR field captured at clone time. Used by Fleet
 * Issue so the multitool reverts to its tuned authored finish rather than
 * carrying over a paid paint's metallic personality across a swap.
 *
 * @param target - Prepared paint target.
 */
function restoreMultitoolStockPbr(target: MultitoolPaintMaterialTarget): void {
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
 * Snapshot the authored PBR fields exposed by a material so Fleet Issue can
 * restore them later. Fields that aren't on the material's class come back
 * as `null`.
 *
 * @param material - Material to introspect.
 */
function captureMultitoolStockPbr(material: THREE.Material): MultitoolStockPbr {
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
