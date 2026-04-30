/**
 * PBR interior materials for the procedural bunker: loads WebP sets from
 * `public/textures/{ceiling,floor,concrete,foam,blackwall}` (produced by
 * `bun run textures:build`) and builds {@link THREE.MeshStandardMaterial}
 * instances with {@link THREE.BackSide} for interior box geometry.
 *
 * Surface assignment:
 * - `ceiling` — every room ceiling (roof mesh)
 * - `floor` — every floor mesh
 * - `concrete` — antechamber / foyer walls + east/west enemy staging rooms (vault / wave spawns)
 * - `foam` — loot (reward) room walls only
 * - `blackwall` — connector corridor walls only (arena vertical shell is matte black in geometry)
 *
 * @author guinetik
 * @date 2026-04-28
 * @spec docs/superpowers/specs/2026-04-27-bunker-mission-design.md
 */
import * as THREE from 'three'

import { applyBunkerMeshStandardSpecularSoften } from '@/three/bunker/bunkerMeshStandardSpecularSoften'

/** URL prefix for packed sets under `public/textures/`. */
const BUNKER_TEX = '/textures'
/**
 * Anisotropic cap for packed atlases on floor and walls. Using the GPU max (~16) on large
 * interior faces is expensive while strafing/turning; 4 stays acceptable horizontally.
 */
const BUNKER_TEXTURE_MAX_ANISOTROPY = 4
/**
 * Ceiling panels are heavily oblique — a bit extra filtering restores edge sharpness without
 * matching the global 16-cap cost on every wall batch.
 */
export const BUNKER_TEXTURE_CEILING_MAP_ANISOTROPY = 8

/**
 * Texture cycles per **world meter** on each UV axis (`repeat = metersAlongAxis × cyclesPerMeter`).
 * Each category uses its own knobs so floors, ceilings, and walls tune independently.
 */
export const BUNKER_TILE_FLOOR_CYCLES_PER_METER = 0.5
/**
 * Ceiling atlas scale. `0.05` under-tiled small rooms (&lt;1 repeat on ~12 m spans). `0.12`
 * yields ~1.5–3 repeats in foyer-sized volumes while staying ~10 repeats across the arena.
 */
export const BUNKER_TILE_CEILING_CYCLES_PER_METER = 0.03
/** Vertical wall shells (foyer foam, blackwall, concrete). */
export const BUNKER_TILE_WALL_CYCLES_PER_METER = 0.05

/**
 * Aggregated materials + shared dispose for GPU cleanup.
 */
export interface BunkerInteriorMaterialSet {
  /**
   * Shared across every floor `BoxGeometry` — `public/textures/floor/*.webp`.
   */
  floor: THREE.MeshStandardMaterial
  /**
   * Shared across every ceiling `BoxGeometry` — `public/textures/ceiling/*.webp`.
   */
  ceiling: THREE.MeshStandardMaterial
  /**
   * Foyer antechamber + east/west enemy staging room walls — `public/textures/concrete/*.webp`.
   */
  wallFoyer: THREE.MeshStandardMaterial
  /**
   * Loot-room vertical surfaces only — `public/textures/foam/*.webp`.
   */
  wallLoot: THREE.MeshStandardMaterial
  /** Corridor connector shell — `public/textures/blackwall/*.webp` only (arena shell is separate matte). */
  wallDefault: THREE.MeshStandardMaterial
  /**
   * Disposes all materials and their texture maps. Safe to call once when
   * tearing down {@link BunkerSceneController}.
   */
  dispose: () => void
}

/**
 * Loads one sRGB/albedo texture with repeat wrapping preset for bunker boxes.
 *
 * @param url - Absolute path under site root (e.g. `/textures/floor/color.webp`).
 */
