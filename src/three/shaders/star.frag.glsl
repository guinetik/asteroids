// star.frag.glsl — procedural star surface
// common.glsl is prepended at material creation time

precision highp float;

uniform float uTime;
uniform vec3  uStarColor;
uniform float uTemperature;    // Kelvin, affects color
uniform float uActivityLevel;  // 0–1, affects turbulence
uniform float uRotationSpeed;  // Self-rotation speed (radians/second)

varying vec3 vModelNormal;
varying vec3 vModelPosition;
varying vec3 vViewNormal;
varying vec3 vViewPosition;

// =============================================================================
// PLASMA NOISE — 5-octave flowing noise
// =============================================================================

float plasmaNoise(vec3 p, float time) {
    float value    = 0.0;
    float amplitude = 1.0;
    float frequency = 1.0;
    float totalAmp  = 0.0;

    for (int i = 0; i < 5; i++) {
        vec3 offset = vec3(
            sin(time * 0.1 + float(i)) * 0.5,
            cos(time * 0.15 + float(i) * 0.7) * 0.5,
            time * 0.05
        );
        value    += amplitude * noise3D((p + offset) * frequency);
        totalAmp += amplitude;
        amplitude *= 0.5;
        frequency *= 2.0;
    }

    return value / totalAmp;
}

// =============================================================================
// HOT BUBBLES — 3-layer bright spots that appear and pop
// =============================================================================

float hotBubbles(vec3 p, float time) {
    // Large slow bubbles
    vec3  p1 = p * 5.0 + vec3(0.0, time * 0.06, 0.0);
    float b1 = smoothstep(0.3, 0.6, noise3D(p1));

    // Medium bubbles, faster
    vec3  p2 = p * 9.0 + vec3(time * 0.04, time * 0.08, 0.0);
    float b2 = smoothstep(0.35, 0.65, noise3D(p2));

    // Small rapid bubbles
    vec3  p3 = p * 16.0 + vec3(time * 0.1, 0.0, time * 0.12);
    float b3 = smoothstep(0.4, 0.7, noise3D(p3));

    float bubbles = b1 * 0.5 + b2 * 0.35 + b3 * 0.15;
    float pulse   = sin(time * 2.0 + p.x * 10.0) * 0.3 + 0.7;

    return bubbles * pulse;
}

// =============================================================================
// BOILING TURBULENCE — 4-octave chaotic movement
// =============================================================================

float boilingTurbulence(vec3 p, float time) {
    float turb = 0.0;
    float amp  = 1.0;
    float freq = 4.0;

    for (int i = 0; i < 4; i++) {
        vec3 offset = vec3(
            sin(time * 0.3  + float(i) * 1.7) * 0.5,
            cos(time * 0.25 + float(i) * 2.3) * 0.5,
            time * 0.15 * (1.0 + float(i) * 0.3)
        );
        turb += amp * abs(noise3D(p * freq + offset));
        amp  *= 0.5;
        freq *= 2.1;
    }
    return turb;
}

// =============================================================================
// CORONA FLAMES — edge flame structures
// =============================================================================

float coronaFlames(float angle, float rimFactor, float time, float activity) {
    // Large slow flames
    float f1 = sin(angle * 5.0  + time * 0.5) * 0.5 + 0.5;
    f1 *= noise3D(vec3(angle * 2.0, time * 0.3, 0.0));

    // Medium flames
    float f2 = sin(angle * 12.0 + time * 0.8) * 0.5 + 0.5;
    f2 *= noise3D(vec3(angle * 4.0, time * 0.5, 5.0));

    // Small rapid flames
    float f3 = sin(angle * 25.0 + time * 1.5) * 0.5 + 0.5;
    f3 *= noise3D(vec3(angle * 8.0, time * 0.8, 10.0));

    float flames = f1 * 0.5 + f2 * 0.3 + f3 * 0.2;
    flames *= pow(rimFactor, 1.5);
    flames *= 0.5 + activity * 0.5;

    return flames;
}

// =============================================================================
// MAIN
// =============================================================================

