/**
 * Cinematic arrival sequence for the asteroid level.
 *
 * Loads the shuttle model, animates approach → flip → doors open →
 * lander detach → shuttle departs. Manages a cinematic camera
 * that transitions to follow the lander at the end.
 *
 * @author guinetik
 * @date 2026-04-06
 */
import * as THREE from 'three'
import { loadGLB } from './loadGLB'
import { FuelTank } from './FuelTank'
import { HabitatModule } from './HabitatModule'
import { useAudio } from '@/audio/useAudio'
import { loadProfile } from '@/lib/player/profile'
import {
  applyShuttlePaintMaterialsFromProfile,
  cloneAndCollectShuttlePaintMaterials,
  type ShuttlePaintMaterialTarget,
} from '@/three/cosmetics/shuttlePaintMaterials'

const SHUTTLE_MODEL_PATH = '/models/shuttle.glb'
const LANDER_MODEL_PATH = '/models/lander.glb'

/** Belly underlight — illuminates the shuttle hull from below when parked. */
const NAV_UNDER_LIGHT_COLOR = 0x6699cc
/** Belly underlight intensity (gameplay value). Pre-created at intensity 0. */
const NAV_UNDER_LIGHT_INTENSITY = 20
/** Belly underlight reach. */
const NAV_UNDER_LIGHT_DISTANCE = 1200
/** Belly underlight local-space offset on the shuttle group. */
const NAV_UNDER_LIGHT_OFFSET_Y = -25
/** Top nav light — skyline silhouette glow. */
const NAV_TOP_LIGHT_COLOR = 0xffeedd
/** Top nav light intensity (gameplay value). */
const NAV_TOP_LIGHT_INTENSITY = 10
/** Top nav light reach. */
const NAV_TOP_LIGHT_DISTANCE = 800
/** Top nav light local-space offset. */
const NAV_TOP_LIGHT_OFFSET_Y = 15
/** Cargo bay interior glow. */
const NAV_CARGO_GLOW_COLOR = 0xffaa44
/** Cargo bay glow intensity (gameplay value). */
const NAV_CARGO_GLOW_INTENSITY = 8
/** Cargo bay glow reach. */
const NAV_CARGO_GLOW_DISTANCE = 600
/** Cargo bay glow local-space offset. */
const NAV_CARGO_GLOW_OFFSET_X = -3
/** Cargo bay glow local-space offset. */
const NAV_CARGO_GLOW_OFFSET_Y = -2
/** Engine nozzle glow. */
const NAV_ENGINE_GLOW_COLOR = 0xff6633
/** Engine nozzle glow intensity (gameplay value). */
const NAV_ENGINE_GLOW_INTENSITY = 6
/** Engine nozzle glow reach. */
const NAV_ENGINE_GLOW_DISTANCE = 500
/** Engine nozzle glow local-space offset. */
const NAV_ENGINE_GLOW_OFFSET_X = -6

/** NASA model is in centimeters. Scale to meters. */
const MODEL_SCALE = 0.01

/** Model orientation correction: rotate -90° around X to lay flat on XZ. */
const MODEL_ROTATION_X = -Math.PI / 2

/** Cargo bay door open angle (radians). */
const DOOR_OPEN_ANGLE = Math.PI * 0.6

/** Cargo bay door animation speed (radians/sec). */
const DOOR_ANIM_SPEED = 1.5

/** Scale for the lander model inside the cargo bay (raw shuttle cm space). */
const CARGO_LANDER_SCALE = 30

/** Lander position inside the bay — raw model coords. */
const CARGO_LANDER_OFFSET = new THREE.Vector3(-320, 0, 20)

// ── Timeline phase durations (seconds) ──────────────────────────
/** Static beauty shot of the asteroid before the camera glides toward the shuttle. */
const PHASE_ESTABLISH_DURATION = 1.5
/**
 * Time spent fading from full black to clear at the very start of the
 * establish phase. Must be <= PHASE_ESTABLISH_DURATION so the asteroid is
 * fully visible before the transition phase begins.
 */
const ESTABLISH_FADE_IN_DURATION = 1.0
/** Long, smooth glide from the asteroid framing to the approach-phase opening frame. */
const PHASE_TRANSITION_DURATION = 4.0
/** Shuttle approaches from distance. */
const PHASE_APPROACH_DURATION = 3.5
/** Shuttle rotates 180° (flip maneuver). */
const PHASE_FLIP_DURATION = 1.5
/** Doors open, brief pause. */
const PHASE_DOORS_DURATION = 1.5
/** Lander detaches, falls with gravity, camera follows. */
const PHASE_DETACH_DURATION = 1.8
/** Fade to black while lander falls. */
const PHASE_FADEOUT_DURATION = 1.0

/** Total sequence duration. */
export const ARRIVAL_SEQUENCE_DURATION =
  PHASE_ESTABLISH_DURATION +
  PHASE_TRANSITION_DURATION +
  PHASE_APPROACH_DURATION +
  PHASE_FLIP_DURATION +
  PHASE_DOORS_DURATION +
  PHASE_DETACH_DURATION +
  PHASE_FADEOUT_DURATION

// ── Exfil phase durations (seconds) — reverse of arrival ────────
/** Lander rises into cargo bay. */
const EXFIL_DOCK_DURATION = 3.0
/** Cargo doors close. */
const EXFIL_DOORS_DURATION = 2.0
/** Shuttle flips 180° back upright. */
const EXFIL_FLIP_DURATION = 2.5
/** Shuttle accelerates away. */
const EXFIL_DEPART_DURATION = 4.0
/** Fade to black. */
const EXFIL_FADEOUT_DURATION = 1.5

/** Total exfil cutscene duration (must match levelStateMachine). */
export const EXFIL_SEQUENCE_DURATION =
  EXFIL_DOCK_DURATION +
  EXFIL_DOORS_DURATION +
  EXFIL_FLIP_DURATION +
  EXFIL_DEPART_DURATION +
  EXFIL_FADEOUT_DURATION

// ── Approach path ───────────────────────────────────────────────
/** Shuttle starts this far from the asteroid (world units). */
const APPROACH_START_DISTANCE = 2000
/** Shuttle stops this far from the lander spawn point. */
const APPROACH_END_DISTANCE = 60
/** Shuttle approach altitude measured ABOVE the landing point's ground Y. */
const APPROACH_ALTITUDE_OFFSET = 800
/** Shuttle scale during the cinematic approach (small, seen from distance). */
const SHUTTLE_CINEMATIC_SCALE = 1.0

