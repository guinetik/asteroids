/**
 * Industrial cargo rocket prop for the gather objective.
 *
 * When the player deposits their gathered minerals, the cargo probe ignites,
 * lifts off, and flies into the sky before the completed objective hides it.
 *
 * @author guinetik
 * @date 2026-04-26
 * @spec docs/superpowers/specs/2026-04-26-delivery-rocket-redesign.md
 */
import * as THREE from 'three'

const ROCKET_RADIUS = 0.95
const BODY_HEIGHT = 7.2
const NOSE_HEIGHT = 1.25
const CLEARANCE = 1.1
const ANTENNA_HEIGHT = 0.8
const BODY_SEGMENTS = 20
const PANEL_SEAM_COUNT = 6
const PANEL_SEAM_HEIGHT = 0.04
const CARGO_BAND_HEIGHT = 0.28
const NOZZLE_HEIGHT = 0.75
const LEG_COUNT = 4
const LEG_HEIGHT = 2.1
const LEG_WIDTH = 0.18
const LEG_DEPTH = 0.32
const LEG_STANDOFF = 0.44
const FOOT_WIDTH = 0.78
const FOOT_HEIGHT = 0.18
const FOOT_DEPTH = 1.25
const TERMINAL_FRAME_WIDTH = 1.45
const TERMINAL_FRAME_HEIGHT = 1.45
const TERMINAL_FRAME_DEPTH = 0.18
const TERMINAL_SCREEN_WIDTH = 1.05
const TERMINAL_SCREEN_HEIGHT = 0.72
const TERMINAL_SCREEN_OFFSET = 0.1
const TERMINAL_KEYPAD_WIDTH = 0.82
const TERMINAL_KEYPAD_HEIGHT = 0.22
const TERMINAL_KEYPAD_OFFSET = -0.46
const EXHAUST_HEIGHT = 3.6
const IGNITION_HOLD_SECONDS = 0.35
const LAUNCH_ACCELERATION = 18
const LAUNCH_INITIAL_VELOCITY = 2.4
const LAUNCH_DRIFT_SPEED = 0.9
const LAUNCH_ROLL_SPEED = 0.22
const LAUNCH_MIN_VISIBLE_SECONDS = 4.8
const LAUNCH_DONE_HEIGHT = 120
const EXHAUST_BASE_SCALE = 0.75
const EXHAUST_FLICKER_SCALE = 0.35
const EXHAUST_BASE_OPACITY = 0.48
const EXHAUST_FLICKER_OPACITY = 0.38
const EXHAUST_FLICKER_FREQUENCY = 37
const BODY_BOTTOM_RADIUS_MULTIPLIER = 1.08
const NOSE_RADIUS_MULTIPLIER = 0.95
const BAND_TOP_RADIUS_MULTIPLIER = 1.04
const BAND_BOTTOM_RADIUS_MULTIPLIER = 1.08
const SEAM_TOP_RADIUS_MULTIPLIER = 1.055
const SEAM_BOTTOM_RADIUS_MULTIPLIER = 1.095
const LOWER_BAND_Y_OFFSET = 1.35
const UPPER_BAND_Y_OFFSET_FROM_BODY_TOP = 0.95
const FIRST_SEAM_Y_OFFSET = 1.2
const SEAM_SPAN_TRIM = 2.1
const NOZZLE_TOP_RADIUS_MULTIPLIER = 0.42
const NOZZLE_BOTTOM_RADIUS_MULTIPLIER = 0.72
const LEG_ANGLE_OFFSET = Math.PI / 4
const LEG_LEAN_RADIANS = -0.16
const BRACE_WIDTH_MULTIPLIER = 0.72
const BRACE_HEIGHT_MULTIPLIER = 0.78
const BRACE_DEPTH_MULTIPLIER = 0.58
const BRACE_Y_MULTIPLIER = 0.55
const BRACE_STANDOFF_MULTIPLIER = 0.62
const BRACE_LEAN_RADIANS = 0.42
const FOOT_FORWARD_OFFSET = 0.16
const TERMINAL_Y_OFFSET = 2.18
const SCREEN_TRIM_PADDING = 0.16
const SCREEN_TRIM_DEPTH = 0.04
const SCREEN_TRIM_FORWARD_OFFSET = 0.024
const SCREEN_FORWARD_OFFSET = 0.05
const KEYPAD_DEPTH = 0.06
const KEYPAD_FORWARD_OFFSET = 0.058
const ANTENNA_TOP_RADIUS = 0.035
const ANTENNA_BOTTOM_RADIUS = 0.045
const ANTENNA_SEGMENTS = 8
const ANTENNA_TIP_RADIUS = 0.11
const ANTENNA_TIP_WIDTH_SEGMENTS = 10
const ANTENNA_TIP_HEIGHT_SEGMENTS = 6
const EXHAUST_RADIUS_MULTIPLIER = 0.62
const SURVEY_FLASH_GREEN_EMISSIVE = 0x22c55e
const SURVEY_FLASH_PEAK_INTENSITY = 4.5

