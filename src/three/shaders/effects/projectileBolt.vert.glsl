uniform float uTime;
varying vec2 vUv;

void main() {
  vUv = uv;
  float scale = 1.0 + uTime * 0.3;
  vec3 scaled = position * vec3(scale, scale, 1.0);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(scaled, 1.0);
}
