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

      float hash(float n) {
        return fract(sin(n) * 43758.5453);
      }

      void main() {
        vec4 color = texture2D(tDiffuse, vUv);

        if (intensity < ${INTENSITY_EPSILON}) {
          gl_FragColor = color;
          return;
        }

        vec2 center = vUv - 0.5;
        float dist = length(center);
        float angle = atan(center.y, center.x);

        // Sparse long radial lines — like hyperspace streaks
        // Quantize angle into ~200 slots, but only ~30 are "lit"
        float slotCount = 500.0;
        float slot = floor(angle * slotCount / 6.2831853);
        float slotRand = hash(slot * 127.1);

        // ~60% of slots produce a line
        float lineMask = step(0.4, slotRand);

        // Each line has its own brightness and slight width variation
        float lineAngle = slot / slotCount * 6.2831853;
        float angleDiff = abs(angle - lineAngle);
        // Thin lines — sharp falloff from the line center
        float lineWidth = 0.003 + slotRand * 0.004;
        float lineFalloff = smoothstep(lineWidth, 0.0, angleDiff);

        // Lines grow inward from edges toward center as intensity increases.
        // At intensity=1 (launch), lines reach close to center.
        // At intensity=0.5, lines only fill outer half.
        // innerEdge moves from 0.7 (low intensity) down to 0.05 (full intensity).
        float innerEdge = mix(0.7, 0.05, intensity);
        float radialFade = smoothstep(innerEdge, innerEdge + 0.1, dist);

        // Slight shimmer per line — breathing brightness
        float shimmer = 0.7 + 0.3 * sin(time * 3.0 + slotRand * 20.0);

        // Brightness varies per line: some bright white, some dimmer cyan
        float brightness = (0.5 + 0.5 * hash(slot * 31.7)) * shimmer;

        float lineIntensity = lineMask * lineFalloff * radialFade * brightness * intensity * 1.2;

        // Cyan-white color: brighter lines tend whiter
        vec3 lineColor = mix(vec3(0.3, 0.8, 1.0), vec3(0.85, 0.95, 1.0), brightness);

        gl_FragColor = vec4(color.rgb + lineColor * lineIntensity, color.a);
      }
    `,
  }

  return new ShaderPass(shader)
}
