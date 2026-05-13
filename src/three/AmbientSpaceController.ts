/**
 * Ambient space particle system for the map view.
 *
 * Maintains four depth-layered visual effects that wrap around the shuttle,
 * giving a sense of speed and liveliness at any zoom level:
 *
 *  - **Dust**        — 200 faint micro-points, spawn radius 1.5 u, drift slowly
 *  - **Rocks**       — 40 gray debris chunks, spawn shell 3–8 u, slow tumble
 *  - **Gas clouds**  — 8 large soft-glow sprites, spawn shell 8–25 u
 *  - **Comets**      — 4 bright streak lines, spawn shell 4–10 u, fast crossing paths
 *
 * All motion parallax comes from the shuttle flying through the field. Particles
 * themselves have tiny world-space velocities. When a particle drifts outside its
 * spawn radius it teleports back to a random point in the forward half-sphere ahead
 * of the shuttle's heading, ensuring something is always approaching the camera.
 *
 * @author guinetik
 * @date 2026-04-05
 * @spec docs/superpowers/specs/2026-04-05-dev-console-design.md
 */
import * as THREE from 'three'
import type { Tickable } from '@/lib/Tickable'
import cloudVertexShader from '@/three/shaders/ambient/cloud.vert.glsl?raw'
import cloudFragmentShader from '@/three/shaders/ambient/cloud.frag.glsl?raw'

// ─── Sentinel ─────────────────────────────────────────────────────────────────

/** Positions dead/wrapped particles here — outside all camera frustums. */
const FAR_AWAY = 99999

// ─── Dust layer constants ──────────────────────────────────────────────────────

/** Number of micro-dust particles. */
const DUST_COUNT = 200
/** World-space radius of the dust bubble around the shuttle. */
const DUST_RADIUS = 1.5
/** Max random drift speed per axis (units/s). */
const DUST_SPEED = 0.004
/** World-space point size (sizeAttenuation = true). */
const DUST_SIZE = 0.003
/** Material opacity. */
const DUST_OPACITY = 0.18
/** Dust tint — very faint blue-white. */
const DUST_COLOR = 0xccddff

// ─── Rock layer constants ──────────────────────────────────────────────────────

/** Number of debris rock particles. */
const ROCK_COUNT = 40
/** Inner edge of the rock spawn shell. */
const ROCK_INNER_RADIUS = 3
/** Outer edge of the rock spawn shell. */
const ROCK_OUTER_RADIUS = 8
/** Max random drift speed per axis (units/s). */
const ROCK_SPEED = 0.025
/** World-space point size (sizeAttenuation = true). */
const ROCK_SIZE = 0.045
/** Material opacity. */
const ROCK_OPACITY = 0.65
/** Rock color — cool gray. */
const ROCK_COLOR = 0x8899aa

// ─── Gas cloud layer constants ─────────────────────────────────────────────────

/** Number of gas cloud billboard meshes. */
const CLOUD_COUNT = 8
/**
 * Inner edge of the cloud spawn shell.
 * Clouds reach full opacity at this distance — the shuttle is right inside them.
 */
const CLOUD_INNER_RADIUS = 6
/**
 * Outer edge of the cloud spawn shell.
 * Clouds start to become visible (faint wisps) around 60–70% of this value,
 * giving plenty of approach distance so the player sees them growing from afar.
 */
const CLOUD_OUTER_RADIUS = 45
/** Max random drift speed per axis (units/s). */
const CLOUD_SPEED = 0.006
/**
 * World-space size of each cloud billboard plane.
 * Large, low-density planes create a diffuse atmospheric haze instead of knots.
 */
const CLOUD_MESH_SIZE = 16.0
/** Peak opacity — reached only when the shuttle is within CLOUD_INNER_RADIUS. */
const CLOUD_OPACITY = 0.42

/**
 * Per-cloud tint colors — six emission-nebula hues assigned round-robin.
 * Inspired by real HII-region palettes: Hα red, OIII teal, SII orange, Hβ blue.
 */
const CLOUD_TINT_COLORS = [
  new THREE.Color(0x3355dd), // Hβ blue
  new THREE.Color(0x008866), // OIII teal
  new THREE.Color(0xaa2244), // Hα red
  new THREE.Color(0x771177), // mixed magenta
  new THREE.Color(0x994411), // SII orange
  new THREE.Color(0x224488), // deep indigo
] as const

