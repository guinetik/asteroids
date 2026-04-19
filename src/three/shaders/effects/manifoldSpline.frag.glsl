uniform float uTime;
uniform vec3 uBaseColor;
uniform vec3 uGlowColor;
uniform float uOpacity;
uniform float uPulseSpeed;

void main() {
  float pulse = 0.7 + 0.3 * sin(uTime * uPulseSpeed * 6.2831);
  vec3 color = mix(uBaseColor, uGlowColor, pulse * 0.5);
  gl_FragColor = vec4(color, uOpacity * pulse);
}
