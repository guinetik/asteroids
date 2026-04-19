uniform sampler2D tDiffuse;
uniform float intensity;
uniform float time;
varying vec2 vUv;

const float INTENSITY_EPSILON = 0.001;

float hash(float n) {
  return fract(sin(n) * 43758.5453);
}

void main() {
  vec4 color = texture2D(tDiffuse, vUv);

  if (intensity < INTENSITY_EPSILON) {
    gl_FragColor = color;
    return;
  }

  vec2 center = vUv - 0.5;
  float dist = length(center);
  float angle = atan(center.y, center.x);

  float slotCount = 500.0;
  float slot = floor(angle * slotCount / 6.2831853);
  float slotRand = hash(slot * 127.1);
  float lineMask = step(0.4, slotRand);

  float lineAngle = slot / slotCount * 6.2831853;
  float angleDiff = abs(angle - lineAngle);
  float lineWidth = 0.003 + slotRand * 0.004;
  float lineFalloff = smoothstep(lineWidth, 0.0, angleDiff);

  float innerEdge = mix(0.7, 0.05, intensity);
  float radialFade = smoothstep(innerEdge, innerEdge + 0.1, dist);
  float shimmer = 0.7 + 0.3 * sin(time * 3.0 + slotRand * 20.0);
  float brightness = (0.5 + 0.5 * hash(slot * 31.7)) * shimmer;
  float lineIntensity = lineMask * lineFalloff * radialFade * brightness * intensity * 1.2;
  vec3 lineColor = mix(vec3(0.3, 0.8, 1.0), vec3(0.85, 0.95, 1.0), brightness);

  gl_FragColor = vec4(color.rgb + lineColor * lineIntensity, color.a);
}
