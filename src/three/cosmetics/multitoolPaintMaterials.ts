/**
 * Runtime multitool paint channel mapping for the Pimp My Shuttle cosmetic shop.
 *
 * @author guinetik
 * @date 2026-04-30
 * @spec docs/superpowers/specs/2026-04-30-cosmetic-shader-model-mapping.md
 */

import { findCosmeticOptionById } from '@/lib/cosmetics/catalog'
import { getPlayerCosmetics } from '@/lib/cosmetics/profileCosmetics'
import type { PlayerProfile } from '@/lib/player/types'
import partsJson from '@/data/multitool/identified-parts.json'
import * as THREE from 'three'

/** Multitool paint channel inferred from GLB node names. */
export type MultitoolPaintChannel = 'primary' | 'secondary' | 'trim'

/**
 * A cloned multitool material and its original color, bound to one paint channel.
 */
export interface MultitoolPaintMaterialTarget {
  /** Material instance assigned to a visible multitool mesh. */
  readonly material: THREE.Material
  /** Color captured before the cosmetic paint mix was applied. */
  readonly baseColor: THREE.Color
  /** Shader channel selected from the source node name. */
  readonly channel: MultitoolPaintChannel
}

const MULTITOOL_PAINT_COLOR_STRENGTH = 0.9
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
  const targets: MultitoolPaintMaterialTarget[] = []
  root.traverse((child) => {
    if (!(child instanceof THREE.Mesh) || !child.material) return
    const channel = getMultitoolPaintChannelForObjectName(child.name)
    if (!channel) return

    if (Array.isArray(child.material)) {
      child.material = child.material.map((material) =>
        cloneAndCollectMultitoolPaintMaterial(material, channel, targets),
      )
      return
    }

    child.material = cloneAndCollectMultitoolPaintMaterial(child.material, channel, targets)
  })
  return targets
}

/**
 * Apply a multitool paint catalog option directly to prepared material targets.
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

  for (const target of targets) {
    applyMaterialPaintColor(
      target.material,
      target.baseColor,
      {
        primary,
        secondary,
        trim,
      }[target.channel],
    )
  }
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
 * @param channel - Multitool paint channel selected from the mesh name.
 * @param targets - Mutable target list owned by the caller.
 */
function cloneAndCollectMultitoolPaintMaterial(
  material: THREE.Material,
  channel: MultitoolPaintChannel,
  targets: MultitoolPaintMaterialTarget[],
): THREE.Material {
  const cloned = material.clone()
  const baseColor = getMultitoolMaterialColor(cloned)
  if (baseColor) {
    targets.push({ material: cloned, baseColor: baseColor.clone(), channel })
  }
  return cloned
}

/**
 * Mix one paint color into a material while preserving some authored albedo.
 *
 * @param material - Material to mutate.
 * @param baseColor - Captured pre-paint color.
 * @param paintColor - Cosmetic shader color for the material's channel.
 */
function applyMaterialPaintColor(
  material: THREE.Material,
  baseColor: THREE.Color,
  paintColor: THREE.Color,
): void {
  const materialColor = getMultitoolMaterialColor(material)
  if (!materialColor) return
  materialColor.copy(baseColor).lerp(paintColor, MULTITOOL_PAINT_COLOR_STRENGTH)
  material.needsUpdate = true
}
