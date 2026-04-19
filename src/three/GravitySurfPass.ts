import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js'

const INTENSITY_EPSILON = 0.001

/** Full-screen pass that tints the map during gravity-surf coupling / cruise. */
export function createGravitySurfPass(): ShaderPass {
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

        vec2 centeredUv = vUv - 0.5;
        float dist = length(centeredUv);
        float angle = atan(centeredUv.y, centeredUv.x);

        float slotCount = 560.0;
        float slot = floor((angle + 3.14159265) * slotCount / 6.2831853);
        float slotRand = hash(slot * 57.13);

        float activeSlot = step(0.42, slotRand);
        float slotAngle = (slot / slotCount) * 6.2831853 - 3.14159265;
        float angleDiff = abs(angle - slotAngle);
        angleDiff = min(angleDiff, 6.2831853 - angleDiff);
        float lineWidth = 0.0012 + slotRand * 0.0024;
        float lineMask = smoothstep(lineWidth, 0.0, angleDiff);

        float flowSpeed = 1.8 + slotRand * 2.9;
        float phase = fract(time * flowSpeed + slotRand * 13.0);
        float headDist = mix(0.08, 1.05, phase);
        float trailLength = mix(0.06, 0.18, slotRand);
        float tailDist = headDist - trailLength;
        float depthPacket =
          smoothstep(tailDist - 0.03, tailDist + 0.01, dist) *
          (1.0 - smoothstep(headDist - 0.01, headDist + 0.035, dist));

        float centerKeepout = smoothstep(0.08, 0.18, dist);
        float edgeFade = 1.0 - smoothstep(0.78, 1.02, dist);
        float forwardBias = 1.0 - smoothstep(0.22, 0.72, abs(centeredUv.x));

        float streakIntensity =
          activeSlot *
          lineMask *
          depthPacket *
          centerKeepout *
          edgeFade *
          forwardBias *
          intensity * 1.08;

        vec2 flowDir = normalize(centeredUv + vec2(0.0001));
        vec2 warpOffset = flowDir * streakIntensity * 0.012;
        vec4 warped = texture2D(tDiffuse, vUv + warpOffset);

        float packetGlow = smoothstep(0.24, 0.0, abs(dist - clamp(headDist - trailLength * 0.3, 0.0, 1.0)));
        float whiteness = 0.28 + 0.42 * slotRand + packetGlow * 0.18;
        vec3 lineColor = mix(vec3(0.498, 0.909, 1.0), vec3(0.82, 0.96, 1.0), whiteness);
        vec3 finalColor = mix(color.rgb, warped.rgb, 0.11 * intensity);
        finalColor += lineColor * (streakIntensity * 0.72);

        gl_FragColor = vec4(finalColor, color.a);
      }
    `,
  }

  return new ShaderPass(shader)
}
