uniform float uTime;
uniform float uProgress;
uniform float uOpacity;
uniform vec3 uColor;
uniform vec3 uPulseColor;
varying float vLineU;

void main() {
  float pulse = 0.5 + 0.5 * sin((vLineU * 10.0) - (uTime * 8.0));
  float captureFront = smoothstep(0.0, 0.85, uProgress + (1.0 - vLineU) * 0.35);
  vec3 color = mix(uColor, uPulseColor, pulse * 0.45);
  float alpha = uOpacity * captureFront * (0.55 + pulse * 0.45);
  gl_FragColor = vec4(color, alpha);
}