void main() {
    float time         = uTime;
    float selfRotation = time * uRotationSpeed;

    // --- View geometry (view-space normal) ---
    vec3  viewDir  = normalize(-vViewPosition);
    float viewAngle    = dot(vViewNormal, viewDir);
    float edgeDist     = 1.0 - viewAngle;
    float limbDarkening = pow(max(0.0, viewAngle), 0.4);

    // --- Self-rotation applied to model normal for surface features ---
    vec3 rotNormal = rotateY(vModelNormal, selfRotation);

    // --- Spherical UV distortion (boiling warp from gcanvas sp = normal.xy section) ---
    // Use view-space normal's XY for the distortion (camera-relative, matches gcanvas intent)
    vec2  sp        = vViewNormal.xy;
    float r         = dot(sp, sp);

    float brightness     = 0.15 + (uTemperature / 10000.0) * 0.1;
    float distortStrength = 2.0 - brightness;

    vec2 warpedUV;
    if (r < 0.0001) {
        // At pole — use alternative coords
        float poleAngle = atan(rotNormal.y, rotNormal.x) + time * 0.15;
        float poleElev  = acos(clamp(rotNormal.z, -1.0, 1.0));
        warpedUV = vec2(cos(poleAngle), sin(poleAngle)) * (poleElev / 3.14159) * distortStrength;
    } else {
        sp *= distortStrength;
        r   = dot(sp, sp);
        float f = (1.0 - sqrt(abs(1.0 - r))) / (r + 0.001) + brightness * 0.5;
        warpedUV = sp * f + vec2(time * 0.05, 0.0);
    }

    // --- Plasma texture ---
    vec3  plasmaCoord = vec3(warpedUV * 3.0, time * 0.12);
    float plasma1 = plasmaNoise(plasmaCoord, time);
    float plasma2 = plasmaNoise(plasmaCoord * 1.3 + vec3(50.0), time * 1.2);
    float plasma  = plasma1 * 0.6 + plasma2 * 0.4;
    plasma = plasma * 0.5 + 0.5;

    // --- Multi-layer surface effects ---
    float turbIntensity = boilingTurbulence(rotNormal, time) * 0.6;
    float bubbles       = hotBubbles(rotNormal, time);
    float gran          = noise3D(rotNormal * 15.0 + time * 0.5);

    // --- Pulsation ---
    float pulse1   = cos(time * 0.5) * 0.5;
    float pulse2   = sin(time * 0.25) * 0.5;
    float pulseAmp = uActivityLevel;
    float pulse    = (pulse1 + pulse2) * 0.3 * pulseAmp;

    // --- Combined intensity ---
    float totalIntensity = plasma * 0.35 + turbIntensity * 0.25 + gran * 0.2;
    totalIntensity += bubbles * 0.4;
    totalIntensity *= 1.0 + pulse;

    // --- 4-tier temperature-based color system ---
    vec3  baseColor = uStarColor;
    float maxComp   = max(baseColor.r, max(baseColor.g, baseColor.b));
    if (maxComp > 0.01) baseColor = baseColor / maxComp * 0.85;

    float tempBlend = smoothstep(5000.0, 7500.0, uTemperature);

    vec3 hotColor     = baseColor * vec3(1.6, 1.35, 1.2);
    vec3 coolColor    = mix(baseColor * vec3(0.5, 0.3, 0.2),  baseColor * vec3(0.7, 0.8, 0.95), tempBlend);
    vec3 warmColor    = mix(baseColor * vec3(1.2, 1.0, 0.85), baseColor * vec3(1.0, 1.05, 1.2),  tempBlend);
    vec3 blazingColor = mix(baseColor * vec3(2.0, 1.6, 1.3),  baseColor * vec3(1.4, 1.5, 1.8),   tempBlend);

    vec3 surfaceColor;
    if (totalIntensity < 0.35) {
        surfaceColor = mix(coolColor, warmColor, totalIntensity / 0.35);
    } else if (totalIntensity < 0.65) {
        surfaceColor = mix(warmColor, hotColor, (totalIntensity - 0.35) / 0.3);
    } else if (totalIntensity < 1.0) {
        surfaceColor = mix(hotColor, blazingColor, (totalIntensity - 0.65) / 0.35);
    } else {
        surfaceColor = blazingColor * (1.0 + (totalIntensity - 1.0) * 0.8);
    }

    // Bubble highlights
    float bubbleHighlight = pow(bubbles, 1.5) * turbIntensity;
    surfaceColor += blazingColor * bubbleHighlight * 0.6;

    // --- Limb darkening ---
    surfaceColor *= 0.75 + limbDarkening * 0.25;

    // --- Organic rim glow ---
    float rimAngle    = atan(vModelNormal.y, vModelNormal.x) + selfRotation;
    float rimNoise    = noise3D(vec3(rimAngle * 3.0, edgeDist * 2.0, time * 0.2)) * 0.5 + 0.5;
    float rimIntensity = pow(edgeDist, 2.0) * (0.4 + rimNoise * 0.6);
    vec3  rimColor    = baseColor * vec3(1.3, 0.95, 0.6);
    surfaceColor += rimColor * rimIntensity * 0.6 * uActivityLevel;

    // --- Edge glow (corona bleeding) ---
    float edgeGlow = pow(edgeDist, 0.5) * 0.3 * uActivityLevel;
    surfaceColor += warmColor * edgeGlow;

    // --- Center boost ---
    float centerBoost = pow(viewAngle, 1.5) * 0.2;
    surfaceColor += baseColor * centerBoost;

    // --- Shimmer ---
    float shimmer = sin(turbIntensity * 10.0 + time * 3.0) * 0.05 + 1.0;
    surfaceColor *= shimmer;

    surfaceColor = clamp(surfaceColor, 0.0, 3.5);

    gl_FragColor = vec4(surfaceColor, 1.0);
}
