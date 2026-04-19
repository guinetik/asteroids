uniform sampler2D tDiffuse;
uniform float desaturation;
uniform vec3 shadowTint;
uniform float contrast;
varying vec2 vUv;

void main() {
  vec4 tex = texture2D(tDiffuse, vUv);
  vec3 color = tex.rgb;

  float luma = dot(color, vec3(0.2126, 0.7152, 0.0722));
  color = mix(color, vec3(luma), desaturation);

  float shadowMask = 1.0 - smoothstep(0.0, 0.3, luma);
  color = mix(color, color * shadowTint, shadowMask * 0.4);

  color = clamp((color - 0.5) * contrast + 0.5, 0.0, 1.0);

  gl_FragColor = vec4(color, tex.a);
}
