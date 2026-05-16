/**
 * Station material overlays.
 *
 * Keeps authored station GLB materials intact, then blends rusted/damaged
 * PBR texture sets over their UVs so derelict layouts can share geometry
 * while reading as damaged and abandoned.
 *
 * @author guinetik
 * @date 2026-05-15
 * @spec docs/superpowers/specs/2026-05-12-yamada-station-interior-design.md
 */
import * as THREE from 'three'

/** Public texture directory for rusted station wall overlays. */
const RUSTED_TEXTURE_DIR = '/textures/rusted'
/** Public texture directory for damaged station floor/ceiling overlays. */
const DAMAGED_TEXTURE_DIR = '/textures/damaged'
/** Public texture directory for derelict metal door overlays. */
const METAL_TEXTURE_DIR = '/textures/metal'
/** Texture repeat over one station piece. */
const OVERLAY_TEXTURE_REPEAT = 1
/** Color overlay strength for rusted wall damage. */
const RUSTED_WALL_COLOR_STRENGTH = 0.92
/** Roughness blend strength for rusted wall damage. */
const RUSTED_WALL_ROUGHNESS_STRENGTH = 0.9
/** Metalness blend strength for rusted wall damage. */
const RUSTED_WALL_METALNESS_STRENGTH = 0.35
/** Normal-map contribution strength for rusted wall damage. */
const RUSTED_WALL_NORMAL_SCALE = 1.35
/** Color overlay strength for damaged floor/ceiling tiles. */
const DAMAGED_TILE_COLOR_STRENGTH = 0.92
/** Roughness blend strength for damaged floor/ceiling tiles. */
const DAMAGED_TILE_ROUGHNESS_STRENGTH = 0.9
/** Metalness blend strength for damaged floor/ceiling tiles. */
const DAMAGED_TILE_METALNESS_STRENGTH = 0.75
/** Normal-map contribution strength for damaged floor/ceiling tiles. */
const DAMAGED_TILE_NORMAL_SCALE = 1.2
/** Color overlay strength for derelict metal doors. */
const METAL_DOOR_COLOR_STRENGTH = 0
/** Roughness blend strength for derelict metal doors. */
const METAL_DOOR_ROUGHNESS_STRENGTH = 0.85
/** Metalness blend strength for derelict metal doors. */
const METAL_DOOR_METALNESS_STRENGTH = 0.12
/** Normal-map contribution strength for derelict metal doors. */
const METAL_DOOR_NORMAL_SCALE = 1.15

/** PBR texture set used by the rusted wall overlay shader. */
export interface RustedWallOverlayTextures {
  /** Color/damage overlay map, sampled in sRGB space. */
  colorMap: THREE.Texture
  /** Tangent-space normal map for damaged panels. */
  normalMap: THREE.Texture
  /** Roughness map for dirty metal/plastic surfaces. */
  roughnessMap: THREE.Texture
  /** Metalness map for exposed rusted metal panels. */
  metalnessMap: THREE.Texture
}

/** PBR texture set used by the damaged floor/ceiling overlay shader. */
export interface DamagedTileOverlayTextures {
  /** Color/damage overlay map, sampled in sRGB space. */
  colorMap: THREE.Texture
  /** Tangent-space normal map for scraped tiles. */
  normalMap: THREE.Texture
  /** Roughness map for dusty, worn tile surfaces. */
  roughnessMap: THREE.Texture
  /** Metalness map for exposed damaged metal bands. */
  metalnessMap: THREE.Texture
}

/** PBR texture set used by the derelict metal door overlay shader. */
export interface MetalDoorOverlayTextures {
  /** Color metal overlay map, sampled in sRGB space. */
  colorMap: THREE.Texture
  /** Tangent-space normal map for dented/scraped metal. */
  normalMap: THREE.Texture
  /** Roughness map for worn metal surfaces. */
  roughnessMap: THREE.Texture
  /** Metalness map for exposed metal panels. */
  metalnessMap: THREE.Texture
}

