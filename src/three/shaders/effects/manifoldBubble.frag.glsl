uniform float uTime;
uniform vec3 uColor;
uniform float uOpacity;
varying vec3 vPos;

void main() {
  float bands = sin(vPos.y * 3.0 + uTime * 4.0) * 0.5 + 0.5;
  float edge = smoothstep(0.0, 0.3, bands);
  vec3 color = uColor * (0.6 + 0.4 * edge);
  gl_FragColor = vec4(color, uOpacity * (0.5 + 0.5 * edge));
}
