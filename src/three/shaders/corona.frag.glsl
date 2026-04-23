// corona.frag.glsl — procedural radial corona with flame-like noise structure.
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