/**
 * Absolute world position of the camera during the static establish shot.
 * Centered on Y=0 (the asteroid's equator — its GLB pivot lives at world
 * origin), so the body fills the frame symmetrically rather than sitting in
 * the lower half. Distance ~3605 — inside the level starfield radius (4000).
 */
const ESTABLISH_CAM_POSITION = new THREE.Vector3(2000, 0, -3000)
/** Point the establish-phase camera looks at — the asteroid's geometric center. */
const ESTABLISH_LOOKAT = new THREE.Vector3(0, 0, 0)
/** Default perspective FOV used by every phase except establish. */
const BASE_CAMERA_FOV = 40
/**
 * Wide cinematic FOV used during the establish beauty shot so the full
 * asteroid (3500-unit bake region) fits in frame from inside the starfield.
 */
const ESTABLISH_FOV = 70

// ── Approach-phase camera arc (also the transition target frame) ─
/** Approach-phase camera distance behind the shuttle at t=0 (pulls in to APPROACH_CAM_END_DISTANCE). */
const APPROACH_CAM_START_DISTANCE = 400
/** Approach-phase camera height above the shuttle at t=0. */
const APPROACH_CAM_START_HEIGHT = 100
/** Approach-phase camera lateral offset from the shuttle at t=0. */
const APPROACH_CAM_START_SIDE = 80
/** Approach-phase camera distance behind the shuttle at t=1. */
const APPROACH_CAM_END_DISTANCE = 80
/** Approach-phase camera height above the shuttle at t=1. */
const APPROACH_CAM_END_HEIGHT = 25
/** Approach-phase camera lateral offset from the shuttle at t=1. */
const APPROACH_CAM_END_SIDE = 20

/**
 * Shuttle scale when parked hovering — large enough that the gameplay lander
 * (MODEL_SCALE=5) looks like it fits inside the cargo bay.
 * The cargo lander inside the shuttle is at CARGO_LANDER_SCALE=30 in 0.01 model space,
 * so the shuttle needs to be ~500x its cinematic scale to match gameplay proportions.
 */
const SHUTTLE_PARKED_SCALE = 15

/** Parked shuttle altitude measured ABOVE the landing point's ground Y. */
const LANDER_PARK_ALTITUDE_OFFSET = 875

/** Centerline exfil floodlight so the parked shuttle reads from the ground. */
const EXFIL_FLOODLIGHT_COLOR = 0xf4f7ff
const EXFIL_FLOODLIGHT_INTENSITY = 72
const EXFIL_FLOODLIGHT_DISTANCE = 900
const EXFIL_FLOODLIGHT_ANGLE = Math.PI * 0.16
const EXFIL_FLOODLIGHT_PENUMBRA = 0.9
const EXFIL_FLOODLIGHT_DECAY = 1.35
const EXFIL_FLOODLIGHT_X_OFFSET = -3
const EXFIL_FLOODLIGHT_Y_OFFSET = 0
const EXFIL_FLOODLIGHT_TARGET_Y = 260
const EXFIL_FLOODLIGHT_SHADOW_MAP_SIZE = 512
const EXFIL_FLOODLIGHT_SHADOW_BIAS = -0.0008
const EXFIL_FLOODLIGHT_CONE_RADIUS = 32
const EXFIL_FLOODLIGHT_CONE_LENGTH = 260
const EXFIL_FLOODLIGHT_CONE_OPACITY = 0.018

/** Lander fall gravity after detach (world units/sec²). */
const LANDER_FALL_GRAVITY = 3.0

/** Idle thruster sprite size (in raw model space, pre MODEL_SCALE). */
const THRUSTER_SPRITE_SIZE = 140

/** Thruster sprite X offset behind nozzle (raw model space). */
const THRUSTER_SPRITE_X_OFFSET = -80

/** Timeline phase identifiers. */
type ArrivalPhase =
  | 'establish'
  | 'transition'
  | 'approach'
  | 'flip'
  | 'doors'
  | 'detach'
  | 'fadeout'
  | 'done'

/** Exfil (reverse departure) phase identifiers. */
type ExfilPhase = 'dock' | 'closeDoors' | 'flipBack' | 'depart' | 'exfilFadeout' | 'done'

/**
 * Cinematic arrival sequence for the asteroid level.
 *
 * @author guinetik
 * @date 2026-04-06
 */
export class ArrivalSequence {
  /** Root group added to the scene. */
  readonly shuttleGroup = new THREE.Group()

  /** The cinematic camera managed by this sequence. */
  readonly camera: THREE.PerspectiveCamera

  /** Whether the sequence has finished. */
  get isDone(): boolean {
    return this.phase === 'done'
  }

  /** World position where the lander should spawn after detach. */
  get landerSpawnPosition(): THREE.Vector3 {
    return this.landerWorldPos.clone()
  }

  private phase: ArrivalPhase = 'establish'
  private elapsed = 0
  private phaseElapsed = 0

  // Captured at the moment the transition phase starts so it can lerp from
  // wherever the establish phase left the camera to the approach-phase frame.
  private readonly transitionCamStart = new THREE.Vector3()
  private readonly transitionLookAtStart = new THREE.Vector3()
  private transitionFovStart = ESTABLISH_FOV

  // Model nodes
  private shuttleScene: THREE.Object3D | null = null
  private doorPortNode: THREE.Object3D | null = null
  private doorStbNode: THREE.Object3D | null = null
  private doorPortClosedRotX = 0
  private doorStbClosedRotX = 0
  private doorProgress = 0
  private readonly shuttlePaintMaterials: ShuttlePaintMaterialTarget[] = []
  private landerModel: THREE.Object3D | null = null
  private landerDetached = false
  private landerWorldPos = new THREE.Vector3()
  private landerFallSpeed = 0
  private readonly thrusterSprites: THREE.Sprite[] = []
  private thrusterElapsed = 0
  /** The detached lander group in scene space (for falling animation). */
  private fallingLander: THREE.Object3D | null = null
  private exfilFloodlight: THREE.SpotLight | null = null
  private exfilFloodlightTarget: THREE.Object3D | null = null
  private exfilFloodlightCone: THREE.Mesh | null = null
  /**
   * Persistent nav lights pre-created during {@link load} with `intensity = 0`,
   * lit by {@link parkShuttle}. Created up front so they participate in the
   * boot precompile pass — toggling visibility (or adding lights post-boot)
   * mutates `NUM_POINT_LIGHTS`, which forces every lit material in the scene
   * to recompile on its next draw. See `ThrusterWashController` (same pattern).
   */
  private navUnderLight: THREE.PointLight | null = null
  /** See {@link navUnderLight}. */
  private navTopLight: THREE.PointLight | null = null
  /** See {@link navUnderLight}. */
  private navCargoGlow: THREE.PointLight | null = null
  /** See {@link navUnderLight}. */
  private navEngineGlow: THREE.PointLight | null = null

