uniform sampler2D uNoise;
uniform float uTime;
uniform float uOpacity;
uniform vec3 uColor;
uniform float uInnerRadius;
uniform float uOuterRadius;
uniform float uBandSeed;

varying vec2 vUv;

float bandDensity(float t) {
  float bands = 0.0;

  bands += 0.3 * smoothstep(0.0, 0.03, t) * smoothstep(0.18, 0.15, t);
  bands += 1.0 * smoothstep(0.20, 0.23, t) * smoothstep(0.52, 0.49, t);

  float aRing = smoothstep(0.57, 0.60, t) * smoothstep(0.82, 0.79, t);
  float enckeGap = 1.0 - (1.0 - smoothstep(0.695, 0.70, t)) * smoothstep(0.71, 0.705, t);
  float keelerGap = 1.0 - (1.0 - smoothstep(0.775, 0.78, t)) * smoothstep(0.79, 0.785, t);
  bands += 0.8 * aRing * enckeGap * keelerGap;
  bands += 0.25 * smoothstep(0.88, 0.89, t) * smoothstep(0.93, 0.92, t);

  return bands;
}

void main() {
  vec2 centered = (vUv - 0.5) * 2.0;
  float r = length(centered);
  float ringWidth = uOuterRadius - uInnerRadius;
  float vlength = (r - uInnerRadius) / ringWidth;

  if (vlength < 0.0 || vlength > 1.0) discard;

  float band = bandDensity(vlength);
  if (band < 0.01) discard;

  float angle = atan(centered.y, centered.x) + uTime * 0.05;
  vec2 texCoord = vec2((sin(angle) + 1.0) * 0.5 + uBandSeed, vlength * 3.0);
  vec4 noise = texture2D(uNoise, texCoord);
  float detail = mix(0.7, 1.0, noise.r);

  vec3 color = uColor * detail * 1.4;
  float alpha = band * uOpacity * detail;
  gl_FragColor = vec4(color, alpha);
}
