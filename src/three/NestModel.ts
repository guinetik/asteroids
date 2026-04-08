/**
 * Instanced GLB prop for bug nests (`public/models/nest.glb`).
 *
 * Preloads the asset once, then clones the scene (via SkeletonUtils `clone`) for
 * each new instance so meshes and materials stay shared across copies.
 *
 * @author guinetik
 * @date 2026-04-08
 * @spec docs/superpowers/specs/2026-04-05-enemy-system-design.md
 */
import * as THREE from 'three'
import { clone as cloneSkinnedScene } from 'three/addons/utils/SkeletonUtils.js'
import { loadGLB } from './loadGLB'

/** Public URL path served from `public/models/nest.glb`. */
export const NEST_MODEL_PUBLIC_PATH = '/models/nest.glb'

/** Base asset scale applied to the GLB before per-instance tuning. */
const BASE_NEST_ASSET_SCALE = 0.03

/** Default uniform scale multiplier for new instances. */
const DEFAULT_NEST_SCALE = 1

/** Default shadow flags for nest meshes. */
const DEFAULT_CAST_SHADOW = true
const DEFAULT_RECEIVE_SHADOW = true
const HOLOGRAM_COLOR = new THREE.Color(0xff5b4d)

const HOLOGRAM_VERTEX_SHADER = /* glsl */ `
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

const HOLOGRAM_FRAGMENT_SHADER = /* glsl */ `
  uniform vec3 uColor;
  uniform float uTime;

  varying vec3 vWorldPos;
  varying vec3 vWorldNormal;
  varying vec2 vUv;

  void main() {
    vec3 viewDir = normalize(cameraPosition - vWorldPos);
    float fresnel = pow(1.0 - abs(dot(normalize(vWorldNormal), viewDir)), 2.2);

    float scanA = sin(vWorldPos.y * 4.5 - uTime * 5.5);
    float scanB = sin((vWorldPos.x + vWorldPos.z) * 2.0 - uTime * 2.8);
    float scan = 0.34 + 0.16 * scanA + 0.08 * scanB;

    float gridX = smoothstep(0.92, 1.0, abs(fract(vUv.x * 8.0 + uTime * 0.08) * 2.0 - 1.0));
    float gridY = smoothstep(0.85, 1.0, abs(fract(vUv.y * 14.0 - uTime * 0.18) * 2.0 - 1.0));
    float grid = max(gridX, gridY) * 0.65;

    float alpha = 0.045 + fresnel * 0.24 + scan * 0.09 + grid * 0.08;
    vec3 color = uColor * (0.24 + fresnel * 0.72 + scan * 0.22) + vec3(0.09, 0.03, 0.03) * grid;

    gl_FragColor = vec4(color, alpha);
  }
`

/** Options for {@link NestModel.create}. */
export interface NestModelCreateOptions {
  /** Uniform scale applied to the cloned nest (default {@link DEFAULT_NEST_SCALE}). */
  scale?: number
  /** When false, meshes do not cast shadows (default {@link DEFAULT_CAST_SHADOW}). */
  castShadow?: boolean
  /** When false, meshes do not receive shadows (default {@link DEFAULT_RECEIVE_SHADOW}). */
  receiveShadow?: boolean
}

let nestTemplate: THREE.Group | null = null
let nestTemplatePromise: Promise<THREE.Group> | null = null

/**
 * Load the nest GLB once and cache the root group for cloning.
 *
 * @returns The frozen template scene (do not add directly to the world — use {@link NestModel.create})
 */
async function ensureNestTemplate(): Promise<THREE.Group> {
  if (nestTemplate) return nestTemplate
  if (!nestTemplatePromise) {
    nestTemplatePromise = loadGLB(NEST_MODEL_PUBLIC_PATH).then((scene) => {
      nestTemplate = scene
      return scene
    })
  }
  return nestTemplatePromise
}

/**
 * GLB nest — add {@link group} to your scene after {@link NestModel.create}.
 *
 * GPU resources (geometries, materials) are shared across instances; {@link dispose}
 * only detaches this copy from the scene graph.
 */
export class NestModel {
  /** Parent group for positioning; contains the cloned mesh hierarchy. */
  readonly group = new THREE.Group()
  private readonly hologramMaterials: THREE.ShaderMaterial[] = []

  private constructor(sceneClone: THREE.Group, hologramMaterials: THREE.ShaderMaterial[]) {
    this.hologramMaterials = hologramMaterials
    this.group.add(sceneClone)
  }

  /**
   * Warm the nest GLB so the first {@link NestModel.create} does not hitch.
   */
  static async preload(): Promise<void> {
    await ensureNestTemplate()
  }

  /**
   * Create a new nest instance from the shared template.
   *
   * @param options - Scale and shadow tuning
   * @returns A nest ready to place via {@link group}
   */
  static async create(options?: NestModelCreateOptions): Promise<NestModel> {
    const template = await ensureNestTemplate()
    const sceneClone = cloneSkinnedScene(template) as THREE.Group
    const hologramMaterials: THREE.ShaderMaterial[] = []

    const scale = options?.scale ?? DEFAULT_NEST_SCALE
    sceneClone.scale.setScalar(BASE_NEST_ASSET_SCALE * scale)

    const castShadow = options?.castShadow ?? DEFAULT_CAST_SHADOW
    const receiveShadow = options?.receiveShadow ?? DEFAULT_RECEIVE_SHADOW
    sceneClone.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        const mesh = child as THREE.Mesh
        mesh.castShadow = castShadow
        mesh.receiveShadow = receiveShadow

        const hologramMaterial = new THREE.ShaderMaterial({
          uniforms: {
            uColor: { value: HOLOGRAM_COLOR.clone() },
            uTime: { value: 0 },
          },
          vertexShader: HOLOGRAM_VERTEX_SHADER,
          fragmentShader: HOLOGRAM_FRAGMENT_SHADER,
          transparent: true,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
          side: THREE.DoubleSide,
          opacity: 0.72,
        })
        mesh.material = hologramMaterial
        const timeUniform = hologramMaterial.uniforms['uTime']
        mesh.onBeforeRender = () => {
          if (timeUniform) {
            timeUniform.value = performance.now() * 0.001
          }
        }
        hologramMaterials.push(hologramMaterial)
      }
    })

    return new NestModel(sceneClone, hologramMaterials)
  }

  /**
   * Set world-space position of this nest.
   *
   * @param x - World X
   * @param y - World Y
   * @param z - World Z
   */
  placeAt(x: number, y: number, z: number): void {
    this.group.position.set(x, y, z)
  }

  /**
   * Set yaw in radians around world Y (after any existing rotation on the clone).
   *
   * @param yawRadians - Rotation about +Y
   */
  setYaw(yawRadians: number): void {
    this.group.rotation.y = yawRadians
  }

  /**
   * Remove this instance from the scene graph.
   *
   * Does not dispose geometries or materials — clones share GPU resources with
   * the preload template and with other instances.
   */
  dispose(): void {
    for (const material of this.hologramMaterials) {
      material.dispose()
    }
    this.group.clear()
  }
}