function configureLoadedTexture(tex: THREE.Texture): void {
  tex.wrapS = THREE.RepeatWrapping
  tex.wrapT = THREE.RepeatWrapping
  tex.repeat.set(1, 1)
  tex.generateMipmaps = true
  tex.minFilter = THREE.LinearMipmapLinearFilter
  tex.magFilter = THREE.LinearFilter
  tex.anisotropy = BUNKER_TEXTURE_MAX_ANISOTROPY
}

/**
 * Clones a loader texture so each mesh can set its own `repeat` without sharing.
 *
 * @param tex - Source map (typically from a template material).
 * @param repeatU - Desired repeat factor on texture U (matches Three.js uv.x scale).
 * @param repeatV - Desired repeat factor on texture V.
 */
export function cloneTextureWithRepeat(
  tex: THREE.Texture | null | undefined,
  repeatU: number,
  repeatV: number,
  /** When omitted, uses {@link BUNKER_TEXTURE_MAX_ANISOTROPY}; ceilings pass {@link BUNKER_TEXTURE_CEILING_MAP_ANISOTROPY}. */
  anisotropyMax?: number,
): THREE.Texture | null {
  if (!tex) return null
  const c = tex.clone()
  c.repeat.set(repeatU, repeatV)
  c.wrapS = THREE.RepeatWrapping
  c.wrapT = THREE.RepeatWrapping
  c.anisotropy = anisotropyMax ?? BUNKER_TEXTURE_MAX_ANISOTROPY
  c.needsUpdate = true
  return c
}

/**
 * Clones template PBR maps with the same UV repeat across every slot — used after
 * world-space extents are folded into `(repeatU, repeatV)` in {@link buildBunkerGeometry}.
 *
 * @param template - Shared loader material (textures at repeat `[1,1]`).
 * @param repeatU - Full multiplicative repeat for U.
 * @param repeatV - Full multiplicative repeat for V.
 * @param mapAnisotropyMax - Oblique ceiling faces use {@link BUNKER_TEXTURE_CEILING_MAP_ANISOTROPY}.
 */
export function createBunkerTiledInteriorMaterialFromTemplate(
  template: THREE.MeshStandardMaterial,
  repeatU: number,
  repeatV: number,
  mapAnisotropyMax?: number,
): THREE.MeshStandardMaterial {
  const aniso = mapAnisotropyMax
  const m = template.clone()
  m.map = cloneTextureWithRepeat(template.map, repeatU, repeatV, aniso)
  m.normalMap = cloneTextureWithRepeat(template.normalMap, repeatU, repeatV, aniso)
  m.roughnessMap = cloneTextureWithRepeat(template.roughnessMap, repeatU, repeatV, aniso)

  if (template.metalnessMap != null) {
    const cloned = cloneTextureWithRepeat(template.metalnessMap, repeatU, repeatV, aniso)
    if (cloned) m.metalnessMap = cloned
  }
  if (template.aoMap != null) {
    const cloned = cloneTextureWithRepeat(template.aoMap, repeatU, repeatV, aniso)
    if (cloned) m.aoMap = cloned
  }
  if (template.emissiveMap != null) {
    const cloned = cloneTextureWithRepeat(template.emissiveMap, repeatU, repeatV, aniso)
    if (cloned) m.emissiveMap = cloned
  }

  return m
}

/**
 * Releases GPU textures on a tiled mesh instance created from {@link createBunkerTiledInteriorMaterialFromTemplate}.
 *
 * @param mat - Per-mesh material clone (not the shared template).
 */
export function disposeBunkerTiledInteriorMaterialInstance(mat: THREE.MeshStandardMaterial): void {
  mat.map?.dispose()
  mat.normalMap?.dispose()
  mat.roughnessMap?.dispose()
  mat.metalnessMap?.dispose()
  mat.aoMap?.dispose()
  mat.emissiveMap?.dispose()
  mat.dispose()
}

/**
 * Promise wrapper around {@link THREE.TextureLoader}.
 *
 * @param url - Path passed to the loader.
 * @param colorSpace - sRGB for color/emissive; linear for data maps.
 */
