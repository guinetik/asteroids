/**
 * Faction-tinted cartesian grid shader for bunker walls.
 *
 * Derives world-space UVs from object position so every wall, floor, and
 * ceiling shares one coherent grid regardless of mesh size. Emissive output
 * is intended to flow through the existing post-FX bloom.
 *
 * @author guinetik
 * @date 2026-04-27
 * @spec docs/superpowers/specs/2026-04-27-bunker-mission-design.md
 */
import * as THREE from 'three'

/** Configuration for {@link createBunkerGridMaterial}. */
export interface BunkerGridMaterialOptions {
  /** Faction tint hex (`#rrggbb`). */
  tint: number
  /** Cell size in world units. Defaults to 2.0. */
  cellSize?: number
  /** Line half-width as a fraction of `cellSize`. Defaults to 0.04. */
  lineWidth?: number
  /** Emissive multiplier. Defaults to 1.6. */
  emissive?: number
}

/** Default cell size in world units. */
const DEFAULT_CELL_SIZE = 2.0
/** Default line half-width relative to cell. */
const DEFAULT_LINE_WIDTH = 0.03
/** Default emissive multiplier. */
const DEFAULT_EMISSIVE = 0.85
/** Idle breathing cadence in Hz. */
const BREATHE_HZ = 0.5
/** Minimum emissive multiplier during the breath cycle. */
const BREATHE_MIN_FACTOR = 0.7
/** Strength of the procedural panel shading in non-grid areas. */
const PANEL_SHADE_STRENGTH = 0.22
/** Frequency of broad wall panels between grid lines. */
const PANEL_SHADE_SCALE = 0.5
/** Extra light on upward-facing surfaces so floor/ceiling are not flat black. */
const NORMAL_SHADE_GAIN = 0.18

const VERT = /* glsl */ `
  varying vec3 vWorldPos;
  varying vec3 vWorldNormal;
  void main() {
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vWorldPos = worldPos.xyz;
    vWorldNormal = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * viewMatrix * worldPos;
  }
`

const FRAG = /* glsl */ `
  precision highp float;
  varying vec3 vWorldPos;
  varying vec3 vWorldNormal;
  uniform vec3 uColorBase;
  uniform vec3 uColorGrid;
  uniform float uCellSize;
  uniform float uLineWidth;
  uniform float uEmissive;
  uniform float uTime;

  float panelHash(vec2 cell) {
    return fract(sin(dot(cell, vec2(127.1, 311.7))) * 43758.5453123);
  }

  // Pick two world axes by face normal — the largest absolute component is
  // the face normal axis; the other two are the in-plane UVs.
  vec2 worldUV(vec3 pos, vec3 n) {
    vec3 a = abs(n);
    if (a.x >= a.y && a.x >= a.z) return pos.yz;
    if (a.y >= a.z) return pos.xz;
    return pos.xy;
  }

  void main() {
    vec2 uv = worldUV(vWorldPos, vWorldNormal) / uCellSize;
    vec2 g = abs(fract(uv) - 0.5) - (0.5 - uLineWidth);
    float line = step(0.0, max(g.x, g.y));
    float breathe = mix(${BREATHE_MIN_FACTOR.toFixed(3)}, 1.0, 0.5 + 0.5 * sin(uTime * 6.2831853 * ${BREATHE_HZ.toFixed(3)}));
    float panel = panelHash(floor(uv * ${PANEL_SHADE_SCALE.toFixed(3)}));
    float panelShade = 1.0 + (panel - 0.5) * ${PANEL_SHADE_STRENGTH.toFixed(3)};
    float normalShade = 1.0 + abs(vWorldNormal.y) * ${NORMAL_SHADE_GAIN.toFixed(3)};
    vec3 shadedBase = uColorBase * panelShade * normalShade;
    vec3 gridColor = uColorGrid * uEmissive * breathe;
    vec3 col = mix(shadedBase, gridColor, line);
    gl_FragColor = vec4(col, 1.0);
  }
`

/**
 * Build the bunker grid material. The returned `ShaderMaterial` exposes a
 * `userData.tick(dt)` hook the scene controller calls each frame to advance
 * the breathing animation.
 *
 * Renders with `THREE.BackSide` because bunker geometry uses standard
 * outward-facing `BoxGeometry` and the camera sits inside the room.
 *
 * @param opts - Tint + tuning
 */
export function createBunkerGridMaterial(opts: BunkerGridMaterialOptions): THREE.ShaderMaterial {
  const colorBase = new THREE.Color(0x111925)
  const colorGrid = new THREE.Color(opts.tint)
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uColorBase: { value: colorBase },
      uColorGrid: { value: colorGrid },
      uCellSize: { value: opts.cellSize ?? DEFAULT_CELL_SIZE },
      uLineWidth: { value: opts.lineWidth ?? DEFAULT_LINE_WIDTH },
      uEmissive: { value: opts.emissive ?? DEFAULT_EMISSIVE },
      uTime: { value: 0 },
    },
    vertexShader: VERT,
    fragmentShader: FRAG,
    side: THREE.BackSide,
  })
  const uTime = mat.uniforms.uTime as { value: number }
  mat.userData.tick = (dt: number) => {
    uTime.value += dt
  }
  return mat
}