// ─── Gas cloud GLSL shaders ────────────────────────────────────────────────────

// ─── Comet layer constants ─────────────────────────────────────────────────────

/** Number of simultaneous comet streaks. */
const COMET_COUNT = 4
/** Radius at which comets spawn around the shuttle. */
const COMET_SPAWN_RADIUS = 7
/** Minimum comet speed (units/s). */
const COMET_SPEED_MIN = 0.7
/** Maximum comet speed (units/s). */
const COMET_SPEED_MAX = 1.6
/** Length of the rendered trail behind the comet head (world units). */
const COMET_TRAIL_LENGTH = 0.35
/** Distance from shuttle at which a comet resets. */
const COMET_RESET_DIST = 11
/** Comet head color — bright cyan-white. */
const COMET_COLOR = 0xaaeeff
/** Comet head opacity. */
const COMET_OPACITY = 0.9
/**
 * Half-angle (radians) of the forward cone in which comets are spawned.
 * π/2 = full hemisphere; smaller value = tighter forward bias.
 */
const COMET_FORWARD_CONE = Math.PI * 0.65

// ─── Shared helpers ────────────────────────────────────────────────────────────

/** Reusable scratch vectors — never store a reference to these. */
const _diff = new THREE.Vector3()
const _fwd = new THREE.Vector3()
const _rand = new THREE.Vector3()
const _right = new THREE.Vector3()
const _up = new THREE.Vector3()

/**
 * Shuttle local forward axis in world space.
 * The map view shuttle model faces +X, so we rotate (1,0,0) by the quaternion.
 */
function getShuttleForward(shuttle: THREE.Object3D, out: THREE.Vector3): THREE.Vector3 {
  return out.set(1, 0, 0).applyQuaternion(shuttle.quaternion)
}

/**
 * Returns a random point uniformly distributed inside a sphere of `radius`.
 */
function randomInSphere(radius: number, out: THREE.Vector3): THREE.Vector3 {
  // Rejection sampling — fast enough for small pools
  do {
    out.set(
      (Math.random() * 2 - 1) * radius,
      (Math.random() * 2 - 1) * radius,
      (Math.random() * 2 - 1) * radius,
    )
  } while (out.lengthSq() > radius * radius)
  return out
}

/**
 * Returns a random point in the forward hemisphere at exactly `radius` from origin.
 * `fwd` should be the normalised forward direction of the shuttle.
 */
function randomInForwardHemisphere(
  radius: number,
  fwd: THREE.Vector3,
  out: THREE.Vector3,
): THREE.Vector3 {
  // Build an orthonormal basis from fwd
  _right.set(0, 1, 0).cross(fwd)
  if (_right.lengthSq() < 1e-6) _right.set(0, 0, 1).cross(fwd)
  _right.normalize()
  _up.crossVectors(fwd, _right).normalize()

  // Random direction biased toward forward
  const theta = Math.acos(Math.random()) // [0, π/2]
  const phi = Math.random() * Math.PI * 2
  const sinTheta = Math.sin(theta)

  out
    .copy(fwd)
    .multiplyScalar(Math.cos(theta))
    .addScaledVector(_right, sinTheta * Math.cos(phi))
    .addScaledVector(_up, sinTheta * Math.sin(phi))
    .multiplyScalar(radius)
  return out
}

/**
 * Returns a random point inside a spherical shell [inner, outer].
 */
function randomInShell(inner: number, outer: number, out: THREE.Vector3): THREE.Vector3 {
  const radius = inner + Math.random() * (outer - inner)
  randomInSphere(1, out)
  out.normalize().multiplyScalar(radius)
  return out
}

/**
 * Returns a random point in the forward hemisphere inside a shell [inner, outer].
 */
function randomInForwardShell(
  inner: number,
  outer: number,
  fwd: THREE.Vector3,
  out: THREE.Vector3,
): THREE.Vector3 {
  const radius = inner + Math.random() * (outer - inner)
  randomInForwardHemisphere(radius, fwd, out)
  return out
}

// ─── AmbientLayer ─────────────────────────────────────────────────────────────

/**
 * Configuration for a single ambient particle layer.
 * All numeric fields are in world units unless otherwise noted.
 */
