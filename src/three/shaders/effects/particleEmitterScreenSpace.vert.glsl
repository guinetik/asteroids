attribute float life;
uniform float uBaseSize;
uniform float uSizeGrowth;
varying float vLife;

void main() {
  vLife = life;
  float sizeFactor = 1.0 + (uSizeGrowth - 1.0) * life;
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = uBaseSize * sizeFactor;
  gl_Position = projectionMatrix * mvPosition;
}
