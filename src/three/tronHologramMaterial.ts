/**
 * Reusable TRON-style hologram {@link THREE.ShaderMaterial} pipeline — fresnel rim,
 * world scan bands, and UV grid lines with additive blending. Used by GLB props
 * and procedural enemies for a consistent wireframe-adjacent look.
 *
 * @author guinetik
 * @date 2026-04-08
 * @spec docs/superpowers/specs/2026-04-05-enemy-system-design.md
 */
import * as THREE from 'three'

/** Fresnel rim exponent — higher tightens edge glow. */
const TRON_HOLOGRAM_FRESNEL_POWER = 2.2

/** World-space Y frequency for the primary scan band. */
const TRON_HOLOGRAM_SCAN_WORLD_Y_SCALE = 4.5

/** Primary scan phase speed (radians / second factor). */
const TRON_HOLOGRAM_SCAN_A_TIME = 5.5

/** XZ world frequency for the secondary scan band. */
const TRON_HOLOGRAM_SCAN_XZ_SCALE = 2.0

/** Secondary scan phase speed. */
const TRON_HOLOGRAM_SCAN_B_TIME = 2.8

/** Base scan mix before waves. */
const TRON_HOLOGRAM_SCAN_BASE = 0.34

/** Amplitude of the Y-aligned scan wave. */
const TRON_HOLOGRAM_SCAN_A_AMP = 0.16

/** Amplitude of the diagonal scan wave. */
const TRON_HOLOGRAM_SCAN_B_AMP = 0.08

/** UV repeats along U for the lattice. */
const TRON_HOLOGRAM_GRID_U_SCALE = 8.0

/** UV repeats along V for the lattice. */
const TRON_HOLOGRAM_GRID_V_SCALE = 14.0

/** Grid line edge softness (U). */
const TRON_HOLOGRAM_GRID_U_SOFT_LO = 0.92
const TRON_HOLOGRAM_GRID_U_SOFT_HI = 1.0

/** Grid line edge softness (V). */
const TRON_HOLOGRAM_GRID_V_SOFT_LO = 0.85
const TRON_HOLOGRAM_GRID_V_SOFT_HI = 1.0

/** Strength of the UV grid mask. */
const TRON_HOLOGRAM_GRID_MASK = 0.65

/** Minimum hull alpha. */
const TRON_HOLOGRAM_ALPHA_BASE = 0.045

/** Fresnel contribution to alpha. */
const TRON_HOLOGRAM_ALPHA_FRESNEL = 0.24

/** Scan contribution to alpha. */
const TRON_HOLOGRAM_ALPHA_SCAN = 0.09

/** Grid contribution to alpha. */
const TRON_HOLOGRAM_ALPHA_GRID = 0.08

/** Base RGB multiplier on primary tint. */
const TRON_HOLOGRAM_COLOR_BASE = 0.24

/** Fresnel boost on primary tint. */
const TRON_HOLOGRAM_COLOR_FRESNEL = 0.72

/** Scan boost on primary tint. */
const TRON_HOLOGRAM_COLOR_SCAN = 0.22

/** UV grid scroll speed along U. */
const TRON_HOLOGRAM_GRID_SCROLL_U = 0.08

/** UV grid scroll speed along V. */
const TRON_HOLOGRAM_GRID_SCROLL_V = 0.18

const TRON_HOLOGRAM_VERTEX_SHADER = /* glsl */ `
  varying vec3 vWorldPos;
  varying vec3 vWorldNormal;
  varying vec2 vUv;

  void main() {
    vUv = uv;
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vWorldPos = worldPos.xyz;
    vWorldNormal = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * viewMatrix * worldPos;
  }
`

const TRON_HOLOGRAM_FRAGMENT_SHADER = /* glsl */ `
  uniform vec3 uColor;
  uniform vec3 uGridTint;
  uniform float uTime;
  uniform float uColorGain;
  uniform float uAlphaGain;

  varying vec3 vWorldPos;
  varying vec3 vWorldNormal;
  varying vec2 vUv;

  void main() {
    vec3 viewDir = normalize(cameraPosition - vWorldPos);
    float fresnel = pow(1.0 - abs(dot(normalize(vWorldNormal), viewDir)), ${TRON_HOLOGRAM_FRESNEL_POWER.toFixed(1)});

    float scanA = sin(vWorldPos.y * ${TRON_HOLOGRAM_SCAN_WORLD_Y_SCALE.toFixed(1)} - uTime * ${TRON_HOLOGRAM_SCAN_A_TIME.toFixed(1)});
    float scanB = sin((vWorldPos.x + vWorldPos.z) * ${TRON_HOLOGRAM_SCAN_XZ_SCALE.toFixed(1)} - uTime * ${TRON_HOLOGRAM_SCAN_B_TIME.toFixed(1)});
    float scan = ${TRON_HOLOGRAM_SCAN_BASE.toFixed(2)} + ${TRON_HOLOGRAM_SCAN_A_AMP.toFixed(2)} * scanA + ${TRON_HOLOGRAM_SCAN_B_AMP.toFixed(2)} * scanB;

    float gridX = smoothstep(${TRON_HOLOGRAM_GRID_U_SOFT_LO.toFixed(2)}, ${TRON_HOLOGRAM_GRID_U_SOFT_HI.toFixed(2)}, abs(fract(vUv.x * ${TRON_HOLOGRAM_GRID_U_SCALE.toFixed(1)} + uTime * ${TRON_HOLOGRAM_GRID_SCROLL_U.toFixed(2)}) * 2.0 - 1.0));
    float gridY = smoothstep(${TRON_HOLOGRAM_GRID_V_SOFT_LO.toFixed(2)}, ${TRON_HOLOGRAM_GRID_V_SOFT_HI.toFixed(2)}, abs(fract(vUv.y * ${TRON_HOLOGRAM_GRID_V_SCALE.toFixed(1)} - uTime * ${TRON_HOLOGRAM_GRID_SCROLL_V.toFixed(2)}) * 2.0 - 1.0));
    float grid = max(gridX, gridY) * ${TRON_HOLOGRAM_GRID_MASK.toFixed(2)};

    float alpha = ${TRON_HOLOGRAM_ALPHA_BASE.toFixed(3)} + fresnel * ${TRON_HOLOGRAM_ALPHA_FRESNEL.toFixed(2)} + scan * ${TRON_HOLOGRAM_ALPHA_SCAN.toFixed(2)} + grid * ${TRON_HOLOGRAM_ALPHA_GRID.toFixed(2)};
    vec3 color = uColor * (${TRON_HOLOGRAM_COLOR_BASE.toFixed(2)} + fresnel * ${TRON_HOLOGRAM_COLOR_FRESNEL.toFixed(2)} + scan * ${TRON_HOLOGRAM_COLOR_SCAN.toFixed(2)}) + uGridTint * grid;

    color *= uColorGain;
    alpha = min(alpha * uAlphaGain, 1.0);

    gl_FragColor = vec4(color, alpha);
  }
`