interface AmbientLayerConfig {
  /** Number of particles. */
  count: number
  /** Inner spawn radius (or 0 for a full sphere). */
  innerRadius: number
  /** Outer spawn radius. */
  outerRadius: number
  /** Maximum drift speed per axis. */
  speed: number
  /** Point size in world units (sizeAttenuation = true). */
  size: number
  /** Base color. */
  color: number
  /** Material opacity. */
  opacity: number
  /** Optional canvas glow texture. */
  texture?: THREE.Texture
}

/**
 * A single depth-layer of ambient particles.
 * Wraps particles that drift outside their spawn shell back to a random
 * position in the forward half-hemisphere.
 */
class AmbientLayer {
  /** Add this to the scene. */
  readonly points: THREE.Points

  private readonly count: number
  private readonly outerRadius: number
  private readonly innerRadius: number
  private readonly speed: number
  private readonly positions: Float32Array
  private readonly velocities: Float32Array

  constructor(config: AmbientLayerConfig) {
    this.count = config.count
    this.outerRadius = config.outerRadius
    this.innerRadius = config.innerRadius
    this.speed = config.speed

    this.positions = new Float32Array(config.count * 3)
    this.velocities = new Float32Array(config.count * 3)

    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3))

    const matParams: THREE.PointsMaterialParameters = {
      color: new THREE.Color(config.color),
      size: config.size,
      sizeAttenuation: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      transparent: true,
      opacity: config.opacity,
    }
    if (config.texture) {
      matParams.map = config.texture
      matParams.alphaTest = 0.01
    }

    this.points = new THREE.Points(geometry, new THREE.PointsMaterial(matParams))
    this.points.frustumCulled = false
  }

  /**
   * Scatter all particles randomly around `shuttlePos` in the spawn shell.
   * Called once on init.
   */
  scatter(shuttlePos: THREE.Vector3): void {
    for (let i = 0; i < this.count; i++) {
      const i3 = i * 3
      randomInShell(this.innerRadius, this.outerRadius, _rand)
      this.positions[i3] = shuttlePos.x + _rand.x
      this.positions[i3 + 1] = shuttlePos.y + _rand.y
      this.positions[i3 + 2] = shuttlePos.z + _rand.z

      this.velocities[i3] = (Math.random() - 0.5) * this.speed * 2
      this.velocities[i3 + 1] = (Math.random() - 0.5) * this.speed * 2
      this.velocities[i3 + 2] = (Math.random() - 0.5) * this.speed * 2
    }
    ;(this.points.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true
  }

  /**
   * Update particle positions; wrap any that leave the outer radius back to
   * a random forward-hemisphere position.
   */
  tick(dt: number, shuttle: THREE.Object3D): void {
    const shuttlePos = shuttle.position
    getShuttleForward(shuttle, _fwd)
    const posAttr = this.points.geometry.getAttribute('position') as THREE.BufferAttribute

    for (let i = 0; i < this.count; i++) {
      const i3 = i * 3
      // Read into locals — Float32Array elements are always defined for in-bounds indices
      let px = this.positions[i3]!
      let py = this.positions[i3 + 1]!
      let pz = this.positions[i3 + 2]!
      const vx = this.velocities[i3]!
      const vy = this.velocities[i3 + 1]!
      const vz = this.velocities[i3 + 2]!

      // Advance
      px += vx * dt
      py += vy * dt
      pz += vz * dt

      // Distance from shuttle
      _diff.set(px - shuttlePos.x, py - shuttlePos.y, pz - shuttlePos.z)

      if (_diff.length() > this.outerRadius) {
        // Wrap to forward hemisphere
        randomInForwardShell(this.innerRadius, this.outerRadius, _fwd, _rand)
        px = shuttlePos.x + _rand.x
        py = shuttlePos.y + _rand.y
        pz = shuttlePos.z + _rand.z
        // Fresh random velocity
        this.velocities[i3] = (Math.random() - 0.5) * this.speed * 2
        this.velocities[i3 + 1] = (Math.random() - 0.5) * this.speed * 2
        this.velocities[i3 + 2] = (Math.random() - 0.5) * this.speed * 2
      }

      // Write back
      this.positions[i3] = px
      this.positions[i3 + 1] = py
      this.positions[i3 + 2] = pz
    }

    posAttr.needsUpdate = true
  }

  /** Set layer visibility. */
  setVisible(visible: boolean): void {
    this.points.visible = visible
  }

  dispose(): void {
    this.points.geometry.dispose()
    const mat = this.points.material as THREE.PointsMaterial
    mat.map?.dispose()
    mat.dispose()
  }
}

