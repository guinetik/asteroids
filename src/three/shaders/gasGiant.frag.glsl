// gasGiant.frag.glsl — gas giant with banded atmosphere and storms
// common.glsl is prepended at material creation time

precision highp float;

uniform float uTime;
uniform vec3 uBaseColor;
uniform float uSeed;
uniform float uStormIntensity; // 0–1
uniform float uRotationSpeed; // Rotation speed multiplier

varying vec3 vModelNormal;
varying vec3 vModelPosition;
varying vec3 vViewNormal;
varying vec3 vViewPosition;

void main() {
    // --- Spherical coordinates from model-space normal ---
    float latitude = asin(vModelNormal.y); // -PI/2 to PI/2
    float longitude = atan(vModelNormal.z, vModelNormal.x); // -PI to PI

    float rotSpeed = uRotationSpeed > 0.0 ? uRotationSpeed : 0.1;
    float time = uTime * rotSpeed;

    // --- Banded atmosphere (sin waves at 15x, 25x, 40x latitude) ---
    float bands = sin(latitude * 15.0 + time) * 0.5 + 0.5;
    bands += sin(latitude * 25.0 - time * 0.5) * 0.25;
    bands += sin(latitude * 40.0 + time * 0.3) * 0.125;

    // --- Turbulent distortion of bands ---
    vec3 noiseCoord = vec3(longitude + time * 0.2, latitude * 3.0, uSeed);
    float turb = fbm(noiseCoord * 5.0, 4) * 0.3;
    bands += turb;

    // --- Band coloring ---
    vec3 lightBand = uBaseColor * 1.3;
    vec3 darkBand = uBaseColor * 0.7;
    vec3 surfaceColor = mix(darkBand, lightBand, bands);

    // --- Storm cells (Great Red Spot style) ---
    if (uStormIntensity > 0.0) {
        float stormLat = 0.3;
        float stormLon = uTime * 0.05; // Storm drifts slowly (not scaled by rotSpeed)
        vec2 stormCenter = vec2(stormLon, stormLat);
        vec2 pos = vec2(longitude, latitude);
        float stormDist = length(pos - stormCenter);
        float storm = smoothstep(0.5, 0.2, stormDist) * uStormIntensity;

        vec3 stormColor = vec3(0.8, 0.3, 0.2);
        float swirl = sin(stormDist * 20.0 - uTime * 3.0) * 0.5 + 0.5;
        surfaceColor = mix(surfaceColor, stormColor * swirl, storm);
    }

    // --- Dynamic sun lighting + soft deep-space fill ---
    vec3 worldPosition = (modelMatrix * vec4(vModelPosition, 1.0)).xyz;
    vec3 worldNormal = normalize((modelMatrix * vec4(vModelNormal, 0.0)).xyz);
    vec3 lightDir = normalize(-worldPosition);

    float sunDiffuse = max(0.0, dot(worldNormal, lightDir));
    float sunWrap = max(0.0, dot(worldNormal, lightDir) * 0.5 + 0.5);
    float starFill = 0.30;
    float backFill = pow(max(0.0, dot(worldNormal, -lightDir)), 2.0) * 0.14;

    vec3 sunLight = vec3(1.0, 0.96, 0.9) * mix(0.24, 1.0, sunDiffuse);
    vec3 spaceLight = vec3(0.24, 0.30, 0.42) * (starFill + sunWrap * 0.14 + backFill);
    surfaceColor *= sunLight + spaceLight;

    // --- Softer limb darkening ---
    vec3 viewDir = normalize(-vViewPosition);
    float viewAngle = dot(vViewNormal, viewDir);
    surfaceColor *= 0.82 + max(0.0, viewAngle) * 0.18;

    gl_FragColor = vec4(surfaceColor, 1.0);
}
