uniform sampler2D tDiffuse;
uniform float amount;
varying vec2 vUv;

void main() {
  vec2 dir = vUv - 0.5;
  float dist = length(dir);
  float r = texture2D(tDiffuse, vUv - dir * amount * dist).r;
  float g = texture2D(tDiffuse, vUv).g;
  float b = texture2D(tDiffuse, vUv + dir * amount * dist).b;
  gl_FragColor = vec4(r, g, b, 1.0);
}