// ─── CometLayer ───────────────────────────────────────────────────────────────

/**
 * Internal state for a single comet.
 */
interface CometState {
  /** Current head position (world space). */
  head: THREE.Vector3
  /** World-space velocity. */
  velocity: THREE.Vector3
}

/**
 * Renders `COMET_COUNT` bright streak lines.
 *
 * Each comet is two vertices in a `THREE.LineSegments` geometry:
 * the head at current position and the tail offset backward along the velocity.
 * When a comet leaves `COMET_RESET_DIST`, it respawns ahead of the shuttle
 * with a fresh crossing velocity.
 */
class CometLayer {
  /** Add this to the scene. */
  readonly lines: THREE.LineSegments

  private readonly comets: CometState[]
  private readonly positions: Float32Array

  constructor() {
    this.comets = Array.from({ length: COMET_COUNT }, () => ({
      head: new THREE.Vector3(FAR_AWAY, FAR_AWAY, FAR_AWAY),
      velocity: new THREE.Vector3(),
    }))

    // 2 vertices per comet (head + tail)
    this.positions = new Float32Array(COMET_COUNT * 2 * 3)

    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3))

    // Build index pairs: [0,1], [2,3], ...
    const indices = new Uint16Array(COMET_COUNT * 2)
    for (let i = 0; i < COMET_COUNT; i++) {
      indices[i * 2] = i * 2
      indices[i * 2 + 1] = i * 2 + 1
    }
    geometry.setIndex(new THREE.BufferAttribute(indices, 1))

    const material = new THREE.LineBasicMaterial({
      color: new THREE.Color(COMET_COLOR),
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      transparent: true,
      opacity: COMET_OPACITY,
    })

    this.lines = new THREE.LineSegments(geometry, material)
    this.lines.frustumCulled = false
  }

  /**
   * Scatter all comets in the spawn shell around `shuttlePos`.
   * Called once on init.
   */
  scatter(shuttlePos: THREE.Vector3, shuttle: THREE.Object3D): void {
    getShuttleForward(shuttle, _fwd)
    for (let i = 0; i < COMET_COUNT; i++) {
      this.resetComet(i, shuttlePos, _fwd)
    }
    this.writePositions()
  }

  tick(dt: number, shuttle: THREE.Object3D): void {
    const shuttlePos = shuttle.position
    getShuttleForward(shuttle, _fwd)

    for (let i = 0; i < COMET_COUNT; i++) {
      const comet = this.comets[i]!
      comet.head.addScaledVector(comet.velocity, dt)

      _diff.subVectors(comet.head, shuttlePos)
      if (_diff.length() > COMET_RESET_DIST) {
        this.resetComet(i, shuttlePos, _fwd)
      }
    }

    this.writePositions()
  }

  /** Set layer visibility. */
  setVisible(visible: boolean): void {
    this.lines.visible = visible
  }

  dispose(): void {
    this.lines.geometry.dispose()
    ;(this.lines.material as THREE.LineBasicMaterial).dispose()
  }

  // ── private ────────────────────────────────────────────────────────────────

  private resetComet(index: number, shuttlePos: THREE.Vector3, fwd: THREE.Vector3): void {
    const comet = this.comets[index]!

    // Spawn in forward half-shell
    randomInForwardShell(COMET_SPAWN_RADIUS * 0.5, COMET_SPAWN_RADIUS, fwd, _rand)
    comet.head.copy(shuttlePos).add(_rand)

    // Random velocity biased forward but with lateral crossing component
    // so comets visibly cross the camera rather than fly straight away
    const speed = COMET_SPEED_MIN + Math.random() * (COMET_SPEED_MAX - COMET_SPEED_MIN)
    const coneAngle = COMET_FORWARD_CONE

    // Build tangent plane vectors
    _right.set(0, 1, 0).cross(fwd)
    if (_right.lengthSq() < 1e-6) _right.set(0, 0, 1).cross(fwd)
    _right.normalize()
    _up.crossVectors(fwd, _right).normalize()

    const theta = Math.random() * coneAngle // [0, coneAngle]
    const phi = Math.random() * Math.PI * 2
    const sinT = Math.sin(theta)

    comet.velocity
      .copy(fwd)
      .multiplyScalar(Math.cos(theta))
      .addScaledVector(_right, sinT * Math.cos(phi))
      .addScaledVector(_up, sinT * Math.sin(phi))
      .multiplyScalar(speed)
  }

  private writePositions(): void {
    const posAttr = this.lines.geometry.getAttribute('position') as THREE.BufferAttribute
    for (let i = 0; i < COMET_COUNT; i++) {
      const comet = this.comets[i]!
      const base = i * 6 // 2 vertices * 3 floats

      // Head
      this.positions[base] = comet.head.x
      this.positions[base + 1] = comet.head.y
      this.positions[base + 2] = comet.head.z

      // Tail = head - velocity_normalized * COMET_TRAIL_LENGTH
      const speed = comet.velocity.length()
      if (speed > 0.001) {
        this.positions[base + 3] = comet.head.x - (comet.velocity.x / speed) * COMET_TRAIL_LENGTH
        this.positions[base + 4] = comet.head.y - (comet.velocity.y / speed) * COMET_TRAIL_LENGTH
        this.positions[base + 5] = comet.head.z - (comet.velocity.z / speed) * COMET_TRAIL_LENGTH
      } else {
        this.positions[base + 3] = comet.head.x
        this.positions[base + 4] = comet.head.y
        this.positions[base + 5] = comet.head.z
      }
    }
    posAttr.needsUpdate = true
  }
}

