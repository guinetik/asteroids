/**
 * Post-processing pass for gravitational lensing and chromatic aberration.
 *
 * Warps UV coordinates toward a gravity source's screen position (lensing)
 * and separates RGB channels (chromatic aberration). Both effects scale
 * with a `proximity` uniform (0 = safe, 1 = event horizon).
 *
 * @author guinetik
 * @date 2026-04-05
 * @spec docs/superpowers/specs/2026-04-05-map-gravity-death-design.md
 */
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js'
import * as THREE from 'three'
import fullscreenQuadVertexShader from '@/three/shaders/postprocessing/fullscreenQuad.vert.glsl?raw'
import gravityDistortionFragmentShader from '@/three/shaders/postprocessing/gravityDistortion.frag.glsl?raw'

/**
 * Creates a configured ShaderPass for gravity distortion.
 * Caller updates `pass.uniforms.proximity.value` and
 * `pass.uniforms.sourceUV.value` each frame, and may modulate
 * `pass.uniforms.chromMultiplier.value` to gate the chromatic
 * aberration channel (e.g. shielded vs irradiated state).
 *
 * @param lensStrength - Maximum UV warp magnitude at proximity=1
 * @param chromStrength - Maximum chromatic aberration offset at proximity=1
 */
export function createGravityDistortionPass(
  lensStrength: number,
  chromStrength: number,
): ShaderPass {
  const shader = {
    uniforms: {
      tDiffuse: { value: null as THREE.Texture | null },
      proximity: { value: 0 },
      sourceUV: { value: new THREE.Vector2(0.5, 0.5) },
      lensStrength: { value: lensStrength },
      chromStrength: { value: chromStrength },
      chromMultiplier: { value: 1.0 },
    },
    vertexShader: fullscreenQuadVertexShader,
    fragmentShader: gravityDistortionFragmentShader,
  }

  return new ShaderPass(shader)
}
