attribute float lineU;
varying float vLineU;

void main() {
  vLineU = lineU;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