// ─── GasCloudSprite ────────────────────────────────────────────────────────────

/**
 * Single billboard gas cloud mesh.
 *
 * Uses a `ShaderMaterial` with FBM noise to produce a nebula-style cloud with
 * internal structure, voids, and emission knots. Billboarding is achieved by
 * copying the camera's quaternion every frame via {@link billboard}.
 */
class GasCloudSprite {
  /** The Three.js mesh added to the scene. */
  readonly mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>
  /** World-space position, managed externally by `GasCloudLayer`. */
  readonly position = new THREE.Vector3()
  /** Per-frame drift velocity (world units / s). */
  readonly velocity = new THREE.Vector3()

  constructor(seed: number, color: THREE.Color) {
    const material = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: Math.random() * 100 }, // stagger per-cloud animation phase
        uSeed: { value: seed },
        uColor: { value: color.clone() },
        uOpacity: { value: CLOUD_OPACITY },
      },
      vertexShader: cloudVertexShader,
      fragmentShader: cloudFragmentShader,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    })
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(CLOUD_MESH_SIZE, CLOUD_MESH_SIZE), material)
    this.mesh.frustumCulled = false
  }

  /**
   * Advance the internal time uniform, align the mesh to face the camera, and
   * apply distance-based opacity so clouds bloom in as the shuttle approaches.
   *
   * @param dt - Delta time in seconds.
   * @param cameraQuat - Camera world quaternion for billboarding.
   * @param dist - Current distance from this cloud to the shuttle (world units).
   */
  update(dt: number, cameraQuat: THREE.Quaternion, dist: number): void {
    this.mesh.material.uniforms['uTime']!.value += dt
    this.mesh.position.copy(this.position)
    this.mesh.quaternion.copy(cameraQuat)

    // Map distance → [0, 1]: 0 at outer edge (invisible), 1 at inner edge (full).
    // A smoothstep curve makes the approach feel organic rather than linear.
    const t = THREE.MathUtils.clamp(
      1 - (dist - CLOUD_INNER_RADIUS) / (CLOUD_OUTER_RADIUS - CLOUD_INNER_RADIUS),
      0,
      1,
    )
    const fade = t * t * (3 - 2 * t) // smoothstep
    this.mesh.material.uniforms['uOpacity']!.value = CLOUD_OPACITY * fade
  }

  dispose(): void {
    this.mesh.geometry.dispose()
    this.mesh.material.dispose()
  }
}

// ─── GasCloudLayer ─────────────────────────────────────────────────────────────

/**
 * Manages the pool of {@link GasCloudSprite} instances that drift around the
 * shuttle and wrap to the forward hemisphere when they go out of range.
 */
class GasCloudLayer {
  private readonly sprites: GasCloudSprite[]

  constructor() {
    this.sprites = Array.from({ length: CLOUD_COUNT }, (_, i) => {
      const seed = 10.0 + i * 7.3 + Math.random() * 100
      const color = CLOUD_TINT_COLORS[i % CLOUD_TINT_COLORS.length]!
      return new GasCloudSprite(seed, color)
    })
  }