/** Runtime parameters for one station material overlay recipe. */
interface StationMaterialOverlayRecipe {
  /** Color/damage overlay map, sampled in sRGB space. */
  colorMap: THREE.Texture
  /** Tangent-space normal map. */
  normalMap: THREE.Texture
  /** Roughness map. */
  roughnessMap: THREE.Texture
  /** Optional ambient-occlusion map. */
  aoMap?: THREE.Texture
  /** Optional metalness map. */
  metalnessMap?: THREE.Texture
  /** Color overlay strength. */
  colorStrength: number
  /** Roughness blend strength. */
  roughnessStrength: number
  /** Ambient-occlusion blend strength. */
  aoStrength: number
  /** Metalness blend strength. */
  metalnessStrength: number
  /** Normal-map contribution strength. */
  normalScale: number
}

let rustedWallOverlayTextures: RustedWallOverlayTextures | null = null
let damagedTileOverlayTextures: DamagedTileOverlayTextures | null = null
let metalDoorOverlayTextures: MetalDoorOverlayTextures | null = null

/**
 * Configure one station overlay texture.
 *
 * @param texture - Texture to configure.
 * @param colorSpace - Texture color space.
 */
function configureOverlayTexture(texture: THREE.Texture, colorSpace: THREE.ColorSpace): void {
  texture.colorSpace = colorSpace
  texture.wrapS = THREE.RepeatWrapping
  texture.wrapT = THREE.RepeatWrapping
  texture.repeat.set(OVERLAY_TEXTURE_REPEAT, OVERLAY_TEXTURE_REPEAT)
  texture.anisotropy = 4
}

/**
 * Load and cache the rusted wall overlay PBR texture set.
 *
 * @returns Cached rusted wall overlay textures.
 */
export async function loadRustedWallOverlayTextures(): Promise<RustedWallOverlayTextures> {
  if (rustedWallOverlayTextures) return rustedWallOverlayTextures
  const loader = new THREE.TextureLoader()
  const [colorMap, normalMap, roughnessMap, metalnessMap] = await Promise.all([
    loader.loadAsync(`${RUSTED_TEXTURE_DIR}/color.webp`),
    loader.loadAsync(`${RUSTED_TEXTURE_DIR}/normal.webp`),
    loader.loadAsync(`${RUSTED_TEXTURE_DIR}/roughness.webp`),
    loader.loadAsync(`${RUSTED_TEXTURE_DIR}/metalness.webp`),
  ])

  configureOverlayTexture(colorMap, THREE.SRGBColorSpace)
  configureOverlayTexture(normalMap, THREE.NoColorSpace)
  configureOverlayTexture(roughnessMap, THREE.NoColorSpace)
  configureOverlayTexture(metalnessMap, THREE.NoColorSpace)

  rustedWallOverlayTextures = { colorMap, normalMap, roughnessMap, metalnessMap }
  return rustedWallOverlayTextures
}

/**
 * Load and cache the damaged floor/ceiling overlay PBR texture set.
 *
 * @returns Cached damaged tile overlay textures.
 */
export async function loadDamagedTileOverlayTextures(): Promise<DamagedTileOverlayTextures> {
  if (damagedTileOverlayTextures) return damagedTileOverlayTextures
  const loader = new THREE.TextureLoader()
  const [colorMap, normalMap, roughnessMap, metalnessMap] = await Promise.all([
    loader.loadAsync(`${DAMAGED_TEXTURE_DIR}/color.webp`),
    loader.loadAsync(`${DAMAGED_TEXTURE_DIR}/normal.webp`),
    loader.loadAsync(`${DAMAGED_TEXTURE_DIR}/roughness.webp`),
    loader.loadAsync(`${DAMAGED_TEXTURE_DIR}/metalness.webp`),
  ])

  configureOverlayTexture(colorMap, THREE.SRGBColorSpace)
  configureOverlayTexture(normalMap, THREE.NoColorSpace)
  configureOverlayTexture(roughnessMap, THREE.NoColorSpace)
  configureOverlayTexture(metalnessMap, THREE.NoColorSpace)

  damagedTileOverlayTextures = { colorMap, normalMap, roughnessMap, metalnessMap }
  return damagedTileOverlayTextures
}

/**
 * Load and cache the derelict metal door overlay PBR texture set.
 *
 * @returns Cached metal door overlay textures.
 */
