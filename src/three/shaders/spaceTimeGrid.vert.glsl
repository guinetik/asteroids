// Per-vertex Gaussian-well deformation for the solar-map space fabric grid.
// Source data is packed into two parallel vec4 arrays — see SpaceTimeGrid.ts
// for the layout. Loop bound MAX_SOURCES must match MAX_SHADER_SOURCES in TS.
#define MAX_SOURCES 32

uniform float uTime;
uniform float uDepthScale;
uniform float uWidthScale;
uniform float uMassExponent;
uniform float uPulseSpeed;
uniform float uPulseAmount;
uniform int uSourceCount;
// uSourceA[i] = (x, z, mass, depthMultiplier)
uniform vec4 uSourceA[MAX_SOURCES];
// uSourceB[i] = (widthMultiplier, isMovingFlag, isFabricAnomalyFlag, _pad)
uniform vec4 uSourceB[MAX_SOURCES];

varying float vTotalDepth;
varying float vAnomDepth;
varying vec2 vGridXZ;

void main() {
  float totalDepth = 0.0;
  float anomDepth = 0.0;
  float movingPulse = 1.0 + uPulseAmount * sin(uTime * uPulseSpeed);

  for (int i = 0; i < MAX_SOURCES; i++) {
    if (i >= uSourceCount) break;
    vec4 a = uSourceA[i];
    vec4 b = uSourceB[i];
    float dx = position.x - a.x;
    float dz = position.z - a.y;
    float rSq = dx * dx + dz * dz;

    float massVal = a.z;
    float depthMul = a.w;
    float widthMul = b.x;
    float pulse = mix(1.0, movingPulse, b.y);
    float anomFlag = b.z;

    float massSign = sign(massVal);
    float massAbs = abs(massVal);
    float massFactor = massSign * pow(massAbs, uMassExponent);
    float sigma = uWidthScale * massFactor * widthMul;
    float invTwoSigmaSq = 1.0 / max(2.0 * sigma * sigma, 1e-6);
    float amplitude = uDepthScale * massFactor * pulse * depthMul;
    float depth = amplitude * exp(-rSq * invTwoSigmaSq);

    totalDepth += depth;
    anomDepth += depth * anomFlag;
  }

  vTotalDepth = totalDepth;
  vAnomDepth = anomDepth;
  vGridXZ = position.xz;
  vec3 deformed = vec3(position.x, -totalDepth, position.z);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(deformed, 1.0);
}
