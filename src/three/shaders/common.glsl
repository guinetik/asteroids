// common.glsl — prepended to all fragment shaders at material creation time
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