function loadTexture(url: string, colorSpace: THREE.ColorSpace): Promise<THREE.Texture> {
  return new Promise((resolve, reject) => {
    const loader = new THREE.TextureLoader()
    loader.load(
      url,
      (tex) => {
        tex.colorSpace = colorSpace
        configureLoadedTexture(tex)
        resolve(tex)
      },
      undefined,
      reject,
    )
  })
}

/**
 * Optional linear data map — resolves `null` if the image fails (404).
 *
 * @param url - Candidate map path.
 */
async function loadOptionalLinear(url: string): Promise<THREE.Texture | null> {
  try {
    return await loadTexture(url, THREE.NoColorSpace)
  } catch {
    return null
  }
}

/**
 * Same as {@link loadOptionalLinear} but for sRGB emissive overlays.
 *
 * @param url - Candidate `emission.webp` path under `public/`.
 */
async function loadOptionalSrgb(url: string): Promise<THREE.Texture | null> {
  try {
    return await loadTexture(url, THREE.SRGBColorSpace)
  } catch {
    return null
  }
}

/**
 * Disposes a standard material and every map reference that was assigned.
 *
 * @param mat - Material to tear down.
 */
function disposeStandardMaterialMaps(mat: THREE.MeshStandardMaterial): void {
  mat.map?.dispose()
  mat.normalMap?.dispose()
  mat.roughnessMap?.dispose()
  mat.metalnessMap?.dispose()
  mat.aoMap?.dispose()
  mat.emissiveMap?.dispose()
  mat.dispose()
}

/**
 * Authoring knobs for {@link loadPbrInteriorMaterial}.
 */
interface BunkerPbrFolderSpec {
  /** Subfolder under `public/textures` (e.g. `floor`, `blackwall`). */
  folderName: string
  /** Use `normalgl.webp` instead of `normal.webp` when the pack ships GL-style normals. */
  normalMapBase?: 'normal' | 'normalgl'
  /** Load `emission.webp` where present (ceiling accents). */
  includeEmissive?: boolean
}

/**
 * Loads color + normal + roughness + optional ao/metalness/emissive and builds one
 * interior {@link THREE.MeshStandardMaterial}.
 *
 * @param spec - Subfolder + optional normal basename override.
 */
async function loadPbrInteriorMaterial(
  spec: BunkerPbrFolderSpec,
): Promise<THREE.MeshStandardMaterial> {
  const prefix = `${BUNKER_TEX}/${spec.folderName}`
  const normalName = spec.normalMapBase === 'normalgl' ? 'normalgl' : 'normal'

  const [colorMap, normalMap, roughnessMap, aoMap, metalnessMap, emissiveMap] = await Promise.all([
    loadTexture(`${prefix}/color.webp`, THREE.SRGBColorSpace),
    loadTexture(`${prefix}/${normalName}.webp`, THREE.NoColorSpace),
    loadTexture(`${prefix}/roughness.webp`, THREE.NoColorSpace),
    loadOptionalLinear(`${prefix}/ao.webp`),
    loadOptionalLinear(`${prefix}/metalness.webp`),
    spec.includeEmissive ? loadOptionalSrgb(`${prefix}/emission.webp`) : Promise.resolve(null),
  ])

  const params: THREE.MeshStandardMaterialParameters = {
    map: colorMap,
    normalMap,
    roughnessMap,
    roughness: 1,
    metalness: metalnessMap ? 1 : 0,
    emissive: emissiveMap ? new THREE.Color(0xffffff) : new THREE.Color(0x000000),
    emissiveIntensity: emissiveMap ? 0.85 : 0,
    side: THREE.BackSide,
  }
  if (aoMap) params.aoMap = aoMap
  if (metalnessMap) params.metalnessMap = metalnessMap
  if (emissiveMap) params.emissiveMap = emissiveMap

  return new THREE.MeshStandardMaterial(params)
}