/** Default {@link THREE.Material.opacity} passed to the shader material. */
const TRON_HOLOGRAM_MATERIAL_OPACITY = 0.72

/** Default RGB multiplier in the fragment shader (props). */
const TRON_HOLOGRAM_DEFAULT_COLOR_GAIN = 1

/** Default alpha multiplier before clamp (props). */
const TRON_HOLOGRAM_DEFAULT_ALPHA_GAIN = 1

/**
 * Brighter additive RGB for procedural enemies vs map props (more neon read).
 */
export const TRON_HOLOGRAM_ENEMY_COLOR_GAIN = 1.48

/**
 * Stronger hull alpha for enemies so additive layers read thicker on screen.
 */
export const TRON_HOLOGRAM_ENEMY_ALPHA_GAIN = 1.42

/**
 * Slightly higher material opacity for enemies — pairs with gain uniforms.
 */
export const TRON_HOLOGRAM_ENEMY_MATERIAL_OPACITY = 0.86

/**
 * Options for {@link createTronHologramMaterial}.
 */
export interface CreateTronHologramMaterialOptions {
  /** Primary hologram tint (multiplied with fresnel and scan). */
  color: THREE.ColorRepresentation
  /**
   * RGB tint added on UV grid lines — use cooler/warmer bias to distinguish props
   * (virus vs nest) or leave neutral for enemies.
   */
  gridTint?: THREE.ColorRepresentation
  /**
   * Multiplies final fragment RGB after tint math — use {@link TRON_HOLOGRAM_ENEMY_COLOR_GAIN}
   * for enemies; default 1 for props.
   */
  colorGain?: number
  /**
   * Scales fragment alpha before clamp to 1 — use {@link TRON_HOLOGRAM_ENEMY_ALPHA_GAIN}
   * for enemies; default 1 for props.
   */
  alphaGain?: number
  /**
   * {@link THREE.ShaderMaterial.opacity} hint for the renderer (default {@link TRON_HOLOGRAM_MATERIAL_OPACITY}).
   */
  opacity?: number
}

/**
 * Build one TRON hologram shader instance. Meshes sharing the same instance should
 * call {@link syncTronHologramTimeSeconds} once per frame (or wire {@link THREE.Mesh.onBeforeRender}).
 *
 * @param options - Primary color and optional grid bias
 * @returns Configured transparent additive shader material
 */
export function createTronHologramMaterial(
  options: CreateTronHologramMaterialOptions,
): THREE.ShaderMaterial {
  const gridTint = options.gridTint !== undefined ? new THREE.Color(options.gridTint) : new THREE.Color(0x141414)
  const colorGain = options.colorGain ?? TRON_HOLOGRAM_DEFAULT_COLOR_GAIN
  const alphaGain = options.alphaGain ?? TRON_HOLOGRAM_DEFAULT_ALPHA_GAIN
  const opacity = options.opacity ?? TRON_HOLOGRAM_MATERIAL_OPACITY
  return new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color(options.color) },
      uGridTint: { value: gridTint },
      uTime: { value: 0 },
      uColorGain: { value: colorGain },
      uAlphaGain: { value: alphaGain },
    },
    vertexShader: TRON_HOLOGRAM_VERTEX_SHADER,
    fragmentShader: TRON_HOLOGRAM_FRAGMENT_SHADER,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    opacity,
  })
}

/**
 * Push the same clock value into every TRON hologram uniform (seconds).
 *
 * @param materials - Shader instances to update
 * @param seconds - Elapsed time in seconds (e.g. `performance.now() * 0.001`)
 */
export function syncTronHologramTimeSeconds(
  materials: readonly THREE.ShaderMaterial[],
  seconds: number,
): void {
  for (const mat of materials) {
    const u = mat.uniforms['uTime']
    if (u) u.value = seconds
  }
}

/**
 * Dispose every material in the list (call when tearing down an owner).
 *
 * @param materials - Instances created via {@link createTronHologramMaterial}
 */
export function disposeTronHologramMaterials(materials: readonly THREE.ShaderMaterial[]): void {
  for (const mat of materials) {
    mat.dispose()
  }
}