export async function loadMetalDoorOverlayTextures(): Promise<MetalDoorOverlayTextures> {
  if (metalDoorOverlayTextures) return metalDoorOverlayTextures
  const loader = new THREE.TextureLoader()
  const [colorMap, normalMap, roughnessMap, metalnessMap] = await Promise.all([
    loader.loadAsync(`${METAL_TEXTURE_DIR}/color.webp`),
    loader.loadAsync(`${METAL_TEXTURE_DIR}/normal.webp`),
    loader.loadAsync(`${METAL_TEXTURE_DIR}/roughness.webp`),
    loader.loadAsync(`${METAL_TEXTURE_DIR}/metalness.webp`),
  ])

  configureOverlayTexture(colorMap, THREE.SRGBColorSpace)
  configureOverlayTexture(normalMap, THREE.NoColorSpace)
  configureOverlayTexture(roughnessMap, THREE.NoColorSpace)
  configureOverlayTexture(metalnessMap, THREE.NoColorSpace)

  metalDoorOverlayTextures = { colorMap, normalMap, roughnessMap, metalnessMap }
  return metalDoorOverlayTextures
}

/**
 * Apply a rusted wall overlay shader to every standard material in a wall GLB.
 *
 * @param root - Root object of the loaded wall GLB.
 * @param textures - Rusted overlay PBR texture set.
 */
export function applyRustedWallOverlay(
  root: THREE.Object3D,
  textures: RustedWallOverlayTextures,
): void {
  applyOverlayToObject(root, {
    ...textures,
    colorStrength: RUSTED_WALL_COLOR_STRENGTH,
    roughnessStrength: RUSTED_WALL_ROUGHNESS_STRENGTH,
    aoStrength: 0,
    metalnessStrength: RUSTED_WALL_METALNESS_STRENGTH,
    normalScale: RUSTED_WALL_NORMAL_SCALE,
  })
}

/**
 * Apply a damaged tile overlay shader to every standard material in the tile GLB.
 *
 * @param root - Root object of the loaded tile GLB.
 * @param textures - Damaged tile overlay PBR texture set.
 */
export function applyDamagedTileOverlay(
  root: THREE.Object3D,
  textures: DamagedTileOverlayTextures,
): void {
  applyOverlayToObject(root, {
    ...textures,
    colorStrength: DAMAGED_TILE_COLOR_STRENGTH,
    roughnessStrength: DAMAGED_TILE_ROUGHNESS_STRENGTH,
    aoStrength: 0,
    metalnessStrength: DAMAGED_TILE_METALNESS_STRENGTH,
    normalScale: DAMAGED_TILE_NORMAL_SCALE,
  })
}

/**
 * Apply a derelict metal overlay shader to every standard material in a door GLB.
 *
 * @param root - Root object of the loaded door GLB.
 * @param textures - Metal door overlay PBR texture set.
 */
export function applyMetalDoorOverlay(
  root: THREE.Object3D,
  textures: MetalDoorOverlayTextures,
): void {
  applyOverlayToObject(root, {
    ...textures,
    colorStrength: METAL_DOOR_COLOR_STRENGTH,
    roughnessStrength: METAL_DOOR_ROUGHNESS_STRENGTH,
    aoStrength: 0,
    metalnessStrength: METAL_DOOR_METALNESS_STRENGTH,
    normalScale: METAL_DOOR_NORMAL_SCALE,
  })
}

/**
 * Patch every standard material under an object with one overlay recipe.
 *
 * @param root - Root object to traverse.
 * @param recipe - Overlay texture set and blend strengths.
 */
function applyOverlayToObject(root: THREE.Object3D, recipe: StationMaterialOverlayRecipe): void {
  root.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return
    const materials = Array.isArray(obj.material) ? obj.material : [obj.material]
    const patched = materials.map((material) =>
      material instanceof THREE.MeshStandardMaterial
        ? createOverlayMaterial(material, recipe)
        : material,
    )
    obj.material = Array.isArray(obj.material) ? patched : patched[0]!
  })
}

/**
 * Clone and patch a single material so it samples an overlay over base UVs.
 *
 * @param material - Source MeshStandardMaterial from a station GLB.
 * @param recipe - Overlay texture set and blend strengths.
 * @returns Material clone with overlay shader hooks.
 */
