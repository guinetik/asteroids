/**
 * Post-processing pass for slingshot speed lines effect.
 *
 * Renders radial streaks emanating from the screen center, giving a
 * sense of velocity during the slingshot burst settle phase. Intensity
 * fades out as the burst settles (progress 0→1).
 *
 * @author guinetik
 * @date 2026-04-06
 * @spec docs/superpowers/specs/2026-04-06-navigation-feel-design.md
 */
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js'
import fullscreenQuadVertexShader from '@/three/shaders/postprocessing/fullscreenQuad.vert.glsl?raw'
import slingshotSpeedFragmentShader from '@/three/shaders/postprocessing/slingshotSpeed.frag.glsl?raw'

/**
 * Creates a ShaderPass for radial speed lines during slingshot burst.
 *
 * Caller updates `pass.uniforms.intensity.value` each frame (0 = off, 1 = full).
 * The `time` uniform should be incremented for animation.
 */
export function createSlingshotSpeedPass(): ShaderPass {
  const shader = {
    uniforms: {
      tDiffuse: { value: null },
      intensity: { value: 0 },
      time: { value: 0 },
    },
    vertexShader: fullscreenQuadVertexShader,
    fragmentShader: slingshotSpeedFragmentShader,
  }

  return new ShaderPass(shader)
}
