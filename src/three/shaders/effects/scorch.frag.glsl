uniform float intensity;
uniform float time;
uniform vec3 baseColor;
varying vec2 vUv;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

void main() {
  vec2 centered = vUv * 2.0 - 1.0;
  float dist = length(centered);

  float glow = 1.0 - smoothstep(0.0, 1.0, dist);
  glow = pow(glow, 2.0);
  float pulse = 0.9 + 0.1 * sin(time * 6.0 + hash(centered) * 6.28);

  vec3 hotColor = vec3(1.0, 0.9, 0.7);
  vec3 color = mix(baseColor, hotColor, glow * 0.6);

  float alpha = glow * intensity * pulse;
  gl_FragColor = vec4(color, alpha);
}
