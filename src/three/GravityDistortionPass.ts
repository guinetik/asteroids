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

/** Threshold below which effects are invisible — skip shader work. */
const PROXIMITY_EPSILON = 0.001

/**
 * Creates a configured ShaderPass for gravity distortion.
 * Caller updates `pass.uniforms.proximity.value` and
 * `pass.uniforms.sourceUV.value` each frame.
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
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform sampler2D tDiffuse;
      uniform float proximity;
      uniform vec2 sourceUV;
      uniform float lensStrength;
      uniform float chromStrength;
      varying vec2 vUv;

      void main() {
        if (proximity < ${PROXIMITY_EPSILON.toFixed(4)}) {
          gl_FragColor = texture2D(tDiffuse, vUv);
          return;
        }

        // --- Gravitational lensing ---
        // Pull UVs toward the gravity source position on screen
        vec2 toSource = sourceUV - vUv;
        float dist = length(toSource);
        // Strength falls off with distance from source, scales with proximity
        float lensAmount = proximity * lensStrength / (dist + 0.1);
        vec2 lensedUV = vUv + toSource * lensAmount;

        // --- Chromatic aberration ---
        // Kicks in harder at high proximity (quadratic ramp)
        float chromAmount = proximity * proximity * chromStrength;
        vec2 chromDir = normalize(vUv - vec2(0.5));

        float r = texture2D(tDiffuse, lensedUV + chromDir * chromAmount).r;
        float g = texture2D(tDiffuse, lensedUV).g;
        float b = texture2D(tDiffuse, lensedUV - chromDir * chromAmount).b;

        gl_FragColor = vec4(r, g, b, 1.0);
      }
    `,
  }

  return new ShaderPass(shader)
}
