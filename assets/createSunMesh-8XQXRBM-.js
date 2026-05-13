import{On as e,Tt as t,Ut as n,W as r,Wt as i,dn as a,in as o}from"./vendor-postprocessing-DUotkPlW.js";var s=`// sphere.vert.glsl — shared vertex shader for all celestial bodies

varying vec3 vModelNormal;
varying vec3 vModelPosition;
varying vec3 vViewNormal;
varying vec3 vViewPosition;

void main() {
    vModelNormal   = normal;
    vModelPosition = position;
    vViewNormal    = normalize(normalMatrix * normal);
    vec4 mvPos     = modelViewMatrix * vec4(position, 1.0);
    vViewPosition  = mvPos.xyz;
    gl_Position    = projectionMatrix * mvPos;
}
`,c=`// common.glsl — prepended to all fragment shaders at material creation time
// DO NOT add precision qualifiers here; each fragment shader declares its own.

// =============================================================================
// NOISE FUNCTIONS
// =============================================================================

float hash(float n) {
    return fract(sin(n) * 43758.5453123);
}

// 3D Value noise
float noise3D(vec3 x) {
    vec3 i = floor(x);
    vec3 f = fract(x);
    f = f * f * (3.0 - 2.0 * f);

    float n = dot(i, vec3(1.0, 57.0, 113.0));

    return mix(
        mix(mix(hash(n + 0.0),   hash(n + 1.0),   f.x),
            mix(hash(n + 57.0),  hash(n + 58.0),  f.x), f.y),
        mix(mix(hash(n + 113.0), hash(n + 114.0), f.x),
            mix(hash(n + 170.0), hash(n + 171.0), f.x), f.y), f.z
    );
}

// FBM (Fractional Brownian Motion) — up to 8 octaves
float fbm(vec3 p, int octaves) {
    float value = 0.0;
    float amplitude = 0.5;
    float frequency = 1.0;

    for (int i = 0; i < 8; i++) {
        if (i >= octaves) break;
        value += amplitude * noise3D(p * frequency);
        frequency *= 2.0;
        amplitude *= 0.5;
    }

    return value;
}

// =============================================================================
// LIGHTING
// =============================================================================

// Diffuse + ambient lighting
float diffuseLight(vec3 normal, vec3 lightDir, float ambient) {
    float diffuse = max(0.0, dot(normal, lightDir));
    return ambient + (1.0 - ambient) * diffuse;
}

// Fresnel rim effect
float fresnel(vec3 normal, vec3 viewDir, float power) {
    return pow(1.0 - abs(dot(normal, viewDir)), power);
}

// =============================================================================
// ROTATION
// =============================================================================

// Rotate a vector around the Y axis
vec3 rotateY(vec3 v, float angle) {
    float c = cos(angle);
    float s = sin(angle);
    return vec3(v.x * c + v.z * s, v.y, -v.x * s + v.z * c);
}

// Convert a sphere normal into equirectangular UV space.
vec2 sphericalUv(vec3 normal) {
    vec3 n = normalize(normal);
    float u = atan(n.z, n.x) / (6.28318530718) + 0.5;
    float v = asin(clamp(n.y, -1.0, 1.0)) / 3.14159265359 + 0.5;
    return vec2(1.0 - u, v);
}
`,l=`// star.frag.glsl — procedural star surface
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

    vec3 hotColor     = baseColor * vec3(1.3, 1.15, 1.0);
    vec3 coolColor    = mix(baseColor * vec3(0.45, 0.28, 0.18), baseColor * vec3(0.65, 0.75, 0.9),  tempBlend);
    vec3 warmColor    = mix(baseColor * vec3(1.0, 0.85, 0.7),   baseColor * vec3(0.9, 0.95, 1.1),   tempBlend);
    vec3 blazingColor = mix(baseColor * vec3(1.5, 1.3, 1.05),   baseColor * vec3(1.2, 1.3, 1.55),   tempBlend);

    vec3 surfaceColor;
    if (totalIntensity < 0.35) {
        surfaceColor = mix(coolColor, warmColor, totalIntensity / 0.35);
    } else if (totalIntensity < 0.65) {
        surfaceColor = mix(warmColor, hotColor, (totalIntensity - 0.35) / 0.3);
    } else {
        surfaceColor = mix(hotColor, blazingColor, clamp((totalIntensity - 0.65) / 0.35, 0.0, 1.0));
    }

    // Bubble highlights
    float bubbleHighlight = pow(bubbles, 1.5) * turbIntensity;
    surfaceColor += blazingColor * bubbleHighlight * 0.25;

    // --- Limb darkening ---
    surfaceColor *= 0.7 + limbDarkening * 0.3;

    // --- Organic rim glow ---
    float rimAngle    = atan(vModelNormal.y, vModelNormal.x) + selfRotation;
    float rimNoise    = noise3D(vec3(rimAngle * 3.0, edgeDist * 2.0, time * 0.2)) * 0.5 + 0.5;
    float rimIntensity = pow(edgeDist, 2.0) * (0.4 + rimNoise * 0.6);
    vec3  rimColor    = baseColor * vec3(1.15, 0.85, 0.55);
    surfaceColor += rimColor * rimIntensity * 0.3 * uActivityLevel;

    // --- Edge glow (corona bleeding) ---
    float edgeGlow = pow(edgeDist, 0.6) * 0.12 * uActivityLevel;
    surfaceColor += warmColor * edgeGlow;

    // --- Center boost ---
    float centerBoost = pow(viewAngle, 1.5) * 0.08;
    surfaceColor += baseColor * centerBoost;

    // --- Shimmer ---
    float shimmer = sin(turbIntensity * 10.0 + time * 3.0) * 0.04 + 1.0;
    surfaceColor *= shimmer;

    surfaceColor = clamp(surfaceColor, 0.0, 1.5);

    gl_FragColor = vec4(surfaceColor, 1.0);
}
`,u=`// corona.vert.glsl — billboard a plane toward the camera at the mesh's position.
// The plane's local XY is used as screen-space offset around the object's center.

varying vec2 vUv;

void main() {
    vUv = uv;

    // Extract world-space scale from the model matrix columns.
    vec3 scale = vec3(
        length(modelMatrix[0].xyz),
        length(modelMatrix[1].xyz),
        length(modelMatrix[2].xyz)
    );

    // View-space center of the billboard's origin.
    vec4 center = viewMatrix * vec4(modelMatrix[3].xyz, 1.0);

    // Offset by local XY times scale — keeps the quad facing the camera.
    center.xy += position.xy * scale.xy;

    gl_Position = projectionMatrix * center;
}
`,d=`// corona.frag.glsl — procedural radial corona with flame-like noise structure.
// common.glsl is prepended at material creation time (provides noise3D).

precision highp float;

uniform float uTime;
uniform vec3  uCoreColor;
uniform vec3  uEdgeColor;
uniform float uActivity;
uniform float uIntensity;

varying vec2 vUv;

void main() {
    // Centered coords in [-1, 1], radial distance in [0, 1].
    vec2 p = vUv * 2.0 - 1.0;
    float d = length(p);
    if (d > 1.0) discard;

    float angle = atan(p.y, p.x);

    // Radially streaked noise — lower d coefficient keeps streaks pointing outward.
    float n1 = noise3D(vec3(angle * 2.5, d * 1.5, uTime * 0.12)) * 0.5 + 0.5;
    float n2 = noise3D(vec3(angle * 7.0, d * 2.5 - uTime * 0.08, uTime * 0.25)) * 0.5 + 0.5;
    float n3 = noise3D(vec3(angle * 18.0, d * 4.0, uTime * 0.4)) * 0.5 + 0.5;
    float flames = n1 * 0.55 + n2 * 0.3 + n3 * 0.15;

    // Soft falloff curves. exp gives the bright core, a quadratic gives the wide halo.
    float core = exp(-d * 5.0);
    float halo = pow(1.0 - d, 2.2);

    // Flame modulation — stronger on the halo, barely touches the core.
    float flameWeight = smoothstep(0.05, 0.55, d);
    float rayHalo = halo * mix(0.65, 0.35 + flames * 1.1, flameWeight * uActivity);

    // Slow breathing pulse.
    float pulse = 0.94 + 0.06 * sin(uTime * 0.6);

    float alpha = (core * 0.85 + rayHalo * 0.6) * pulse * uIntensity;

    // Inner warmer, outer cooler — tint blend runs from core to edge.
    vec3 color = mix(uEdgeColor, uCoreColor, pow(1.0 - d, 1.6));

    gl_FragColor = vec4(color * alpha, alpha);
}
`,f=22,p=1.2,m=0,h=4,g=[1,.94,.78],_=[1,.5,.2],v=.55;function y(y){let b=y.displayRadius*80,x=new a(b,64,64),S=y.shader.uniforms,C={uTime:{value:0},uStarColor:{value:new e(...S.uStarColor)},uTemperature:{value:S.uTemperature},uActivityLevel:{value:S.uActivityLevel},uRotationSpeed:{value:S.uRotationSpeed}},w=new t(x,new o({vertexShader:s,fragmentShader:c+`
`+l,uniforms:C})),T=new i(16773328,f,m);T.decay=p,w.add(T);let E=b*h*2,D=new n(E,E),O={uTime:{value:0},uCoreColor:{value:new e(...g)},uEdgeColor:{value:new e(..._)},uActivity:{value:S.uActivityLevel},uIntensity:{value:v}},k=new t(D,new o({vertexShader:u,fragmentShader:c+`
`+d,uniforms:O,blending:2,transparent:!0,depthWrite:!1}));k.renderOrder=-1;let A=new r;return A.add(k),A.add(w),{group:A,mesh:w,light:T,uniforms:C,coronaUniforms:O}}export{c as n,s as r,y as t};