/** Visual / material overrides for {@link DepositRocketModel}. */
export interface DepositRocketOptions {
  /** Hex color for the rocket body. */
  baseColor?: number
  /** Hex color for the accent rails, landing legs, and nose fairing. */
  trimColor?: number
}

/**
 * Lightweight wrapper around the rocket hierarchy.
 * The gather minigame triggers `takeOff()` when items are deposited.
 */
export class DepositRocketModel {
  readonly group = new THREE.Group()

  private readonly bodyMaterial: THREE.MeshStandardMaterial
  private readonly trimMaterial: THREE.MeshStandardMaterial
  private readonly darkMaterial: THREE.MeshStandardMaterial
  private readonly bandMaterial: THREE.MeshStandardMaterial
  private readonly panelMaterial: THREE.MeshStandardMaterial
  private readonly screenMaterial: THREE.MeshStandardMaterial
  private readonly exhaustMaterial: THREE.MeshBasicMaterial
  private readonly slotMaterial: THREE.MeshStandardMaterial

  private readonly geometries: THREE.BufferGeometry[] = []

  private readonly exhaustMesh: THREE.Mesh

  private _isTakingOff = false
  private velocityY = 0
  private flightTime = 0
  /** Active green-flash decay timer in seconds; 0 = idle. */
  private surveyFlashTimer = 0
  /** Total decay duration of the active flash (so we can normalise progress). */
  private surveyFlashDuration = 0
  /**
   * Emissive baselines captured at construction so the survey flash
   * can lerp back to each material's original look (most are black/0,
   * the screen is cyan/1.7).
   */
  private readonly surveyFlashTargets: {
    material: THREE.MeshStandardMaterial
    baselineColor: number
    baselineIntensity: number
  }[] = []

  /** Whether the delivery rocket is currently running its takeoff animation. */
  get isTakingOff(): boolean {
    return this._isTakingOff
  }

