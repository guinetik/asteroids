uniform float uTime;
uniform float uProgress;
uniform float uOpacity;
uniform vec3 uColor;
varying vec2 vUv;

void main() {
  vec2 centered = (vUv - 0.5) * 2.0;
  float radius = length(centered);
  float rim = smoothstep(0.8, 0.2, radius);
  float ring = smoothstep(0.3, 0.26, abs(radius - (0.5 + 0.06 * sin(uTime * 6.0))));
  float grid = max(
    smoothstep(0.04, 0.0, abs(centered.x)),
    smoothstep(0.04, 0.0, abs(centered.y))
  );
  float intensity = max(rim * 0.4, max(ring * 0.8, grid * 0.6 * uProgress));
  float alpha = intensity * uOpacity * (0.4 + uProgress * 0.6);
  gl_FragColor = vec4(uColor, alpha);
}