  /** Add all cloud meshes to the scene. */
  addToScene(scene: THREE.Scene): void {
    for (const s of this.sprites) scene.add(s.mesh)
  }

  /**
   * Scatter clouds across the middle-to-far portion of the spawn shell.
   *
   * Half the clouds land at 30–60% of outer radius (partially visible on first
   * look), the other half at 60–100% (very faint, approaching wisps). This
   * gives an immediate sense of depth without any pop-in at load time.
   */
  scatter(pos: THREE.Vector3): void {
    for (let i = 0; i < this.sprites.length; i++) {
      const s = this.sprites[i]!
      // Alternate between mid-range and far-range bands
      const bandInner = i % 2 === 0 ? CLOUD_OUTER_RADIUS * 0.3 : CLOUD_OUTER_RADIUS * 0.6
      const bandOuter = i % 2 === 0 ? CLOUD_OUTER_RADIUS * 0.6 : CLOUD_OUTER_RADIUS
      randomInShell(bandInner, bandOuter, _rand)
      s.position.copy(pos).add(_rand)
      s.velocity.set(
        (Math.random() - 0.5) * CLOUD_SPEED * 2,
        (Math.random() - 0.5) * CLOUD_SPEED * 2,
        (Math.random() - 0.5) * CLOUD_SPEED * 2,
      )
    }
  }

  /**
   * Advance all clouds, billboard them toward the camera, and wrap any that
   * have drifted beyond `CLOUD_OUTER_RADIUS` back into the camera's forward
   * hemisphere so the player always sees new clouds approaching ahead of them.
   *
   * @param dt - Delta time in seconds.
   * @param shuttle - Shuttle object used as the anchor point.
   * @param cameraQuat - Camera world quaternion — used both for billboarding
   *   and to compute the hemisphere spawn direction.
   */
  tick(dt: number, shuttle: THREE.Object3D, cameraQuat: THREE.Quaternion): void {
    const pos = shuttle.position

    // Derive the camera's look direction from its quaternion.
    // Three.js cameras face -Z in local space, so rotate (0,0,-1) to world space.
    _fwd.set(0, 0, -1).applyQuaternion(cameraQuat).normalize()

    // Wraps land in the outer 35% of the shell — far enough to start as a
    // tiny faint wisp that the player can watch grow as the shuttle closes in.
    const wrapInner = CLOUD_OUTER_RADIUS * 0.65

    for (const s of this.sprites) {
      s.position.addScaledVector(s.velocity, dt)

      _diff.subVectors(s.position, pos)
      const dist = _diff.length()

      s.update(dt, cameraQuat, dist)

      if (dist > CLOUD_OUTER_RADIUS) {
        // Respawn ahead of the camera (in its look direction from the shuttle)
        // so the player sees the wisp materialise in front of them.
        randomInForwardShell(wrapInner, CLOUD_OUTER_RADIUS, _fwd, _rand)
        s.position.copy(pos).add(_rand)
        s.velocity.set(
          (Math.random() - 0.5) * CLOUD_SPEED * 2,
          (Math.random() - 0.5) * CLOUD_SPEED * 2,
          (Math.random() - 0.5) * CLOUD_SPEED * 2,
        )
      }
    }
  }

  /** Set visibility on all cloud meshes. */
  setVisible(visible: boolean): void {
    for (const s of this.sprites) s.mesh.visible = visible
  }

  dispose(): void {
    for (const s of this.sprites) s.dispose()
  }
}

// ─── AmbientSpaceController ───────────────────────────────────────────────────

/**
 * Manages all ambient space particle layers in the map view.
 *
 * Register with the tick handler at `TICK_PRIORITY_ANIMATION` and call
 * {@link attach} once the shuttle controller is ready. Call {@link setCamera}
 * to enable gas cloud billboarding.
 *
 * @example
 * ```ts
 * const ambient = new AmbientSpaceController(scene)
 * ambient.attach(shuttleController.group)
 * ambient.setCamera(vehicleCamera.camera)
 * tickHandler.register(ambient, TICK_PRIORITY_ANIMATION)
 * ```
 */
export class AmbientSpaceController implements Tickable {
  private dustLayer: AmbientLayer
  private rockLayer: AmbientLayer
  private cloudLayer: GasCloudLayer
  private cometLayer: CometLayer
  private shuttle: THREE.Object3D | null = null
  private camera: THREE.Camera | null = null
  /** User-controlled toggle (Debris button). */
  private visible = true
  /** Scene-driven suppression — false during orbit/approach modes. */
  private active = true
  /** Opening map intro / cutscene — hides debris without changing the user toggle. */
  private mapIntroSuppressed = false

