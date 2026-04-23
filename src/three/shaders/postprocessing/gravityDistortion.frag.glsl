uniform sampler2D tDiffuse;
uniform float proximity;
uniform vec2 sourceUV;
uniform float lensStrength;
uniform float chromStrength;
uniform float chromMultiplier;
varying vec2 vUv;

const float PROXIMITY_EPSILON = 0.001;

vec3 linearToSRGB(vec3 c) {
  return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
}

void main() {
  if (proximity < PROXIMITY_EPSILON) {
    vec4 texel = texture2D(tDiffuse, vUv);
    gl_FragColor = vec4(linearToSRGB(texel.rgb), texel.a);
    return;
  }

  vec2 toSource = sourceUV - vUv;
  float dist = length(toSource);
  float lensAmount = proximity * lensStrength / (dist + 0.1);
  vec2 lensedUV = vUv + toSource * lensAmount;

  float chromAmount = proximity * proximity * chromStrength * chromMultiplier;
  vec2 chromDir = normalize(vUv - vec2(0.5));

  float r = texture2D(tDiffuse, lensedUV + chromDir * chromAmount).r;
  float g = texture2D(tDiffuse, lensedUV).g;
  float b = texture2D(tDiffuse, lensedUV - chromDir * chromAmount).b;

  gl_FragColor = vec4(linearToSRGB(vec3(r, g, b)), 1.0);
}