  constructor(options: DepositRocketOptions = {}) {
    const baseColor = options.baseColor ?? 0xb8bbb5
    const trimColor = options.trimColor ?? 0xd66a2c

    this.bodyMaterial = new THREE.MeshStandardMaterial({
      color: baseColor,
      metalness: 0.72,
      roughness: 0.38,
    })

    this.trimMaterial = new THREE.MeshStandardMaterial({
      color: trimColor,
      metalness: 0.52,
      roughness: 0.46,
    })

    this.darkMaterial = new THREE.MeshStandardMaterial({
      color: 0x171d20,
      metalness: 0.82,
      roughness: 0.28,
    })

    this.bandMaterial = new THREE.MeshStandardMaterial({
      color: 0x2f3940,
      metalness: 0.65,
      roughness: 0.34,
    })

    this.panelMaterial = new THREE.MeshStandardMaterial({
      color: 0x626b6e,
      metalness: 0.58,
      roughness: 0.5,
    })

    this.screenMaterial = new THREE.MeshStandardMaterial({
      color: 0x3df6d1,
      emissive: 0x25ffd0,
      emissiveIntensity: 1.7,
    })

    this.slotMaterial = new THREE.MeshStandardMaterial({
      color: 0x050607,
      roughness: 0.86,
    })

    this.exhaustMaterial = new THREE.MeshBasicMaterial({
      color: 0xff9b38,
      transparent: true,
      opacity: 0,
      depthWrite: false,
    })

    // Main cargo pressure vessel.
    const bodyGeo = new THREE.CylinderGeometry(
      ROCKET_RADIUS,
      ROCKET_RADIUS * BODY_BOTTOM_RADIUS_MULTIPLIER,
      BODY_HEIGHT,
      BODY_SEGMENTS,
    )
    this.geometries.push(bodyGeo)
    const body = new THREE.Mesh(bodyGeo, this.bodyMaterial)
    body.position.y = CLEARANCE + BODY_HEIGHT / 2
    body.castShadow = true
    body.receiveShadow = true
    this.group.add(body)

    // Low industrial fairing rather than a toy-like cone.
    const noseGeo = new THREE.ConeGeometry(
      ROCKET_RADIUS * NOSE_RADIUS_MULTIPLIER,
      NOSE_HEIGHT,
      BODY_SEGMENTS,
    )
    this.geometries.push(noseGeo)
    const nose = new THREE.Mesh(noseGeo, this.trimMaterial)
    nose.position.y = CLEARANCE + BODY_HEIGHT + NOSE_HEIGHT / 2
    nose.castShadow = true
    nose.receiveShadow = true
    this.group.add(nose)

    // Banding and seams sell the cargo-probe scale without adding texture assets.
    const bandGeo = new THREE.CylinderGeometry(
      ROCKET_RADIUS * BAND_TOP_RADIUS_MULTIPLIER,
      ROCKET_RADIUS * BAND_BOTTOM_RADIUS_MULTIPLIER,
      CARGO_BAND_HEIGHT,
      BODY_SEGMENTS,
    )
    const seamGeo = new THREE.CylinderGeometry(
      ROCKET_RADIUS * SEAM_TOP_RADIUS_MULTIPLIER,
      ROCKET_RADIUS * SEAM_BOTTOM_RADIUS_MULTIPLIER,
      PANEL_SEAM_HEIGHT,
      BODY_SEGMENTS,
    )
    this.geometries.push(bandGeo, seamGeo)

    for (const y of [
      CLEARANCE + LOWER_BAND_Y_OFFSET,
      CLEARANCE + BODY_HEIGHT - UPPER_BAND_Y_OFFSET_FROM_BODY_TOP,
    ]) {
      const band = new THREE.Mesh(bandGeo, this.bandMaterial)
      band.position.y = y
      band.castShadow = true
      band.receiveShadow = true
      this.group.add(band)
    }

    for (let i = 0; i < PANEL_SEAM_COUNT; i++) {
      const seam = new THREE.Mesh(seamGeo, this.panelMaterial)
      seam.position.y =
        CLEARANCE +
        FIRST_SEAM_Y_OFFSET +
        i * ((BODY_HEIGHT - SEAM_SPAN_TRIM) / (PANEL_SEAM_COUNT - 1))
      seam.castShadow = true
      this.group.add(seam)
    }

    // Engine nozzle and landing skirt.
    const nozzleGeo = new THREE.CylinderGeometry(
      ROCKET_RADIUS * NOZZLE_TOP_RADIUS_MULTIPLIER,
      ROCKET_RADIUS * NOZZLE_BOTTOM_RADIUS_MULTIPLIER,
      NOZZLE_HEIGHT,
      BODY_SEGMENTS,
    )
    this.geometries.push(nozzleGeo)
    const nozzle = new THREE.Mesh(nozzleGeo, this.darkMaterial)
    nozzle.position.y = CLEARANCE - NOZZLE_HEIGHT / 2
    nozzle.castShadow = true
    this.group.add(nozzle)

    // Braced landing legs.
    const legGeo = new THREE.BoxGeometry(LEG_WIDTH, LEG_HEIGHT, LEG_DEPTH)
    const braceGeo = new THREE.BoxGeometry(
      LEG_WIDTH * BRACE_WIDTH_MULTIPLIER,
      LEG_HEIGHT * BRACE_HEIGHT_MULTIPLIER,
      LEG_DEPTH * BRACE_DEPTH_MULTIPLIER,
    )
    const footGeo = new THREE.BoxGeometry(FOOT_WIDTH, FOOT_HEIGHT, FOOT_DEPTH)
    this.geometries.push(legGeo, braceGeo, footGeo)

    for (let i = 0; i < LEG_COUNT; i++) {
      const angle = (i * Math.PI * 2) / LEG_COUNT + LEG_ANGLE_OFFSET

      const legGroup = new THREE.Group()
      legGroup.rotation.y = angle

      const leg = new THREE.Mesh(legGeo, this.trimMaterial)
      leg.position.set(0, LEG_HEIGHT / 2, ROCKET_RADIUS + LEG_STANDOFF)
      leg.rotation.x = LEG_LEAN_RADIANS
      leg.castShadow = true
      legGroup.add(leg)

      const brace = new THREE.Mesh(braceGeo, this.darkMaterial)
      brace.position.set(
        0,
        LEG_HEIGHT * BRACE_Y_MULTIPLIER,
        ROCKET_RADIUS + LEG_STANDOFF * BRACE_STANDOFF_MULTIPLIER,
      )
      brace.rotation.x = BRACE_LEAN_RADIANS
      brace.castShadow = true
      legGroup.add(brace)

      const foot = new THREE.Mesh(footGeo, this.darkMaterial)
      foot.position.set(0, FOOT_HEIGHT / 2, ROCKET_RADIUS + LEG_STANDOFF + FOOT_FORWARD_OFFSET)
      foot.castShadow = true
      legGroup.add(foot)

      this.group.add(legGroup)
    }

    // Forward cargo terminal / hatch.
    const hatchGroup = new THREE.Group()
    hatchGroup.position.set(
      0,
      CLEARANCE + TERMINAL_Y_OFFSET,
      ROCKET_RADIUS + TERMINAL_FRAME_DEPTH / 2,
    )

    const hatchFrameGeo = new THREE.BoxGeometry(
      TERMINAL_FRAME_WIDTH,
      TERMINAL_FRAME_HEIGHT,
      TERMINAL_FRAME_DEPTH,
    )
    const screenGeo = new THREE.PlaneGeometry(TERMINAL_SCREEN_WIDTH, TERMINAL_SCREEN_HEIGHT)
    const slotGeo = new THREE.BoxGeometry(
      TERMINAL_KEYPAD_WIDTH,
      TERMINAL_KEYPAD_HEIGHT,
      KEYPAD_DEPTH,
    )
    const screenTrimGeo = new THREE.BoxGeometry(
      TERMINAL_SCREEN_WIDTH + SCREEN_TRIM_PADDING,
      TERMINAL_SCREEN_HEIGHT + SCREEN_TRIM_PADDING,
      SCREEN_TRIM_DEPTH,
    )
    this.geometries.push(hatchFrameGeo, screenGeo, slotGeo, screenTrimGeo)

    const hatchFrame = new THREE.Mesh(hatchFrameGeo, this.darkMaterial)
    hatchFrame.castShadow = true
    hatchGroup.add(hatchFrame)

    const screenTrim = new THREE.Mesh(screenTrimGeo, this.panelMaterial)
    screenTrim.position.set(
      0,
      TERMINAL_SCREEN_OFFSET,
      TERMINAL_FRAME_DEPTH / 2 + SCREEN_TRIM_FORWARD_OFFSET,
    )
    hatchGroup.add(screenTrim)

    const screen = new THREE.Mesh(screenGeo, this.screenMaterial)
    screen.position.set(0, TERMINAL_SCREEN_OFFSET, TERMINAL_FRAME_DEPTH / 2 + SCREEN_FORWARD_OFFSET)
    hatchGroup.add(screen)

    const slot = new THREE.Mesh(slotGeo, this.slotMaterial)
    slot.position.set(0, TERMINAL_KEYPAD_OFFSET, TERMINAL_FRAME_DEPTH / 2 + KEYPAD_FORWARD_OFFSET)
    hatchGroup.add(slot)

    this.group.add(hatchGroup)

    // Small antenna mast to push the silhouette into cargo-probe territory.
    const antennaGeo = new THREE.CylinderGeometry(
      ANTENNA_TOP_RADIUS,
      ANTENNA_BOTTOM_RADIUS,
      ANTENNA_HEIGHT,
      ANTENNA_SEGMENTS,
    )
    const antennaTipGeo = new THREE.SphereGeometry(
      ANTENNA_TIP_RADIUS,
      ANTENNA_TIP_WIDTH_SEGMENTS,
      ANTENNA_TIP_HEIGHT_SEGMENTS,
    )
    this.geometries.push(antennaGeo, antennaTipGeo)
    const antenna = new THREE.Mesh(antennaGeo, this.darkMaterial)
    antenna.position.y = CLEARANCE + BODY_HEIGHT + NOSE_HEIGHT + ANTENNA_HEIGHT / 2
    this.group.add(antenna)
    const antennaTip = new THREE.Mesh(antennaTipGeo, this.screenMaterial)
    antennaTip.position.y = CLEARANCE + BODY_HEIGHT + NOSE_HEIGHT + ANTENNA_HEIGHT
    this.group.add(antennaTip)

    // Exhaust
    const exhaustGeo = new THREE.ConeGeometry(
      ROCKET_RADIUS * EXHAUST_RADIUS_MULTIPLIER,
      EXHAUST_HEIGHT,
      BODY_SEGMENTS,
    )
    this.geometries.push(exhaustGeo)
    this.exhaustMesh = new THREE.Mesh(exhaustGeo, this.exhaustMaterial)
    this.exhaustMesh.position.y = CLEARANCE - NOZZLE_HEIGHT - EXHAUST_HEIGHT / 2
    this.exhaustMesh.rotation.x = Math.PI
    this.exhaustMesh.visible = false
    this.group.add(this.exhaustMesh)

    // Capture every body material's original emissive so the survey flash
    // can lerp ALL of them on each science-bolt hit and restore correctly.
    const flashedMaterials: THREE.MeshStandardMaterial[] = [
      this.bodyMaterial,
      this.trimMaterial,
      this.darkMaterial,
      this.bandMaterial,
      this.panelMaterial,
      this.screenMaterial,
      this.slotMaterial,
    ]
    for (const material of flashedMaterials) {
      this.surveyFlashTargets.push({
        material,
        baselineColor: material.emissive.getHex(),
        baselineIntensity: material.emissiveIntensity,
      })
    }
  }