/**
 * Raise anisotropic filtering on every packed map for the shared ceiling template so
 * undistorted UVs at repeat `[1,1]` preview with the same filtering as tiled clones.
 *
 * @param mat - Loaded `ceiling` template from {@link loadPbrInteriorMaterial}.
 */
function applyCeilingPackedTemplateAnisotropy(mat: THREE.MeshStandardMaterial): void {
  const cap = BUNKER_TEXTURE_CEILING_MAP_ANISOTROPY
  for (const tex of [
    mat.map,
    mat.normalMap,
    mat.roughnessMap,
    mat.metalnessMap,
    mat.aoMap,
    mat.emissiveMap,
  ]) {
    if (tex) tex.anisotropy = cap
  }
}

/**
 * Loads all five interior material families used by {@link buildBunkerGeometry}.
 *
 * @returns Bundle with a single `dispose()` that frees GPU memory for every map.
 */
export async function loadBunkerInteriorMaterials(): Promise<BunkerInteriorMaterialSet> {
  const [floor, ceiling, wallFoyer, wallLoot, wallDefault] = await Promise.all([
    loadPbrInteriorMaterial({ folderName: 'floor' }),
    loadPbrInteriorMaterial({
      folderName: 'ceiling',
      normalMapBase: 'normalgl',
      includeEmissive: true,
    }),
    loadPbrInteriorMaterial({ folderName: 'concrete' }),
    loadPbrInteriorMaterial({ folderName: 'foam' }),
    loadPbrInteriorMaterial({ folderName: 'blackwall' }),
  ])

  applyCeilingPackedTemplateAnisotropy(ceiling)

  /** Main corridor / arena shell — blackwall gloss reads hot under helmet light. */
  const BUNKER_BLACKWALL_SPECULAR_ROUGHNESS_MIX = 0.72
  /** Tames bright metal-weighted texels on the same set. */
  const BUNKER_BLACKWALL_METALNESS_POST_SCALE = 0.28
  applyBunkerMeshStandardSpecularSoften(wallDefault, {
    roughnessMixTowardMatte: BUNKER_BLACKWALL_SPECULAR_ROUGHNESS_MIX,
    metalnessResponseScale: BUNKER_BLACKWALL_METALNESS_POST_SCALE,
  })

  return {
    floor,
    ceiling,
    wallFoyer,
    wallLoot,
    wallDefault,
    dispose: () => {
      disposeStandardMaterialMaps(floor)
      disposeStandardMaterialMaps(ceiling)
      disposeStandardMaterialMaps(wallFoyer)
      disposeStandardMaterialMaps(wallLoot)
      disposeStandardMaterialMaps(wallDefault)
    },
  }
}

/**
 * Solid-color {@link THREE.MeshStandardMaterial}s for unit tests — no texture fetches.
 * Matches {@link BunkerInteriorMaterialSet} roles for {@link BunkerSceneController}.
 *
 * @returns Bundle whose `dispose()` is a no-op (nothing GPU-allocated).
 */
export function createTestBunkerInteriorMaterialSet(): BunkerInteriorMaterialSet {
  const side = THREE.BackSide
  const floor = new THREE.MeshStandardMaterial({ color: 0x2a2a2a, side })
  const ceiling = new THREE.MeshStandardMaterial({ color: 0x1a1a20, side })
  const wallFoyer = new THREE.MeshStandardMaterial({ color: 0x555555, side })
  const wallLoot = new THREE.MeshStandardMaterial({ color: 0x6644aa, side })
  const wallDefault = new THREE.MeshStandardMaterial({ color: 0x111111, side })
  return {
    floor,
    ceiling,
    wallFoyer,
    wallLoot,
    wallDefault,
    dispose: () => {
      floor.dispose()
      ceiling.dispose()
      wallFoyer.dispose()
      wallLoot.dispose()
      wallDefault.dispose()
    },
  }
}
