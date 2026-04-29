// Fragment shader for the space-fabric grid lines. Blends the slate baseline
// tint toward white wherever a fabric-anomaly source dominates the local depth.
precision highp float;

uniform vec3 uBaselineColor;
uniform float uOpacity;
uniform float uDepthScale;
uniform float uAnomFracScale;
uniform float uAnomDepthScale;
uniform float uAnomAbsWeight;
// Radial vignette: alpha holds at full until uFadeStart, fades to zero by uFadeEnd
// (both in world units measured from the grid origin on the XZ plane).
uniform float uFadeStart;
uniform float uFadeEnd;

varying float vTotalDepth;
varying float vAnomDepth;
varying vec2 vGridXZ;

void main() {
  vec3 col = uBaselineColor;
  if (vAnomDepth > 1e-10) {
    float frac = vAnomDepth / max(vTotalDepth, 1e-10);
    float blendFromFrac = clamp(frac * uAnomFracScale, 0.0, 1.0);
    float blendFromAbs = clamp(vAnomDepth / (uDepthScale * uAnomDepthScale), 0.0, 1.0);
    float blend = max(blendFromFrac, blendFromAbs * uAnomAbsWeight);
    col = mix(uBaselineColor, vec3(1.0), blend);
  }
  float r = length(vGridXZ);
  // Sharper-than-smoothstep falloff: hold near 1 longer, drop fast near the edge.
  // Squaring an inverted smoothstep keeps the transition smooth but bias-shifts
  // the visual midpoint outward, killing the perspective-compressed horizon band.
  float t = 1.0 - smoothstep(uFadeStart, uFadeEnd, r);
  float edgeFade = t * t;
  gl_FragColor = vec4(col, uOpacity * edgeFade);
}