  /** Plant the rocket on the surface at world coords `(x, z)` with `groundY` as base. */
  placeAt(x: number, z: number, groundY: number): void {
    this.group.position.set(x, groundY, z)
  }

  /** Toggle the entire rocket group on/off without removing it from the scene. */
  setVisible(visible: boolean): void {
    this.group.visible = visible
  }

  /**
   * Trigger a green emissive pulse on the screen + antenna tip. Driven
   * by the SCI-gun rocket-survey facade per bolt hit. The flash uses an
   * exponential-style decay over `duration` seconds.
   *
   * @param duration - Decay duration in seconds. Higher = brighter / longer.
   */
  flash(duration: number): void {
    const safeDuration = Math.max(0.05, duration)
    if (safeDuration > this.surveyFlashTimer) {
      this.surveyFlashTimer = safeDuration
      this.surveyFlashDuration = safeDuration
    }
  }

  /** Trigger the takeoff animation. */
  takeOff(): void {
    if (this._isTakingOff) return
    this._isTakingOff = true
    this.exhaustMesh.visible = true
    this.exhaustMaterial.opacity = EXHAUST_BASE_OPACITY
    this.velocityY = LAUNCH_INITIAL_VELOCITY
    this.flightTime = 0
  }

  /** Update the takeoff animation. Returns true if the rocket has flown far enough to be removed. */
  tick(dt: number): boolean {
    this.advanceSurveyFlash(dt)
    if (!this._isTakingOff) return false

    const previousFlightTime = this.flightTime
    this.flightTime += dt
    const activeFlightDt =
      Math.max(0, this.flightTime - IGNITION_HOLD_SECONDS) -
      Math.max(0, previousFlightTime - IGNITION_HOLD_SECONDS)

    if (activeFlightDt > 0) {
      this.velocityY += LAUNCH_ACCELERATION * activeFlightDt
      this.group.position.y += this.velocityY * activeFlightDt
      this.group.position.x += LAUNCH_DRIFT_SPEED * activeFlightDt
      this.group.rotation.z += LAUNCH_ROLL_SPEED * activeFlightDt
    }

    const flicker = Math.sin(this.flightTime * EXHAUST_FLICKER_FREQUENCY) * 0.5 + 0.5
    this.exhaustMesh.scale.setScalar(EXHAUST_BASE_SCALE + flicker * EXHAUST_FLICKER_SCALE)
    this.exhaustMaterial.opacity = EXHAUST_BASE_OPACITY + flicker * EXHAUST_FLICKER_OPACITY

    const visibleWindowElapsed = this.flightTime > LAUNCH_MIN_VISIBLE_SECONDS
    return visibleWindowElapsed && this.group.position.y > LAUNCH_DONE_HEIGHT
  }

