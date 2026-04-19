uniform vec3 uColor;
uniform float uTime;
varying vec2 vUv;

void main() {
  float dist = abs(vUv.x - 0.5) * 2.0;
  float core = smoothstep(1.0, 0.1, dist);
  float whiteLine = smoothstep(0.3, 0.0, dist);
  vec3 col = mix(uColor * 1.5, vec3(1.0), whiteLine * 0.4);
  float taper = smoothstep(0.0, 0.15, vUv.y) * smoothstep(1.0, 0.85, vUv.y);
  float alpha = core * taper;
  alpha *= 0.9 + 0.1 * sin(uTime * 50.0 + vUv.y * 20.0);
  gl_FragColor = vec4(col, alpha);
}
