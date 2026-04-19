uniform vec3 uColor;
uniform float uOpacity;
uniform sampler2D uMap;
uniform bool uUseMap;
varying float vLife;

void main() {
  float fade = 1.0 - smoothstep(0.0, 1.0, vLife);
  vec4 texColor = uUseMap ? texture2D(uMap, gl_PointCoord) : vec4(1.0);
  gl_FragColor = vec4(uColor, uOpacity * fade * texColor.a);
  if (gl_FragColor.a < 0.01) discard;
}
