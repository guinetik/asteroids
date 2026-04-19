import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js'
import fullscreenQuadVertexShader from '@/three/shaders/postprocessing/fullscreenQuad.vert.glsl?raw'
import gravitySurfFragmentShader from '@/three/shaders/postprocessing/gravitySurf.frag.glsl?raw'

/** Full-screen pass that tints the map during gravity-surf coupling / cruise. */
export function createGravitySurfPass(): ShaderPass {
  const shader = {
    uniforms: {
      tDiffuse: { value: null },
      intensity: { value: 0 },
      time: { value: 0 },
    },
    vertexShader: fullscreenQuadVertexShader,
    fragmentShader: gravitySurfFragmentShader,
  }

  return new ShaderPass(shader)
}