function createOverlayMaterial(
  material: THREE.MeshStandardMaterial,
  recipe: StationMaterialOverlayRecipe,
): THREE.MeshStandardMaterial {
  const overlayMaterial = material.clone()
  overlayMaterial.defines = {
    ...overlayMaterial.defines,
    USE_UV: '',
  }
  overlayMaterial.onBeforeCompile = (shader) => {
    shader.uniforms.uStationOverlayColorMap = { value: recipe.colorMap }
    shader.uniforms.uStationOverlayNormalMap = { value: recipe.normalMap }
    shader.uniforms.uStationOverlayRoughnessMap = { value: recipe.roughnessMap }
    shader.uniforms.uStationOverlayAOMap = { value: recipe.aoMap ?? recipe.roughnessMap }
    shader.uniforms.uStationOverlayMetalnessMap = {
      value: recipe.metalnessMap ?? recipe.roughnessMap,
    }
    shader.uniforms.uStationOverlayColorStrength = { value: recipe.colorStrength }
    shader.uniforms.uStationOverlayRoughnessStrength = { value: recipe.roughnessStrength }
    shader.uniforms.uStationOverlayAOStrength = { value: recipe.aoStrength }
    shader.uniforms.uStationOverlayMetalnessStrength = { value: recipe.metalnessStrength }
    shader.uniforms.uStationOverlayNormalScale = { value: recipe.normalScale }

    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <map_pars_fragment>',
      `#include <map_pars_fragment>
uniform sampler2D uStationOverlayColorMap;
uniform sampler2D uStationOverlayNormalMap;
uniform sampler2D uStationOverlayRoughnessMap;
uniform sampler2D uStationOverlayAOMap;
uniform sampler2D uStationOverlayMetalnessMap;
uniform float uStationOverlayColorStrength;
uniform float uStationOverlayRoughnessStrength;
uniform float uStationOverlayAOStrength;
uniform float uStationOverlayMetalnessStrength;
uniform float uStationOverlayNormalScale;`,
    )

    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <map_fragment>',
      `#include <map_fragment>
  vec2 overlayColorUv = vUv;
  vec4 overlayColor = texture2D(uStationOverlayColorMap, overlayColorUv);
  vec3 overlayDamagedColor = mix(
    diffuseColor.rgb * overlayColor.rgb,
    overlayColor.rgb,
    0.35
  );
  diffuseColor.rgb = mix(
    diffuseColor.rgb,
    overlayDamagedColor,
    uStationOverlayColorStrength
  );
`,
    )

    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <roughnessmap_fragment>',
      `#include <roughnessmap_fragment>
  vec2 overlayRoughnessUv = vUv;
  float overlayRoughness = texture2D(uStationOverlayRoughnessMap, overlayRoughnessUv).g;
  roughnessFactor = mix(
    roughnessFactor,
    overlayRoughness,
    uStationOverlayRoughnessStrength
  );
`,
    )

    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <metalnessmap_fragment>',
      `#include <metalnessmap_fragment>
  vec2 overlayMetalnessUv = vUv;
  float overlayMetalness = texture2D(uStationOverlayMetalnessMap, overlayMetalnessUv).b;
  metalnessFactor = mix(
    metalnessFactor,
    overlayMetalness,
    uStationOverlayMetalnessStrength
  );
`,
    )

    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <aomap_fragment>',
      `#include <aomap_fragment>
  vec2 overlayAoUv = vUv;
  float overlayAo = texture2D(uStationOverlayAOMap, overlayAoUv).g;
  reflectedLight.indirectDiffuse *= mix(1.0, overlayAo, uStationOverlayAOStrength);
`,
    )

    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <normal_fragment_maps>',
      `#include <normal_fragment_maps>
  vec2 overlayNormalUv = vUv;
  vec3 overlayNormal = texture2D(uStationOverlayNormalMap, overlayNormalUv).xyz * 2.0 - 1.0;
  normal = normalize(normal + overlayNormal * uStationOverlayNormalScale);
`,
    )
  }
  overlayMaterial.needsUpdate = true
  return overlayMaterial
}
