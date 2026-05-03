/**
 * Runtime lander paint channel mapping for the Pimp My Shuttle cosmetic shop.
 *
 * @author guinetik
 * @date 2026-04-30
 * @spec docs/superpowers/specs/2026-04-30-cosmetic-shader-model-mapping.md
 */

import { findCosmeticOptionById } from '@/lib/cosmetics/catalog'
import { getPlayerCosmetics } from '@/lib/cosmetics/profileCosmetics'
import type { PlayerProfile } from '@/lib/player/types'
import * as THREE from 'three'

/** Lander paint channel inferred from GLB mesh names. */
export type LanderPaintChannel = 'primary' | 'secondary' | 'trim' | 'engine'

/**
 * A cloned material and its original color, bound to one lander paint channel.
 */
export interface LanderPaintMaterialTarget {
  /** Material instance assigned to a visible lander mesh. */
  readonly material: THREE.Material
  /** Color captured before the cosmetic paint mix was applied. */
  readonly baseColor: THREE.Color
  /** Shader channel selected from the source mesh/object name. */
  readonly channel: LanderPaintChannel
}

/** Cosmetic color mix strength over the authored lander albedo. */
const LANDER_PAINT_COLOR_STRENGTH = 0.86

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
    normalized.startsWith('extras lunar lander')
  ) {
    return 'secondary'
  }

  if (
    normalized.startsWith('antennas lunar lander') ||
    normalized.startsWith('antennas side lunar lander')
  ) {
    return 'trim'
  }

  if (
    normalized.startsWith('thruster lunar lander') ||
    normalized.startsWith('thrusters lunar lander')
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
  const targets: LanderPaintMaterialTarget[] = []
  root.traverse((child) => {
    if (!(child instanceof THREE.Mesh) || !child.material) return
    const channel = getLanderPaintChannelForObjectName(child.name)
    if (!channel) return

    if (Array.isArray(child.material)) {
      child.material = child.material.map((material) =>
        cloneAndCollectLanderPaintMaterial(material, channel, targets),
      )
      return
    }

    child.material = cloneAndCollectLanderPaintMaterial(child.material, channel, targets)
  })
  return targets
}

/**
 * Record one already-cloned material as a lander paint target.
 *
 * @param material - Material instance assigned to the mesh.
 * @param channel - Paint channel selected from the mesh name.
 * @param targets - Mutable target list owned by the caller.
 */
export function collectLanderPaintMaterial(
  material: THREE.Material,
  channel: LanderPaintChannel,
  targets: LanderPaintMaterialTarget[],
): void {
  const baseColor = getMaterialColor(material)
  if (!baseColor) return
  targets.push({ material, baseColor: baseColor.clone(), channel })
}

/**
 * Apply a lander paint catalog option directly to prepared material targets.
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

  for (const target of targets) {
    applyMaterialPaintColor(
      target.material,
      target.baseColor,
      {
        primary,
        secondary,
        trim,
        engine,
      }[target.channel],
    )
  }
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
 * @param channel - Lander paint channel selected from the mesh name.
 * @param targets - Mutable target list owned by the caller.
 */
function cloneAndCollectLanderPaintMaterial(
  material: THREE.Material,
  channel: LanderPaintChannel,
  targets: LanderPaintMaterialTarget[],
): THREE.Material {
  const cloned = material.clone()
  collectLanderPaintMaterial(cloned, channel, targets)
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
  const color = getMaterialColor(material)
  if (!color) return
  color.copy(baseColor).lerp(paintColor, LANDER_PAINT_COLOR_STRENGTH)
  material.needsUpdate = true
}
