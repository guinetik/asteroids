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

/** Threshold below which the pass is effectively invisible. */
const INTENSITY_EPSILON = 0.001

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
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform sampler2D tDiffuse;
      uniform float intensity;
      uniform float time;
      varying vec2 vUv;

      // Hash-based pseudo-random for streak pattern
      float hash(float n) {
        return fract(sin(n) * 43758.5453);
      }

      void main() {
        vec4 color = texture2D(tDiffuse, vUv);

        if (intensity < ${INTENSITY_EPSILON}) {
          gl_FragColor = color;
          return;
        }

        // Radial distance from center
        vec2 center = vUv - 0.5;
        float dist = length(center);
        float angle = atan(center.y, center.x);

        // Radial streaks: use angle to create discrete rays
        float rays = 80.0;
        float rayAngle = floor(angle * rays / 6.2831853) / rays * 6.2831853;
        float rayHash = hash(rayAngle * 100.0 + 1.0);

        // Animate streaks outward
        float streak = fract(dist * 3.0 - time * 2.0 + rayHash);
        streak = smoothstep(0.0, 0.3, streak) * smoothstep(1.0, 0.7, streak);

        // Only show in outer region, fade from center
        float radialFade = smoothstep(0.05, 0.35, dist);

        // Pure additive light — streaks emit light on top of the scene
        float streakIntensity = streak * radialFade * intensity * 0.7;
        vec3 streakColor = vec3(0.7, 0.95, 1.0);

        gl_FragColor = vec4(color.rgb + streakColor * streakIntensity, color.a);
      }
    `,
  }

  return new ShaderPass(shader)
}
