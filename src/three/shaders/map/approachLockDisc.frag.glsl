uniform float uTime;
uniform float uProgress;
uniform float uOpacity;
uniform vec3 uColor;
varying vec2 vUv;

void main() {
  vec2 centered = (vUv - 0.5) * 2.0;
  float radius = length(centered);
  float rim = smoothstep(0.7, 0.25, radius);
  float ring = smoothstep(0.38, 0.34, abs(radius - (0.45 + 0.08 * sin(uTime * 5.0))));
  float spokes = 0.5 + 0.5 * sin(atan(centered.y, centered.x) * 6.0 + uTime * 3.0);
  float intensity = max(rim * 0.55, ring * (0.65 + 0.35 * spokes));
  float alpha = intensity * uOpacity * (0.45 + uProgress * 0.55);
  gl_FragColor = vec4(uColor, alpha);
}