  // Shuttle flight state
  private shuttleStartPos = new THREE.Vector3()
  private shuttleEndPos = new THREE.Vector3()

  // Exfil state
  private exfilPhase: ExfilPhase | null = null
  private exfilPhaseElapsed = 0
  /** Lander start world position (gameplay lander pos). */
  private exfilLanderStartPos = new THREE.Vector3()
  /** Lander target world position (cargo bay opening). */
  private exfilLanderTargetPos = new THREE.Vector3()
  private exfilDepartStartPos = new THREE.Vector3()
  private exfilDepartEndPos = new THREE.Vector3()

  /** Called when the lander detaches — passes world position for LanderController placement. */
  onLanderDetach: ((position: THREE.Vector3) => void) | null = null

  /** Called each frame with fade opacity (0 = clear, 1 = black). */
  onFadeOut: ((opacity: number) => void) | null = null

  /** Called when the full sequence completes. */
  onComplete: (() => void) | null = null

  constructor(private readonly landerSpawnTarget: THREE.Vector3) {
    // Initial phase is 'establish', so the camera starts at the wide
    // cinematic FOV. nextPhase('approach') swaps it back to BASE_CAMERA_FOV.
    this.camera = new THREE.PerspectiveCamera(
      ESTABLISH_FOV,
      window.innerWidth / window.innerHeight,
      0.1,
      15000,
    )

    this.shuttleEndPos.set(
      landerSpawnTarget.x,
      landerSpawnTarget.y + APPROACH_ALTITUDE_OFFSET,
      landerSpawnTarget.z - APPROACH_END_DISTANCE,
    )
    this.shuttleStartPos.set(
      landerSpawnTarget.x,
      landerSpawnTarget.y + APPROACH_ALTITUDE_OFFSET,
      landerSpawnTarget.z - APPROACH_START_DISTANCE,
    )
    this.shuttleGroup.position.copy(this.shuttleStartPos)
    // Nose along +X in model space; rotate -90° Y so nose points +Z (travel direction)
    this.shuttleGroup.rotation.y = -Math.PI / 2
  }