  /**
   * Decay the active green flash and apply the resulting emissive
   * color/intensity to every captured body material. When the timer
   * reaches zero each material reverts to the baseline captured at
   * construction (screen → cyan, others → black).
   */
  private advanceSurveyFlash(dt: number): void {
    if (this.surveyFlashTimer <= 0) {
      for (const target of this.surveyFlashTargets) {
        target.material.emissive.setHex(target.baselineColor)
        target.material.emissiveIntensity = target.baselineIntensity
      }
      return
    }
    this.surveyFlashTimer = Math.max(0, this.surveyFlashTimer - dt)
    const progress =
      this.surveyFlashDuration > 0 ? this.surveyFlashTimer / this.surveyFlashDuration : 0
    for (const target of this.surveyFlashTargets) {
      target.material.emissive.setHex(SURVEY_FLASH_GREEN_EMISSIVE)
      target.material.emissiveIntensity =
        target.baselineIntensity +
        (SURVEY_FLASH_PEAK_INTENSITY - target.baselineIntensity) * progress
    }
  }

  /** Hide the rocket and clear its launch state after `tick()` reports completion. */
  completeTakeoff(): void {
    this.setVisible(false)
    this._isTakingOff = false
    this.exhaustMesh.visible = false
  }

  /** Dispose all owned geometries and materials. Caller removes from scene. */
  dispose(): void {
    for (const geo of this.geometries) {
      geo.dispose()
    }

    this.bodyMaterial.dispose()
    this.trimMaterial.dispose()
    this.darkMaterial.dispose()
    this.bandMaterial.dispose()
    this.panelMaterial.dispose()
    this.screenMaterial.dispose()
    this.slotMaterial.dispose()
    this.exhaustMaterial.dispose()
  }
}