  constructor(scene: THREE.Scene) {
    this.dustLayer = new AmbientLayer({
      count: DUST_COUNT,
      innerRadius: 0,
      outerRadius: DUST_RADIUS,
      speed: DUST_SPEED,
      size: DUST_SIZE,
      color: DUST_COLOR,
      opacity: DUST_OPACITY,
    })

    this.rockLayer = new AmbientLayer({
      count: ROCK_COUNT,
      innerRadius: ROCK_INNER_RADIUS,
      outerRadius: ROCK_OUTER_RADIUS,
      speed: ROCK_SPEED,
      size: ROCK_SIZE,
      color: ROCK_COLOR,
      opacity: ROCK_OPACITY,
    })

    this.cloudLayer = new GasCloudLayer()
    this.cometLayer = new CometLayer()

    scene.add(this.dustLayer.points)
    scene.add(this.rockLayer.points)
    this.cloudLayer.addToScene(scene)
    scene.add(this.cometLayer.lines)
  }

  /**
   * Set the shuttle `Object3D` to anchor the particle field to.
   * Immediately scatters all layers around the shuttle's current position.
   */
  attach(shuttle: THREE.Object3D): void {
    this.shuttle = shuttle
    const pos = shuttle.position
    this.dustLayer.scatter(pos)
    this.rockLayer.scatter(pos)
    this.cloudLayer.scatter(pos)
    this.cometLayer.scatter(pos, shuttle)
  }

  /**
   * Provide the active camera so gas cloud billboards can face it every frame.
   * Must be called before the first tick for clouds to orient correctly.
   *
   * @param camera - The Three.js camera used to render the map scene.
   */
  setCamera(camera: THREE.Camera): void {
    this.camera = camera
  }

  tick(dt: number): void {
    if (!this.shuttle || !this.visible || !this.active || this.mapIntroSuppressed) return
    this.dustLayer.tick(dt, this.shuttle)
    this.rockLayer.tick(dt, this.shuttle)
    const cameraQuat = this.camera?.quaternion ?? new THREE.Quaternion()
    this.cloudLayer.tick(dt, this.shuttle, cameraQuat)
    this.cometLayer.tick(dt, this.shuttle)
  }

  /**
   * Scene-driven suppression gate — does not affect the user's toggle state.
   *
   * Call with `false` when the shuttle enters orbit/approach mode so particles
   * disappear cleanly; call with `true` when returning to free flight.
   * The user's Debris toggle is preserved independently.
   *
   * @param active - `true` = allow particles to tick and render, `false` = suppress
   */
  setActive(active: boolean): void {
    if (this.active === active) return
    this.active = active
    this.applyAmbientLayerVisibility()
  }

  /**
   * Map intro cutscene: force all ambient layers off regardless of orbit mode.
   * Does not change {@link toggle} state; clears when set to `false`.
   *
   * @param suppressed - `true` during the cinematic / locked intro flow.
   */
  setMapIntroSuppressed(suppressed: boolean): void {
    if (this.mapIntroSuppressed === suppressed) return
    this.mapIntroSuppressed = suppressed
    this.applyAmbientLayerVisibility()
  }

  /**
   * Toggle all layers on/off (user-controlled Debris button).
   * Returns the new visibility state.
   */
  toggle(): boolean {
    this.visible = !this.visible
    this.applyAmbientLayerVisibility()
    return this.visible
  }

  /** Updates mesh visibility from user toggle, orbit {@link setActive}, and intro suppression. */
  private applyAmbientLayerVisibility(): void {
    const shouldShow = this.visible && this.active && !this.mapIntroSuppressed
    this.dustLayer.setVisible(shouldShow)
    this.rockLayer.setVisible(shouldShow)
    this.cloudLayer.setVisible(shouldShow)
    this.cometLayer.setVisible(shouldShow)
  }

  /** Whether the ambient field is currently visible (user toggle only). */
  get isVisible(): boolean {
    return this.visible
  }

  dispose(): void {
    this.dustLayer.dispose()
    this.rockLayer.dispose()
    this.cloudLayer.dispose()
    this.cometLayer.dispose()
  }
}