  /** Load the shuttle model and set up internal structure. */
  async load(): Promise<void> {
    this.shuttleScene = await loadGLB(SHUTTLE_MODEL_PATH)
    this.shuttleScene.scale.setScalar(MODEL_SCALE)
    this.shuttleScene.rotation.x = MODEL_ROTATION_X
    this.shuttlePaintMaterials.push(...cloneAndCollectShuttlePaintMaterials(this.shuttleScene))
    this.applySavedShuttlePaintjob()
    this.shuttleGroup.add(this.shuttleScene)
    this.shuttleScene.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        child.castShadow = true
      }
    })
    const shuttleScene = this.shuttleScene
    this.shuttleGroup.scale.setScalar(SHUTTLE_CINEMATIC_SCALE)

    // Fill lights attached to shuttle — keeps hull readable after flip
    // Model is ~14 units across (1400cm * MODEL_SCALE 0.01), so lights must be close
    const cinematicFill = new THREE.PointLight(0xddeeff, 30, 60)
    cinematicFill.position.set(0, 12, 0)
    this.shuttleGroup.add(cinematicFill)
    const cinematicBelow = new THREE.PointLight(0xffeedd, 20, 50)
    cinematicBelow.position.set(0, -10, 0)
    this.shuttleGroup.add(cinematicBelow)
    const cinematicRim = new THREE.PointLight(0xffeedd, 15, 50)
    cinematicRim.position.set(-15, 0, 0)
    this.shuttleGroup.add(cinematicRim)

    // Nav lights — pre-created so the boot precompile sees them in
    // `NUM_POINT_LIGHTS`. `parkShuttle()` lights them up by intensity, never
    // by adding fresh lights (which would otherwise trigger a scene-wide
    // shader recompile cascade the moment the cinematic ends).
    this.navUnderLight = new THREE.PointLight(
      NAV_UNDER_LIGHT_COLOR,
      0,
      NAV_UNDER_LIGHT_DISTANCE,
    )
    this.navUnderLight.position.set(0, NAV_UNDER_LIGHT_OFFSET_Y, 0)
    this.shuttleGroup.add(this.navUnderLight)
    this.navTopLight = new THREE.PointLight(NAV_TOP_LIGHT_COLOR, 0, NAV_TOP_LIGHT_DISTANCE)
    this.navTopLight.position.set(0, NAV_TOP_LIGHT_OFFSET_Y, 0)
    this.shuttleGroup.add(this.navTopLight)
    this.navCargoGlow = new THREE.PointLight(
      NAV_CARGO_GLOW_COLOR,
      0,
      NAV_CARGO_GLOW_DISTANCE,
    )
    this.navCargoGlow.position.set(NAV_CARGO_GLOW_OFFSET_X, NAV_CARGO_GLOW_OFFSET_Y, 0)
    this.shuttleGroup.add(this.navCargoGlow)
    this.navEngineGlow = new THREE.PointLight(
      NAV_ENGINE_GLOW_COLOR,
      0,
      NAV_ENGINE_GLOW_DISTANCE,
    )
    this.navEngineGlow.position.set(NAV_ENGINE_GLOW_OFFSET_X, 0, 0)
    this.shuttleGroup.add(this.navEngineGlow)

    // Find door nodes
    this.doorPortNode = this.findNode(shuttleScene, 'door-prt')
    this.doorStbNode = this.findNode(shuttleScene, 'door-stb')
    if (this.doorPortNode) this.doorPortClosedRotX = this.doorPortNode.rotation.x
    if (this.doorStbNode) this.doorStbClosedRotX = this.doorStbNode.rotation.x

    // Fuel tanks (cosmetic, always full)
    const landerTank = new FuelTank({
      radius: 80,
      length: 120,
      position: new THREE.Vector3(-125, 0, 15),
      color: 0xcc6633,
    })
    landerTank.update(1.0)
    shuttleScene.add(landerTank.group)

    const shuttleTank = new FuelTank({
      radius: 80,
      length: 220,
      position: new THREE.Vector3(35, 0, 15),
      color: 0x999999,
    })
    shuttleTank.update(1.0)
    shuttleScene.add(shuttleTank.group)

    // Habitat module (cosmetic)
    const habitat = new HabitatModule({
      radius: 80,
      length: 260,
      position: new THREE.Vector3(290, 0, 15),
    })
    habitat.setVisible(true)
    shuttleScene.add(habitat.group)

    // Lander inside cargo bay
    this.landerModel = await loadGLB(LANDER_MODEL_PATH)
    this.landerModel.scale.setScalar(CARGO_LANDER_SCALE)
    this.landerModel.position.copy(CARGO_LANDER_OFFSET)
    this.landerModel.rotation.set(0, 0, -Math.PI / 2)
    shuttleScene.add(this.landerModel)
    this.landerModel.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        child.castShadow = true
      }
    })

    this.ensureExfilFloodlight()

    // Thruster nozzle sprites — idle glow at each engine nozzle
    // Positions in raw model coords (shuttleScene is scaled by MODEL_SCALE)
    const thrusterTexture = this.createThrusterTexture()
    const engSpritePositions: [number, number, number][] = [
      [-510 + THRUSTER_SPRITE_X_OFFSET, 0, 72],
      [-510 + THRUSTER_SPRITE_X_OFFSET, -52, -46],
      [-510 + THRUSTER_SPRITE_X_OFFSET, 52, -46],
    ]
    for (const [x, y, z] of engSpritePositions) {
      const material = new THREE.SpriteMaterial({
        map: thrusterTexture,
        color: new THREE.Color(0xff9a1f),
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
      const sprite = new THREE.Sprite(material)
      sprite.position.set(x, y, z)
      sprite.visible = false
      sprite.scale.setScalar(THRUSTER_SPRITE_SIZE)
      shuttleScene.add(sprite)
      this.thrusterSprites.push(sprite)
    }

    // Place engine nozzle geometry (same as ShuttleController)
    const engNode = this.findNode(shuttleScene, 'eng')
    if (engNode) {
      const engParent = engNode.parent
      if (engParent) engParent.remove(engNode)
      const engPositions: [number, number, number][] = [
        [-510, 0, 72],
        [-510, -52, -46],
        [-510, 52, -46],
      ]
      for (const [x, y, z] of engPositions) {
        const nozzle = engNode.clone()
        nozzle.position.set(x, y, z)
        nozzle.rotation.set(0, 0, 0)
        nozzle.scale.set(1, 1, 1)
        shuttleScene.add(nozzle)
      }
    }

    // Hide RCS pods
    const rcsNode = this.findNode(shuttleScene, 'rcs')
    if (rcsNode) rcsNode.visible = false
  }

  /** Advance the sequence by dt seconds. */
  tick(dt: number): void {
    // Exfil sequence (separate from arrival)
    if (this.exfilPhase && this.exfilPhase !== 'done') {
      this.exfilPhaseElapsed += dt
      this.thrusterElapsed += dt
      this.tickExfilPhase()
      return
    }

    if (this.phase === 'done') return

    this.elapsed += dt
    this.phaseElapsed += dt

    // Thruster sprites pulse during approach and depart
    this.thrusterElapsed += dt
    const thrustersActive = this.phase === 'approach'
    this.updateThrusterSprites(thrustersActive)

    // Falling lander gravity (continues through fadeout)
    if (this.fallingLander) {
      this.landerFallSpeed += LANDER_FALL_GRAVITY * dt
      this.fallingLander.position.y -= this.landerFallSpeed * dt
      this.landerWorldPos.copy(this.fallingLander.position)
    }

    switch (this.phase) {
      case 'establish':
        this.tickEstablish()
        break
      case 'transition':
        this.tickTransition()
        break
      case 'approach':
        this.tickApproach()
        break
      case 'flip':
        this.tickFlip()
        break
      case 'doors':
        this.tickDoors(dt)
        break
      case 'detach':
        this.tickDetach()
        break
      case 'fadeout':
        this.tickFadeout()
        break
    }
  }

  /** Apply the saved shuttle paintjob to the arrival sequence shuttle model. */
  private applySavedShuttlePaintjob(): void {
    if (typeof localStorage === 'undefined') return
    const profile = loadProfile()
    if (!profile) return
    applyShuttlePaintMaterialsFromProfile(this.shuttlePaintMaterials, profile)
  }

  /**
   * Park the shuttle hovering above the lander position.
   * Removes the falling cinematic lander but keeps the shuttle in the scene.
   * Call after sequence completes to leave the shuttle visible from below.
   *
   */
  /**
   * Toggle shuttle presentation without flipping `shuttleGroup.visible`.
   *
   * The shuttle group hosts 7+ PointLights (nav lights + cinematic fills)
   * and 1 SpotLight (exfil floodlight). Flipping `.visible = false` on
   * the parent removes them from `gatherLightsState` and invalidates every
   * cached lit-material program. This helper hides meshes/sprites only
   * and zeroes light intensities to preserve the shader cache.
   *
   * @param visible - `true` to present, `false` to hide.
   */
  setShuttleVisible(visible: boolean): void {
    this.shuttleGroup.visible = true
    this.shuttleGroup.traverse((obj) => {
      const light = obj as THREE.Light
      if (light.isLight) {
        if (visible) {
          const saved = this.savedShuttleLightIntensities.get(light)
          if (saved !== undefined) {
            light.intensity = saved
            this.savedShuttleLightIntensities.delete(light)
          }
        } else if (!this.savedShuttleLightIntensities.has(light)) {
          this.savedShuttleLightIntensities.set(light, light.intensity)
          light.intensity = 0
        }
        return
      }
      const mesh = obj as THREE.Mesh
      const sprite = obj as THREE.Sprite
      if (mesh.isMesh || sprite.isSprite) {
        obj.visible = visible
      }
    })
  }

  private readonly savedShuttleLightIntensities = new Map<THREE.Light, number>()

  parkShuttle(): void {
    this.phase = 'done'
    this.fallingLander?.removeFromParent()
    this.fallingLander = null
    if (this.landerModel) {
      this.landerModel.visible = false
    }

    // Scale up to gameplay proportions (lander fits inside cargo bay)
    this.shuttleGroup.scale.setScalar(SHUTTLE_PARKED_SCALE)

    // Position well above the terrain. At scale 15 the shuttle is ~210 units tall.
    // Must be high enough to clear terrain AND be above the lander at all times.
    this.shuttleGroup.position.set(
      this.landerSpawnTarget.x,
      this.landerSpawnTarget.y + LANDER_PARK_ALTITUDE_OFFSET,
      this.landerSpawnTarget.z,
    )
    // Flipped upside down — cargo bay faces the asteroid surface, doors open
    this.shuttleGroup.rotation.set(Math.PI, -Math.PI / 2, 0, 'YXZ')

    // Open cargo bay doors
    this.doorProgress = 1
    this.updateDoorRotation()
    this.anchorExfilFloodlightUnderParkedShuttle()

    // Hide thruster sprites (parked, not thrusting)
    for (const sprite of this.thrusterSprites) {
      sprite.visible = false
    }

    // Navigation lights — pre-created during `load()` at intensity 0 so the
    // scene's `NUM_POINT_LIGHTS` is pinned at boot. Just raise intensity here.
    if (this.navUnderLight) this.navUnderLight.intensity = NAV_UNDER_LIGHT_INTENSITY
    if (this.navTopLight) this.navTopLight.intensity = NAV_TOP_LIGHT_INTENSITY
    if (this.navCargoGlow) this.navCargoGlow.intensity = NAV_CARGO_GLOW_INTENSITY
    if (this.navEngineGlow) this.navEngineGlow.intensity = NAV_ENGINE_GLOW_INTENSITY
  }

  /** Remove shuttle and falling lander from scene entirely. */
  dispose(): void {
    this.fallingLander?.removeFromParent()
    this.fallingLander = null
    this.exfilFloodlight?.shadow.map?.dispose()
    this.exfilFloodlight?.dispose()
    if (this.exfilFloodlightCone) {
      this.exfilFloodlightCone.geometry.dispose()
      const material = this.exfilFloodlightCone.material
      if (Array.isArray(material)) {
        material.forEach((m) => m.dispose())
      } else {
        material.dispose()
      }
    }
    this.shuttleGroup.removeFromParent()
    this.shuttleGroup.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.geometry.dispose()
        if (Array.isArray(child.material)) {
          child.material.forEach((m) => m.dispose())
        } else {
          child.material.dispose()
        }
      }
    })
  }

  // ── Phase tickers ─────────────────────────────────────────────

  private tickEstablish(): void {
    // Pure static beauty shot — camera locked at ESTABLISH_CAM_POSITION
    // looking at the asteroid's geometric center. The transition phase owns
    // all camera motion.
    this.camera.position.copy(ESTABLISH_CAM_POSITION)
    this.camera.lookAt(ESTABLISH_LOOKAT)

    // Fade in from black at the start so the canvas never flashes white
    // between the loading screen and the first rendered frame.
    const fadeT = Math.min(1, this.phaseElapsed / ESTABLISH_FADE_IN_DURATION)
    this.onFadeOut?.(1 - fadeT)

    if (this.phaseElapsed >= PHASE_ESTABLISH_DURATION) this.nextPhase('transition')
  }

  private tickTransition(): void {
    const t = Math.min(1, this.phaseElapsed / PHASE_TRANSITION_DURATION)
    const eased = this.easeInOut(t)

    // Approach-phase opening frame — camera relative to the shuttle's start
    // pose, looking at the shuttle. Same math as tickApproach at t=0.
    const approachCamX = this.shuttleStartPos.x + APPROACH_CAM_START_SIDE
    const approachCamY = this.shuttleStartPos.y + APPROACH_CAM_START_HEIGHT
    const approachCamZ = this.shuttleStartPos.z - APPROACH_CAM_START_DISTANCE

    this.camera.position.set(
      THREE.MathUtils.lerp(this.transitionCamStart.x, approachCamX, eased),
      THREE.MathUtils.lerp(this.transitionCamStart.y, approachCamY, eased),
      THREE.MathUtils.lerp(this.transitionCamStart.z, approachCamZ, eased),
    )
    this.camera.lookAt(
      THREE.MathUtils.lerp(this.transitionLookAtStart.x, this.shuttleStartPos.x, eased),
      THREE.MathUtils.lerp(this.transitionLookAtStart.y, this.shuttleStartPos.y, eased),
      THREE.MathUtils.lerp(this.transitionLookAtStart.z, this.shuttleStartPos.z, eased),
    )
    this.camera.fov = THREE.MathUtils.lerp(this.transitionFovStart, BASE_CAMERA_FOV, eased)
    this.camera.updateProjectionMatrix()

    if (t >= 1) this.nextPhase('approach')
  }

  private tickApproach(): void {
    const t = Math.min(1, this.phaseElapsed / PHASE_APPROACH_DURATION)
    const eased = this.easeInOut(t)

    this.shuttleGroup.position.lerpVectors(this.shuttleStartPos, this.shuttleEndPos, eased)

    // Camera starts wide and far, pulls in as shuttle approaches
    const camDistance = THREE.MathUtils.lerp(
      APPROACH_CAM_START_DISTANCE,
      APPROACH_CAM_END_DISTANCE,
      eased,
    )
    const camHeight = THREE.MathUtils.lerp(
      APPROACH_CAM_START_HEIGHT,
      APPROACH_CAM_END_HEIGHT,
      eased,
    )
    const camSide = THREE.MathUtils.lerp(APPROACH_CAM_START_SIDE, APPROACH_CAM_END_SIDE, eased)
    this.camera.position.set(
      this.shuttleGroup.position.x + camSide,
      this.shuttleGroup.position.y + camHeight,
      this.shuttleGroup.position.z - camDistance,
    )
    this.camera.lookAt(this.shuttleGroup.position)

    if (t >= 1) this.nextPhase('flip')
  }

  private tickFlip(): void {
    const t = Math.min(1, this.phaseElapsed / PHASE_FLIP_DURATION)
    const eased = this.easeInOut(t)

    // Pitch 180° — nose goes over tail. Base Y rotation stays at -90° (nose along +Z).
    // Rotate around local X axis for a pitch-over maneuver.
    this.shuttleGroup.rotation.set(eased * Math.PI, -Math.PI / 2, 0, 'YXZ')

    // Camera orbits to the side to show the flip
    const angle = eased * Math.PI * 0.5
    const camDist = 100
    this.camera.position.set(
      this.shuttleGroup.position.x + Math.sin(angle) * camDist,
      this.shuttleGroup.position.y + 20,
      this.shuttleGroup.position.z + Math.cos(angle) * camDist * 0.3,
    )
    this.camera.lookAt(this.shuttleGroup.position)

    if (t >= 1) this.nextPhase('doors')
  }

  private tickDoors(dt: number): void {
    const t = Math.min(1, this.phaseElapsed / PHASE_DOORS_DURATION)

    this.doorProgress = Math.min(1, this.doorProgress + DOOR_ANIM_SPEED * dt)
    this.updateDoorRotation()

    const camTarget = this.shuttleGroup.position.clone()
    camTarget.y -= 10
    this.camera.position.set(
      this.shuttleGroup.position.x + 60,
      this.shuttleGroup.position.y - 5,
      this.shuttleGroup.position.z + 40,
    )
    this.camera.lookAt(camTarget)

    if (t >= 1) this.nextPhase('detach')
  }

  private tickDetach(): void {
    const t = Math.min(1, this.phaseElapsed / PHASE_DETACH_DURATION)

    if (!this.landerDetached && this.landerModel) {
      // Get lander world transform before reparenting
      const worldPos = new THREE.Vector3()
      this.landerModel.getWorldPosition(worldPos)
      const worldScale = new THREE.Vector3()
      this.landerModel.getWorldScale(worldScale)

      // Reparent lander to the scene root so it falls independently
      this.landerModel.removeFromParent()
      this.landerModel.position.copy(worldPos)
      this.landerModel.scale.copy(worldScale)
      this.landerModel.rotation.set(0, 0, 0)
      this.shuttleGroup.parent?.add(this.landerModel)

      this.fallingLander = this.landerModel
      this.landerWorldPos.copy(worldPos)
      this.landerDetached = true
      this.onLanderDetach?.(worldPos)
    }

    // Camera follows the falling lander
    this.camera.position.set(
      this.landerWorldPos.x + 30,
      this.landerWorldPos.y + 15,
      this.landerWorldPos.z + 25,
    )
    this.camera.lookAt(this.landerWorldPos)

    if (t >= 1) this.nextPhase('fadeout')
  }

  private tickFadeout(): void {
    const t = Math.min(1, this.phaseElapsed / PHASE_FADEOUT_DURATION)

    // Fade to black
    this.onFadeOut?.(t)

    // Camera continues following the falling lander
    this.camera.position.set(
      this.landerWorldPos.x + 30,
      this.landerWorldPos.y + 15,
      this.landerWorldPos.z + 25,
    )
    this.camera.lookAt(this.landerWorldPos)

    if (t >= 1) {
      this.phase = 'done'
      this.onComplete?.()
    }
  }

  // ── Exfil (reverse departure) ─────────────────────────────────

  /**
   * Start the exfil reverse cutscene. The lander docks back into the cargo bay,
   * doors close, shuttle flips upright, and departs.
   *
   * @param landerPosition - current world position of the gameplay lander
   */
  playExfil(landerPosition: THREE.Vector3): void {
    this.exfilPhase = 'dock'
    this.exfilPhaseElapsed = 0
    this.restoreExfilFloodlightTargetToShuttle()

    // Animate lander in world space (scene root), then reparent into cargo bay at the end.
    // This mirrors the arrival detach in reverse.
    if (this.landerModel && this.shuttleScene) {
      this.landerModel.visible = true
      this.exfilLanderStartPos.copy(landerPosition)
      // Target: cargo bay position in world space
      // Cargo bay is at model X=-320, which at scale 15*0.01 = ~48 units toward nozzles.
      // Model -X maps to world -Z with the shuttle's YXZ rotation.
      const cargoBayOffsetZ = CARGO_LANDER_OFFSET.x * MODEL_SCALE * SHUTTLE_PARKED_SCALE
      this.exfilLanderTargetPos.copy(this.shuttleGroup.position)
      this.exfilLanderTargetPos.z += cargoBayOffsetZ

      // Place lander in scene root at gameplay position — feet pointing down (6 o'clock)
      this.landerModel.removeFromParent()
      this.landerModel.position.copy(landerPosition)
      this.landerModel.scale.setScalar(5)
      this.landerModel.rotation.set(0, 0, 0)
      this.shuttleGroup.parent?.add(this.landerModel)
      this.fallingLander = this.landerModel
    }

    // Departure path: start at current shuttle position, fly forward (+Z) and up
    this.exfilDepartStartPos.copy(this.shuttleGroup.position)
    this.exfilDepartEndPos.set(
      this.shuttleGroup.position.x,
      this.shuttleGroup.position.y + 500,
      this.shuttleGroup.position.z + APPROACH_START_DISTANCE,
    )

    // Initial camera: below and far enough to frame the shuttle at scale 15
    this.camera.position.set(
      this.shuttleGroup.position.x + 200,
      this.shuttleGroup.position.y - 150,
      this.shuttleGroup.position.z + 250,
    )
    this.camera.lookAt(this.shuttleGroup.position)

    // Hide thruster sprites initially
    for (const sprite of this.thrusterSprites) {
      sprite.visible = false
    }
  }

  /** Dispatch to the current exfil phase ticker. */
  private tickExfilPhase(): void {
    switch (this.exfilPhase) {
      case 'dock':
        this.tickExfilDock()
        break
      case 'closeDoors':
        this.tickExfilCloseDoors()
        break
      case 'flipBack':
        this.tickExfilFlip()
        break
      case 'depart':
        this.tickExfilDepart()
        break
      case 'exfilFadeout':
        this.tickExfilFadeout()
        break
    }
  }

  /** Lander rises toward the cargo bay in world space, then reparents into shuttle. */
  private tickExfilDock(): void {
    const t = Math.min(1, this.exfilPhaseElapsed / EXFIL_DOCK_DURATION)
    const eased = this.easeInOut(t)

    if (this.fallingLander) {
      // Lerp world position from gameplay lander toward shuttle
      this.fallingLander.position.lerpVectors(
        this.exfilLanderStartPos,
        this.exfilLanderTargetPos,
        eased,
      )
      // Rotate from 6 o'clock (feet down) to 3 o'clock (feet toward nozzles)
      // Feet start at -Y (down), need to end pointing toward nozzles (+Z) → rotate around X
      this.fallingLander.rotation.x = THREE.MathUtils.lerp(0, Math.PI / 2, eased)
    }

    // Camera tracks from a wide angle
    this.camera.position.set(
      this.shuttleGroup.position.x + 200,
      this.shuttleGroup.position.y - 80,
      this.shuttleGroup.position.z + 250,
    )
    this.camera.lookAt(this.shuttleGroup.position)

    if (t >= 1) {
      // Reparent lander into shuttleScene at cargo bay position (matching original load())
      if (this.fallingLander && this.shuttleScene) {
        this.fallingLander.removeFromParent()
        this.fallingLander.position.copy(CARGO_LANDER_OFFSET)
        this.fallingLander.scale.setScalar(CARGO_LANDER_SCALE)
        this.fallingLander.rotation.set(0, 0, -Math.PI / 2)
        this.shuttleScene.add(this.fallingLander)
        this.fallingLander = null
      }
      useAudio().play('sfx.dockingClamp')
      this.nextExfilPhase('closeDoors')
    }
  }

  /** Cargo doors close (doorProgress 1 → 0). */
  private tickExfilCloseDoors(): void {
    const t = Math.min(1, this.exfilPhaseElapsed / EXFIL_DOORS_DURATION)
    const eased = this.easeInOut(t)

    this.doorProgress = 1 - eased
    this.updateDoorRotation()

    // Camera watches the belly as doors close — wide enough for scale 15
    const camTarget = this.shuttleGroup.position.clone()
    camTarget.y -= 20
    this.camera.position.set(
      this.shuttleGroup.position.x + 200,
      this.shuttleGroup.position.y - 40,
      this.shuttleGroup.position.z + 180,
    )
    this.camera.lookAt(camTarget)

    if (t >= 1) this.nextExfilPhase('flipBack')
  }

  /** Shuttle flips 180° from upside-down back to upright. */
  private tickExfilFlip(): void {
    const t = Math.min(1, this.exfilPhaseElapsed / EXFIL_FLIP_DURATION)
    const eased = this.easeInOut(t)

    // Rotation.x goes from Math.PI (upside-down) to 0 (upright)
    const pitchAngle = THREE.MathUtils.lerp(Math.PI, 0, eased)
    this.shuttleGroup.rotation.set(pitchAngle, -Math.PI / 2, 0, 'YXZ')

    // Camera orbits around the shuttle during flip — wide framing
    const angle = eased * Math.PI * 0.5
    const camDist = 400
    this.camera.position.set(
      this.shuttleGroup.position.x + Math.sin(angle) * camDist,
      this.shuttleGroup.position.y + 100,
      this.shuttleGroup.position.z + Math.cos(angle) * camDist * 0.5,
    )
    this.camera.lookAt(this.shuttleGroup.position)

    if (t >= 1) this.nextExfilPhase('depart')
  }

  /** Shuttle accelerates away from the asteroid. */
  private tickExfilDepart(): void {
    const t = Math.min(1, this.exfilPhaseElapsed / EXFIL_DEPART_DURATION)
    const eased = this.easeInOut(t)

    this.shuttleGroup.position.lerpVectors(this.exfilDepartStartPos, this.exfilDepartEndPos, eased)

    // Enable thruster sprites during departure
    this.updateThrusterSprites(true)

    // Camera stays behind watching the shuttle fly away into +Z
    const camBehind = THREE.MathUtils.lerp(300, 600, eased)
    const camHeight = THREE.MathUtils.lerp(80, 200, eased)
    this.camera.position.set(
      this.shuttleGroup.position.x,
      this.shuttleGroup.position.y + camHeight,
      this.shuttleGroup.position.z - camBehind,
    )
    this.camera.lookAt(this.shuttleGroup.position)

    if (t >= 1) {
      this.updateThrusterSprites(false)
      this.nextExfilPhase('exfilFadeout')
    }
  }

  /** Fade to black and complete the exfil sequence. */
  private tickExfilFadeout(): void {
    const t = Math.min(1, this.exfilPhaseElapsed / EXFIL_FADEOUT_DURATION)

    this.onFadeOut?.(t)

    if (t >= 1) {
      this.exfilPhase = 'done'
      this.onComplete?.()
    }
  }

  /** Advance to the next exfil phase. */
  private nextExfilPhase(next: ExfilPhase): void {
    this.exfilPhase = next
    this.exfilPhaseElapsed = 0
    if (next === 'closeDoors') {
      useAudio().play('sfx.cargo.close')
    }
    if (next === 'depart') {
      useAudio().play('sfx.level.arrival')
      useAudio().play('ambient.space', { loop: true, volume: 0.25 })
      useAudio().play('ambient.engine', { loop: true, volume: 0.3 })
    }
  }

  // ── Helpers ───────────────────────────────────────────────────

  private nextPhase(next: ArrivalPhase): void {
    this.phase = next
    this.phaseElapsed = 0
    if (next === 'transition') {
      // Snapshot wherever the establish phase left the camera; tickTransition
      // lerps from this snapshot to the approach-phase opening frame.
      this.transitionCamStart.copy(this.camera.position)
      this.transitionLookAtStart.copy(ESTABLISH_LOOKAT)
      this.transitionFovStart = this.camera.fov
    }
    if (next === 'approach') {
      // Safety net in case approach is entered without going through
      // transition — tickTransition already drives FOV to BASE_CAMERA_FOV.
      this.camera.fov = BASE_CAMERA_FOV
      this.camera.updateProjectionMatrix()
    }
    if (next === 'doors') {
      useAudio().play('sfx.cargo.open')
    }
  }

  private updateDoorRotation(): void {
    const angle = this.doorProgress * DOOR_OPEN_ANGLE
    if (this.doorPortNode) {
      this.doorPortNode.rotation.x = this.doorPortClosedRotX - angle
    }
    if (this.doorStbNode) {
      this.doorStbNode.rotation.x = this.doorStbClosedRotX + angle
    }
    this.updateExfilFloodlightVisibility()
  }

  private easeInOut(t: number): number {
    return t * t * (3 - 2 * t)
  }

  private updateThrusterSprites(active: boolean): void {
    if (!active) {
      for (const sprite of this.thrusterSprites) {
        sprite.visible = false
      }
      return
    }
    // Pulse: scale and opacity oscillate
    const pulse = 0.7 + 0.3 * Math.sin(this.thrusterElapsed * 12)
    const opacity = 0.5 + 0.5 * Math.sin(this.thrusterElapsed * 8)
    for (const sprite of this.thrusterSprites) {
      sprite.visible = true
      sprite.scale.setScalar(THRUSTER_SPRITE_SIZE * pulse)
      ;(sprite.material as THREE.SpriteMaterial).opacity = opacity
    }
  }

  private ensureExfilFloodlight(): void {
    if (this.exfilFloodlight) return

    const floodlight = new THREE.SpotLight(
      EXFIL_FLOODLIGHT_COLOR,
      EXFIL_FLOODLIGHT_INTENSITY,
      EXFIL_FLOODLIGHT_DISTANCE,
      EXFIL_FLOODLIGHT_ANGLE,
      EXFIL_FLOODLIGHT_PENUMBRA,
      EXFIL_FLOODLIGHT_DECAY,
    )
    floodlight.position.set(EXFIL_FLOODLIGHT_X_OFFSET, EXFIL_FLOODLIGHT_Y_OFFSET, 0)
    floodlight.castShadow = false
    floodlight.shadow.mapSize.set(
      EXFIL_FLOODLIGHT_SHADOW_MAP_SIZE,
      EXFIL_FLOODLIGHT_SHADOW_MAP_SIZE,
    )
    floodlight.shadow.bias = EXFIL_FLOODLIGHT_SHADOW_BIAS

    const target = new THREE.Object3D()
    target.position.set(EXFIL_FLOODLIGHT_X_OFFSET, EXFIL_FLOODLIGHT_TARGET_Y, 0)
    floodlight.target = target

    const coneGeometry = new THREE.CylinderGeometry(
      0,
      EXFIL_FLOODLIGHT_CONE_RADIUS,
      EXFIL_FLOODLIGHT_CONE_LENGTH,
      24,
      1,
      true,
    )
    coneGeometry.translate(0, -EXFIL_FLOODLIGHT_CONE_LENGTH * 0.5, 0)
    const coneMaterial = new THREE.MeshBasicMaterial({
      color: EXFIL_FLOODLIGHT_COLOR,
      transparent: true,
      opacity: EXFIL_FLOODLIGHT_CONE_OPACITY,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    })
    const cone = new THREE.Mesh(coneGeometry, coneMaterial)
    const beamDirection = target.position.clone().sub(floodlight.position).normalize()
    cone.position.copy(floodlight.position)
    cone.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), beamDirection)
    cone.castShadow = false
    cone.receiveShadow = false
    cone.renderOrder = 1

    this.shuttleGroup.add(floodlight)
    this.shuttleGroup.add(target)
    this.shuttleGroup.add(cone)

    this.exfilFloodlight = floodlight
    this.exfilFloodlightTarget = target
    this.exfilFloodlightCone = cone
    this.updateExfilFloodlightVisibility()
  }

  private anchorExfilFloodlightUnderParkedShuttle(): void {
    const target = this.exfilFloodlightTarget
    const parent = this.shuttleGroup.parent
    if (!target || !parent) return

    parent.attach(target)
    target.position.set(
      this.shuttleGroup.position.x,
      this.landerSpawnTarget.y,
      this.shuttleGroup.position.z,
    )
    this.exfilFloodlight?.target.updateMatrixWorld()
  }

  private restoreExfilFloodlightTargetToShuttle(): void {
    const target = this.exfilFloodlightTarget
    if (!target) return

    this.shuttleGroup.attach(target)
    target.position.set(EXFIL_FLOODLIGHT_X_OFFSET, EXFIL_FLOODLIGHT_TARGET_Y, 0)
    this.exfilFloodlight?.target.updateMatrixWorld()
  }

  /**
   * Toggle floodlight emission via intensity rather than `visible`. Flipping
   * the light's visibility changes Three.js's active-light count, which forces
   * every lit material in the scene to recompile its shader on the next
   * frame — a multi-hundred-millisecond hitch each time the cargo doors
   * open or close. Keeping the light permanently in the scene with intensity
   * scaled by the door progress preserves the cone fade-in without the
   * recompile spike. The cone mesh is a plain transparent mesh, so its
   * visibility flip is free.
   */
  private updateExfilFloodlightVisibility(): void {
    const lit = Math.max(0, Math.min(1, (this.doorProgress - 0.02) / (1 - 0.02)))
    if (this.exfilFloodlight) {
      this.exfilFloodlight.intensity = EXFIL_FLOODLIGHT_INTENSITY * lit
    }
    if (this.exfilFloodlightCone) {
      this.exfilFloodlightCone.visible = lit > 0
      const material = this.exfilFloodlightCone.material as THREE.MeshBasicMaterial
      material.opacity = EXFIL_FLOODLIGHT_CONE_OPACITY * lit
    }
  }

  private createThrusterTexture(): THREE.CanvasTexture {
    const size = 64
    const canvas = document.createElement('canvas')
    canvas.width = size
    canvas.height = size
    const ctx = canvas.getContext('2d')!
    const center = size / 2
    const gradient = ctx.createRadialGradient(center, center, 0, center, center, center)
    gradient.addColorStop(0, '#fff5cc')
    gradient.addColorStop(0.45, '#ff9a1f')
    gradient.addColorStop(1, 'rgba(0, 0, 0, 0)')
    ctx.fillStyle = gradient
    ctx.fillRect(0, 0, size, size)
    const texture = new THREE.CanvasTexture(canvas)
    texture.needsUpdate = true
    return texture
  }

  private findNode(root: THREE.Object3D, name: string): THREE.Object3D | null {
    let found: THREE.Object3D | null = null
    root.traverse((child) => {
      if (child.name === name && !found) found = child
    })
    return found
  }
}
