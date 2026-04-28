/**
 * Glsl hooks for {@link THREE.MeshStandardMaterial} used on bunker metal and
 * blackwall PBR: packed roughness maps often sample low (glossy), which reads as
 * harsh helmet-lamp hotspots. This mixes roughness toward matte and scales
 * metalness after map sampling without re-authoring textures.
 *
 * @author guinetik
 * @date 2026-04-28
 * @spec docs/superpowers/specs/2026-04-27-bunker-mission-design.md
 */
import * as THREE from 'three'

/**
 * Parameters for {@link applyBunkerMeshStandardSpecularSoften}.
 */
export interface BunkerMeshStandardSpecularSoftenParams {
  /**
   * After `roughnessmap_fragment`, mixes `roughnessFactor` toward 1.0 (fully
   * rough). Example: `0.4` pulls glossy texels strongly toward diffuse.
   */
  roughnessMixTowardMatte: number
  /**
   * After `metalnessmap_fragment`, multiplies `metalnessFactor` (no map = same
   * as scaling the uniform). Use `0.55` to halve metallic spec energy.
   */
  metalnessResponseScale?: number
}

/**
 * Patches the material's fragment shader once; sets `customProgramCacheKey` so
 * programs with different soften values do not collide.
 *
 * @param material - Standard material that already has roughness or metalness maps wired.
 * @param params - Mix and scale; both are optional in spirit but `roughnessMixTowardMatte`
 * is required for a meaningful call.
 */
export function applyBunkerMeshStandardSpecularSoften(
  material: THREE.MeshStandardMaterial,
  params: BunkerMeshStandardSpecularSoftenParams,
): void {
  const mixR = THREE.MathUtils.clamp(params.roughnessMixTowardMatte, 0, 1)
  const mixRStr = mixR.toFixed(6)
  const metalScale = params.metalnessResponseScale
  const hasMetalScale = metalScale !== undefined && metalScale >= 0
  const metalStr = hasMetalScale ? THREE.MathUtils.clamp(metalScale, 0, 2).toFixed(6) : ''

  const cacheKey = `bunker-soften:r${mixRStr}:m${hasMetalScale ? metalStr : 'na'}`

  material.customProgramCacheKey = function customProgramCacheKey() {
    return cacheKey
  }

  material.onBeforeCompile = (shader) => {
    let fs = shader.fragmentShader
    fs = fs.replace(
      '#include <roughnessmap_fragment>',
      `#include <roughnessmap_fragment>
roughnessFactor = mix( roughnessFactor, 1.0, float( ${mixRStr} ) );`,
    )
    if (hasMetalScale) {
      fs = fs.replace(
        '#include <metalnessmap_fragment>',
        `#include <metalnessmap_fragment>
metalnessFactor *= float( ${metalStr} );`,
      )
    }
    shader.fragmentShader = fs
  }
}
