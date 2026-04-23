import * as THREE from 'three'
import type { MapSceneObjects } from '@/three/MapSceneSetup'
import { MAP_VIEW_CONTROLLER_CONFIG as MAP_CONFIG } from '@/lib/map/mapViewControllerConfig'
import {
  createTronHologramMaterial,
  syncTronHologramTimeSeconds,
  disposeTronHologramMaterials,
} from '@/three/tronHologramMaterial'
import tetherLineVertexShader from '@/three/shaders/map/tetherLine.vert.glsl?raw'
import approachTetherLineFragmentShader from '@/three/shaders/map/approachTetherLine.frag.glsl?raw'
import surfTetherLineFragmentShader from '@/three/shaders/map/surfTetherLine.frag.glsl?raw'
import lockDiscVertexShader from '@/three/shaders/map/lockDisc.vert.glsl?raw'
import approachLockDiscFragmentShader from '@/three/shaders/map/approachLockDisc.frag.glsl?raw'
import surfLockDiscFragmentShader from '@/three/shaders/map/surfLockDisc.frag.glsl?raw'

/**
 * Interpolate from `a` toward `b` along the shortest arc (radians).
 *
 * @param a - Start angle
 * @param b - Target angle
 * @param t - Mix factor in `[0, 1]`
 */
function lerpAngleRadShortest(a: number, b: number, t: number): number {
  let d = b - a
  if (d > Math.PI) d -= 2 * Math.PI
  if (d < -Math.PI) d += 2 * Math.PI
  return a + d * t
}

/**
 * Sprite rotation (radians) that aligns the velocity wedge with planar motion as seen on screen.
 * Uses two perspective projections so camera pitch and orbit match the HUD arrow.
 *
 * @param camera - Active map camera
 * @param shuttlePos - Shuttle world position
 * @param velocity - World velocity (XZ used; Y ignored for direction)
 * @param offset - World units along velocity toward the second sample point
 * @param p0 - Scratch (mutated)
 * @param p1 - Scratch (mutated)
 * @param velPlanar - Scratch (mutated)
 * @returns `atan2` in screen space, or `null` if degenerate
 */
function computeReticleWedgeScreenRotation(
  camera: THREE.PerspectiveCamera,
  shuttlePos: THREE.Vector3,
  velocity: THREE.Vector3,
  offset: number,
  p0: THREE.Vector3,
  p1: THREE.Vector3,
  velPlanar: THREE.Vector3,
): number | null {
  velPlanar.set(velocity.x, 0, velocity.z)
  const speed = velPlanar.length()
  if (speed < 1e-8) return null
  velPlanar.multiplyScalar(offset / speed)

  p0.copy(shuttlePos)
  p0.project(camera)
  p1.copy(shuttlePos).add(velPlanar)
  p1.project(camera)

  const dx = p1.x - p0.x
  const dy = p1.y - p0.y
  if (dx * dx + dy * dy < 1e-14) return null
  return Math.atan2(dy, dx)
}

/** Camera-relative data for the ship HUD reticle each frame. */
export interface ShipReticleUpdate {
  shuttlePosition: THREE.Vector3
  shuttleVelocity: THREE.Vector3
  shuttleScale: number
  /** Map view camera (projection used for wedge rotation and FOV). */
  camera: THREE.PerspectiveCamera
  isFreeFlight: boolean
  /** Delta time in seconds (heading smooth / hysteresis timing). */
  dt: number
}

/** Meshes and buffers for the orbit approach tether line + lock discs. */
interface ApproachTetherVisuals {
  readonly line: THREE.Line<THREE.BufferGeometry, THREE.ShaderMaterial>
  readonly lineGeometry: THREE.BufferGeometry
  readonly lineMaterial: THREE.ShaderMaterial
  readonly linePositions: Float32Array
  readonly shipLockMesh: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>
  readonly planetLockMesh: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>
}

/** Shader uniforms for the animated tether line. */
interface TetherLineUniforms {
  uTime: { value: number }
  uProgress: { value: number }
  uOpacity: { value: number }
  uColor: { value: THREE.Color }
  uPulseColor: { value: THREE.Color }
}

/** Shader uniforms for the circular lock disc sprites. */
interface LockDiscUniforms {
  uTime: { value: number }
  uProgress: { value: number }
  uOpacity: { value: number }
  uColor: { value: THREE.Color }
}

/** Tether visuals while coupling onto a gravity-surf rail. */
interface SurfCouplingTetherVisuals {
  readonly line: THREE.Line<THREE.BufferGeometry, THREE.ShaderMaterial>
  readonly lineGeometry: THREE.BufferGeometry
  readonly lineMaterial: THREE.ShaderMaterial
  readonly linePositions: Float32Array
  readonly lockMesh: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>
}

/** Prograde / retrograde HUD markers ahead/behind the shuttle. */
interface ProgradeMarkerVisuals {
  readonly progradeSprite: THREE.Sprite
  readonly retrogradeSprite: THREE.Sprite
}

/** Reticles, tethers, and orbit visuals owned by the solar map scene. */
export class MapSceneVisuals {
  private scene: THREE.Scene
  private shuttleGroup: THREE.Group | null = null
  private orbitRing: THREE.LineLoop | null = null
  private launchArrow: THREE.Group | null = null
  /** Hysteresis: once planar speed crosses "on", require lower speed to hide the wedge. */
  private reticleWedgeSpeedGate = false
  /** Low-pass filtered screen-space wedge rotation (rad); cleared when wedge hides. */
  private reticleWedgeRotationSmooth: number | null = null
  /** Low-pass filtered reticle alpha when scale-driven fade jitters. */
  private reticleAlphaSmooth: number | null = null
  private readonly reticleProjectScratch0 = new THREE.Vector3()
  private readonly reticleProjectScratch1 = new THREE.Vector3()
  private readonly reticleVelocityPlanar = new THREE.Vector3()
  private progradeMarkerOpacitySmooth: number | null = null
  private retrogradeMarkerOpacitySmooth: number | null = null
  private progradePosSmooth: THREE.Vector3 | null = null
  private retrogradePosSmooth: THREE.Vector3 | null = null
  private launchArrowMaterials: THREE.ShaderMaterial[] = []
  private shipReticleGroup: THREE.Group | null = null
  private shipReticleRing: THREE.Sprite | null = null
  private shipReticlePointer: THREE.Sprite | null = null
  private approachTether: ApproachTetherVisuals | null = null
  private surfCouplingTether: SurfCouplingTetherVisuals | null = null
  private progradeMarkers: ProgradeMarkerVisuals | null = null

  constructor(sceneObjects: MapSceneObjects) {
    this.scene = sceneObjects.scene
    this.createShipReticle()
  }

  attachShuttle(group: THREE.Group): void {
    this.shuttleGroup = group
  }

  updateLaunchArrow(charge: number, _blocked: boolean): void {
    if (!this.shuttleGroup) return
    if (!this.launchArrow) {
      this.launchArrow = this.createLaunchArrowGroup()
      this.shuttleGroup.add(this.launchArrow)
    }

    const c = Math.max(0.01, charge)
    const totalLength = MAP_CONFIG.ARROW_MAX_LENGTH * c
    const headLength = MAP_CONFIG.ARROW_HEAD_LENGTH * c
    const headRadius = MAP_CONFIG.ARROW_HEAD_WIDTH * 0.5 * c
    const shaftLength = Math.max(0, totalLength - headLength)
    const shaftRadius = headRadius * 0.2

    const shaft = this.launchArrow.children[0] as THREE.Mesh
    const head = this.launchArrow.children[1] as THREE.Mesh

    shaft.scale.set(shaftLength, shaftRadius, shaftRadius)
    shaft.position.set(shaftLength * 0.5, 0, 0)

    head.scale.set(headLength, headRadius, headRadius)
    head.position.set(shaftLength + headLength * 0.5, 0, 0)

    // Advance tron shader time
    const now = performance.now() * 0.001
    syncTronHologramTimeSeconds(this.launchArrowMaterials, now)
  }

  hideLaunchArrow(): void {
    if (!this.launchArrow || !this.shuttleGroup) return
    this.shuttleGroup.remove(this.launchArrow)
    for (const child of this.launchArrow.children) {
      const mesh = child as THREE.Mesh
      mesh.geometry.dispose()
    }
    disposeTronHologramMaterials(this.launchArrowMaterials)
    this.launchArrowMaterials = []
    this.launchArrow = null
  }

  /** Override the launch arrow tron hologram tint color. */
  updateLaunchArrowColor(color: number): void {
    const c = new THREE.Color(color)
    for (const mat of this.launchArrowMaterials) {
      mat.uniforms['uColor']!.value.copy(c)
    }
  }

  /** Create a tron-hologram dart: cylinder shaft + cone head, oriented along +X. */
  private createLaunchArrowGroup(): THREE.Group {
    // Shaft: cylinder along +X (default is Y, rotateZ(-PI/2) tips Y→+X)
    const shaftGeo = new THREE.CylinderGeometry(1, 1, 1, 6)
    shaftGeo.rotateZ(-Math.PI / 2)
    const shaftMat = createTronHologramMaterial({
      color: MAP_CONFIG.ARROW_COLOR_SAFE,
      colorGain: 1.6,
      alphaGain: 1.8,
      opacity: 0.9,
    })
    const shaft = new THREE.Mesh(shaftGeo, shaftMat)

    // Head: cone tip along +X (default tip is +Y, rotateZ(-PI/2) tips Y→+X)
    const headGeo = new THREE.ConeGeometry(1, 1, 8)
    headGeo.rotateZ(-Math.PI / 2)
    const headMat = createTronHologramMaterial({
      color: MAP_CONFIG.ARROW_COLOR_SAFE,
      colorGain: 1.8,
      alphaGain: 2.0,
      opacity: 0.95,
    })
    const head = new THREE.Mesh(headGeo, headMat)

    this.launchArrowMaterials = [shaftMat, headMat]

    const group = new THREE.Group()
    group.add(shaft)
    group.add(head)
    return group
  }

  showOrbitRing(radius: number, opacity: number = MAP_CONFIG.ORBIT_RING_OPACITY): void {
    this.hideOrbitRing()
    const points: THREE.Vector3[] = []
    for (let i = 0; i <= MAP_CONFIG.ORBIT_RING_SEGMENTS; i++) {
      const angle = (i / MAP_CONFIG.ORBIT_RING_SEGMENTS) * Math.PI * 2
      points.push(new THREE.Vector3(Math.cos(angle) * radius, 0, Math.sin(angle) * radius))
    }
    const geometry = new THREE.BufferGeometry().setFromPoints(points)
    const material = new THREE.LineDashedMaterial({
      color: MAP_CONFIG.ORBIT_RING_COLOR,
      transparent: true,
      opacity,
      dashSize: MAP_CONFIG.ORBIT_RING_DASH_SIZE,
      gapSize: MAP_CONFIG.ORBIT_RING_GAP_SIZE,
    })
    this.orbitRing = new THREE.LineLoop(geometry, material)
    this.orbitRing.computeLineDistances()
    this.scene.add(this.orbitRing)
  }

  setOrbitRingPosition(x: number, y: number, z: number): void {
    this.orbitRing?.position.set(x, y, z)
  }

  hideOrbitRing(): void {
    if (this.orbitRing) {
      this.scene.remove(this.orbitRing)
      this.orbitRing.geometry.dispose()
      ;(this.orbitRing.material as THREE.LineDashedMaterial).dispose()
      this.orbitRing = null
    }
  }

  showApproachTether(): void {
    if (this.approachTether) return

    const linePositions = new Float32Array(6)
    const lineGeometry = new THREE.BufferGeometry()
    lineGeometry.setAttribute('position', new THREE.BufferAttribute(linePositions, 3))
    lineGeometry.setAttribute(
      'lineU',
      new THREE.BufferAttribute(new Float32Array([0, 1]), 1),
    )

    const lineUniforms: TetherLineUniforms = {
      uTime: { value: 0 },
      uProgress: { value: 0 },
      uOpacity: { value: 0 },
      uColor: { value: MAP_CONFIG.ORBIT_TETHER_COLOR.clone() },
      uPulseColor: { value: MAP_CONFIG.ORBIT_TETHER_PULSE_COLOR.clone() },
    }
    const lineMaterial = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: lineUniforms as unknown as Record<string, THREE.IUniform>,
      vertexShader: tetherLineVertexShader,
      fragmentShader: approachTetherLineFragmentShader,
    })
    const line = new THREE.Line(lineGeometry, lineMaterial)
    line.renderOrder = 12

    const shipLockMesh = this.createApproachLockDisc()
    const planetLockMesh = this.createApproachLockDisc()
    shipLockMesh.renderOrder = 11
    planetLockMesh.renderOrder = 11

    this.scene.add(line)
    this.scene.add(shipLockMesh)
    this.scene.add(planetLockMesh)

    this.approachTether = {
      line,
      lineGeometry,
      lineMaterial,
      linePositions,
      shipLockMesh,
      planetLockMesh,
    }
  }

  updateApproachTether(
    shipPosition: THREE.Vector3,
    planetPosition: THREE.Vector3,
    progress: number,
    dt: number,
  ): void {
    if (!this.approachTether) this.showApproachTether()
    if (!this.approachTether) return

    const tetherProgress = THREE.MathUtils.clamp(progress, 0, 1)
    const opacity = tetherProgress * MAP_CONFIG.ORBIT_TETHER_MAX_OPACITY

    const { lineGeometry, lineMaterial, linePositions, shipLockMesh, planetLockMesh } =
      this.approachTether

    linePositions[0] = shipPosition.x
    linePositions[1] = shipPosition.y
    linePositions[2] = shipPosition.z
    linePositions[3] = planetPosition.x
    linePositions[4] = planetPosition.y
    linePositions[5] = planetPosition.z
    const positionAttribute = lineGeometry.getAttribute('position') as THREE.BufferAttribute
    positionAttribute.needsUpdate = true
    const lineUniforms = lineMaterial.uniforms as unknown as TetherLineUniforms
    lineUniforms.uTime.value += dt
    lineUniforms.uProgress.value = tetherProgress
    lineUniforms.uOpacity.value = opacity

    shipLockMesh.position.copy(shipPosition)
    planetLockMesh.position.copy(planetPosition)

    const shipScale = THREE.MathUtils.lerp(
      MAP_CONFIG.ORBIT_TETHER_SHIP_GLOW_RADIUS * 0.45,
      MAP_CONFIG.ORBIT_TETHER_SHIP_GLOW_RADIUS,
      tetherProgress,
    )
    const planetScale = THREE.MathUtils.lerp(
      MAP_CONFIG.ORBIT_TETHER_PLANET_GLOW_RADIUS * 0.35,
      MAP_CONFIG.ORBIT_TETHER_PLANET_GLOW_RADIUS,
      tetherProgress,
    )
    shipLockMesh.scale.setScalar(shipScale)
    planetLockMesh.scale.setScalar(planetScale)

    const shipMaterial = shipLockMesh.material
    const shipUniforms = shipMaterial.uniforms as unknown as LockDiscUniforms
    shipUniforms.uTime.value += dt
    shipUniforms.uProgress.value = tetherProgress
    shipUniforms.uOpacity.value = opacity

    const planetMaterial = planetLockMesh.material
    const planetUniforms = planetMaterial.uniforms as unknown as LockDiscUniforms
    planetUniforms.uTime.value += dt * 0.8
    planetUniforms.uProgress.value = tetherProgress
    planetUniforms.uOpacity.value = opacity * 0.85
  }

  hideApproachTether(): void {
    if (!this.approachTether) return

    const { line, lineGeometry, lineMaterial, shipLockMesh, planetLockMesh } = this.approachTether
    this.scene.remove(line)
    this.scene.remove(shipLockMesh)
    this.scene.remove(planetLockMesh)
    lineGeometry.dispose()
    lineMaterial.dispose()
    shipLockMesh.geometry.dispose()
    shipLockMesh.material.dispose()
    planetLockMesh.geometry.dispose()
    planetLockMesh.material.dispose()
    this.approachTether = null
  }

  updateShipReticle(update: ShipReticleUpdate): void {
    if (!this.shipReticleGroup || !this.shipReticleRing || !this.shipReticlePointer) return

    const cam = update.camera
    const dist = cam.position.distanceTo(update.shuttlePosition)
    const halfFovRad = THREE.MathUtils.degToRad(cam.fov / 2)
    const overscale = update.shuttleScale / MAP_CONFIG.MAP_SHUTTLE_SCALE
    const t = THREE.MathUtils.clamp(
      (overscale - MAP_CONFIG.MAP_RETICLE_FADE_START) /
        (MAP_CONFIG.MAP_RETICLE_FADE_END - MAP_CONFIG.MAP_RETICLE_FADE_START),
      0,
      1,
    )
    const reticleAlphaRaw = t * t * (3 - 2 * t)
    const dt = Math.max(1e-4, update.dt > 0 ? update.dt : 1 / 60)
    const tauAlpha = MAP_CONFIG.MAP_RETICLE_ALPHA_SMOOTH_TAU_SEC
    if (tauAlpha > 0) {
      if (this.reticleAlphaSmooth === null) this.reticleAlphaSmooth = reticleAlphaRaw
      else {
        const aA = 1 - Math.exp(-dt / tauAlpha)
        this.reticleAlphaSmooth += (reticleAlphaRaw - this.reticleAlphaSmooth) * aA
      }
    } else {
      this.reticleAlphaSmooth = reticleAlphaRaw
    }
    const reticleAlpha = this.reticleAlphaSmooth ?? reticleAlphaRaw

    if (update.isFreeFlight && reticleAlpha > 0.005) {
      this.shipReticleGroup.visible = true
      this.shipReticleGroup.position.copy(update.shuttlePosition)
      const reticleWorld =
        MAP_CONFIG.MAP_RETICLE_APPARENT_SIZE * 2 * dist * Math.tan(halfFovRad)
      this.shipReticleGroup.scale.setScalar(reticleWorld)
      this.shipReticleRing.visible = false

      const speed = Math.hypot(update.shuttleVelocity.x, update.shuttleVelocity.z)
      const speedOn = MAP_CONFIG.MAP_RETICLE_MIN_SPEED
      const speedOff = MAP_CONFIG.MAP_RETICLE_MIN_SPEED_OFF

      if (!this.reticleWedgeSpeedGate && speed >= speedOn) {
        this.reticleWedgeSpeedGate = true
      }
      if (this.reticleWedgeSpeedGate && speed < speedOff) {
        this.reticleWedgeSpeedGate = false
        this.reticleWedgeRotationSmooth = null
      }

      if (this.reticleWedgeSpeedGate) {
        const rawAngle = computeReticleWedgeScreenRotation(
          cam,
          update.shuttlePosition,
          update.shuttleVelocity,
          MAP_CONFIG.MAP_RETICLE_WEDGE_PROJECT_OFFSET,
          this.reticleProjectScratch0,
          this.reticleProjectScratch1,
          this.reticleVelocityPlanar,
        )
        const tauRot = MAP_CONFIG.MAP_RETICLE_WEDGE_ROTATION_SMOOTH_TAU_SEC
        if (rawAngle !== null) {
          if (this.reticleWedgeRotationSmooth === null) {
            this.reticleWedgeRotationSmooth = rawAngle
          } else if (tauRot > 0) {
            const aR = 1 - Math.exp(-dt / tauRot)
            this.reticleWedgeRotationSmooth = lerpAngleRadShortest(
              this.reticleWedgeRotationSmooth,
              rawAngle,
              aR,
            )
          } else {
            this.reticleWedgeRotationSmooth = rawAngle
          }
        }
        this.shipReticlePointer.visible = this.reticleWedgeRotationSmooth !== null
        if (this.reticleWedgeRotationSmooth !== null) {
          ;(this.shipReticlePointer.material as THREE.SpriteMaterial).rotation =
            this.reticleWedgeRotationSmooth
        }
        ;(this.shipReticlePointer.material as THREE.SpriteMaterial).opacity = reticleAlpha
      } else {
        this.shipReticlePointer.visible = false
        this.reticleWedgeRotationSmooth = null
      }
    } else {
      this.shipReticleGroup.visible = false
      this.reticleWedgeSpeedGate = false
      this.reticleWedgeRotationSmooth = null
      this.reticleAlphaSmooth = null
    }
  }

  showSurfCouplingTether(): void {
    if (this.surfCouplingTether) return

    const linePositions = new Float32Array(6)
    const lineGeometry = new THREE.BufferGeometry()
    lineGeometry.setAttribute('position', new THREE.BufferAttribute(linePositions, 3))
    lineGeometry.setAttribute(
      'lineU',
      new THREE.BufferAttribute(new Float32Array([0, 1]), 1),
    )

    const lineUniforms: TetherLineUniforms = {
      uTime: { value: 0 },
      uProgress: { value: 0 },
      uOpacity: { value: 0 },
      uColor: { value: MAP_CONFIG.SURF_TETHER_COLOR.clone() },
      uPulseColor: { value: MAP_CONFIG.SURF_TETHER_PULSE_COLOR.clone() },
    }
    const lineMaterial = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: lineUniforms as unknown as Record<string, THREE.IUniform>,
      vertexShader: tetherLineVertexShader,
      fragmentShader: surfTetherLineFragmentShader,
    })
    const line = new THREE.Line(lineGeometry, lineMaterial)
    line.renderOrder = 12

    const lockMesh = this.createSurfCouplingLockDisc()
    lockMesh.renderOrder = 11

    this.scene.add(line)
    this.scene.add(lockMesh)

    this.surfCouplingTether = { line, lineGeometry, lineMaterial, linePositions, lockMesh }
  }

  updateSurfCouplingTether(
    shipPosition: THREE.Vector3,
    railPosition: THREE.Vector3,
    progress: number,
    dt: number,
  ): void {
    if (!this.surfCouplingTether) this.showSurfCouplingTether()
    if (!this.surfCouplingTether) return

    const tetherProgress = THREE.MathUtils.clamp(progress, 0, 1)
    const opacity = tetherProgress * MAP_CONFIG.SURF_TETHER_MAX_OPACITY

    const { lineGeometry, lineMaterial, linePositions, lockMesh } = this.surfCouplingTether

    linePositions[0] = shipPosition.x
    linePositions[1] = shipPosition.y
    linePositions[2] = shipPosition.z
    linePositions[3] = railPosition.x
    linePositions[4] = railPosition.y
    linePositions[5] = railPosition.z
    const positionAttribute = lineGeometry.getAttribute('position') as THREE.BufferAttribute
    positionAttribute.needsUpdate = true
    const lineUniforms = lineMaterial.uniforms as unknown as TetherLineUniforms
    lineUniforms.uTime.value += dt
    lineUniforms.uProgress.value = tetherProgress
    lineUniforms.uOpacity.value = opacity

    lockMesh.position.copy(railPosition)
    const lockScale = THREE.MathUtils.lerp(
      MAP_CONFIG.SURF_TETHER_SHIP_GLOW_RADIUS * 0.3,
      MAP_CONFIG.SURF_TETHER_SHIP_GLOW_RADIUS,
      tetherProgress,
    )
    lockMesh.scale.setScalar(lockScale)

    const lockUniforms = lockMesh.material.uniforms as unknown as LockDiscUniforms
    lockUniforms.uTime.value += dt
    lockUniforms.uProgress.value = tetherProgress
    lockUniforms.uOpacity.value = opacity
  }

  hideSurfCouplingTether(): void {
    if (!this.surfCouplingTether) return

    const { line, lineGeometry, lineMaterial, lockMesh } = this.surfCouplingTether
    this.scene.remove(line)
    this.scene.remove(lockMesh)
    lineGeometry.dispose()
    lineMaterial.dispose()
    lockMesh.geometry.dispose()
    lockMesh.material.dispose()
    this.surfCouplingTether = null
  }

  private createSurfCouplingLockDisc(): THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial> {
    const geometry = new THREE.PlaneGeometry(1, 1, 1, 1)
    const uniforms: LockDiscUniforms = {
      uTime: { value: 0 },
      uProgress: { value: 0 },
      uOpacity: { value: 0 },
      uColor: { value: MAP_CONFIG.SURF_TETHER_ANCHOR_COLOR.clone() },
    }
    const material = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: uniforms as unknown as Record<string, THREE.IUniform>,
      vertexShader: lockDiscVertexShader,
      fragmentShader: surfLockDiscFragmentShader,
    })
    const mesh = new THREE.Mesh(geometry, material)
    mesh.rotation.x = -Math.PI / 2
    return mesh
  }

  showProgradeMarkers(): void {
    if (this.progradeMarkers) return

    const progradeSprite = this.createMarkerSprite('#34ff88', 'circle')
    const retrogradeSprite = this.createMarkerSprite('#ffaa44', 'cross')
    progradeSprite.renderOrder = 13
    retrogradeSprite.renderOrder = 13

    this.scene.add(progradeSprite)
    this.scene.add(retrogradeSprite)

    this.progradeMarkers = { progradeSprite, retrogradeSprite }
  }

  updateProgradeMarkers(
    progradePos: THREE.Vector3,
    retrogradePos: THREE.Vector3,
    alignment: number,
    dt: number,
  ): void {
    if (!this.progradeMarkers) return
    const { progradeSprite, retrogradeSprite } = this.progradeMarkers

    const dtu = Math.max(1e-4, dt)
    const tauPos = MAP_CONFIG.MAP_PROGRADE_MARKER_POSITION_SMOOTH_TAU_SEC
    const aPos = tauPos > 0 ? 1 - Math.exp(-dtu / tauPos) : 1
    if (this.progradePosSmooth === null) this.progradePosSmooth = progradePos.clone()
    else this.progradePosSmooth.lerp(progradePos, aPos)
    if (this.retrogradePosSmooth === null) this.retrogradePosSmooth = retrogradePos.clone()
    else this.retrogradePosSmooth.lerp(retrogradePos, aPos)
    progradeSprite.position.copy(this.progradePosSmooth)
    retrogradeSprite.position.copy(this.retrogradePosSmooth)

    const tauOp = MAP_CONFIG.MAP_PROGRADE_MARKER_OPACITY_SMOOTH_TAU_SEC
    const smoothOp = (prev: number | null, target: number): number => {
      if (prev === null) return target
      if (tauOp <= 0) return target
      return prev + (target - prev) * (1 - Math.exp(-dtu / tauOp))
    }

    // Pulse prograde marker brightness when aligned (opacity low-pass reduces flicker).
    const progradeMat = progradeSprite.material as THREE.SpriteMaterial
    const baseOpacity = 0.7
    const alignGlow = alignment > 0.85 ? 0.3 * ((alignment - 0.85) / 0.15) : 0
    const targetPro = baseOpacity + alignGlow
    this.progradeMarkerOpacitySmooth = smoothOp(this.progradeMarkerOpacitySmooth, targetPro)
    progradeMat.opacity = THREE.MathUtils.clamp(this.progradeMarkerOpacitySmooth, 0.35, 1)

    const retroMat = retrogradeSprite.material as THREE.SpriteMaterial
    const retroGlow = alignment < -0.85 ? 0.3 * ((Math.abs(alignment) - 0.85) / 0.15) : 0
    const targetRetro = baseOpacity + retroGlow
    this.retrogradeMarkerOpacitySmooth = smoothOp(this.retrogradeMarkerOpacitySmooth, targetRetro)
    retroMat.opacity = THREE.MathUtils.clamp(this.retrogradeMarkerOpacitySmooth, 0.35, 1)
  }

  hideProgradeMarkers(): void {
    if (!this.progradeMarkers) return
    this.progradeMarkerOpacitySmooth = null
    this.retrogradeMarkerOpacitySmooth = null
    this.progradePosSmooth = null
    this.retrogradePosSmooth = null
    const { progradeSprite, retrogradeSprite } = this.progradeMarkers
    this.scene.remove(progradeSprite)
    this.scene.remove(retrogradeSprite)
    ;(progradeSprite.material as THREE.SpriteMaterial).map?.dispose()
    ;(progradeSprite.material as THREE.SpriteMaterial).dispose()
    ;(retrogradeSprite.material as THREE.SpriteMaterial).map?.dispose()
    ;(retrogradeSprite.material as THREE.SpriteMaterial).dispose()
    this.progradeMarkers = null
  }

  private createMarkerSprite(color: string, shape: 'circle' | 'cross'): THREE.Sprite {
    const size = 64
    const canvas = document.createElement('canvas')
    canvas.width = size
    canvas.height = size
    const ctx = canvas.getContext('2d')!
    const half = size / 2

    ctx.strokeStyle = color
    ctx.fillStyle = color
    ctx.lineWidth = 4

    if (shape === 'circle') {
      ctx.beginPath()
      ctx.arc(half, half, half * 0.6, 0, Math.PI * 2)
      ctx.fill()
    } else {
      const arm = half * 0.5
      ctx.beginPath()
      ctx.moveTo(half - arm, half - arm)
      ctx.lineTo(half + arm, half + arm)
      ctx.moveTo(half + arm, half - arm)
      ctx.lineTo(half - arm, half + arm)
      ctx.stroke()
      ctx.beginPath()
      ctx.arc(half, half, half * 0.6, 0, Math.PI * 2)
      ctx.stroke()
    }

    const texture = new THREE.CanvasTexture(canvas)
    const material = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })
    const sprite = new THREE.Sprite(material)
    sprite.scale.setScalar(0.3)
    return sprite
  }

  dispose(): void {
    this.hideLaunchArrow()
    this.hideOrbitRing()
    this.hideApproachTether()
    this.hideSurfCouplingTether()
    this.hideProgradeMarkers()
    if (this.shipReticleGroup) {
      const disposeSprite = (sprite: THREE.Sprite) => {
        const material = sprite.material as THREE.SpriteMaterial
        material.map?.dispose()
        material.dispose()
      }
      if (this.shipReticleRing) disposeSprite(this.shipReticleRing)
      if (this.shipReticlePointer) disposeSprite(this.shipReticlePointer)
      this.scene.remove(this.shipReticleGroup)
      this.shipReticleGroup = null
      this.shipReticleRing = null
      this.shipReticlePointer = null
    }
    this.shuttleGroup = null
  }

  private createShipReticle(): void {
    const size = 128
    const ringCanvas = document.createElement('canvas')
    ringCanvas.width = size
    ringCanvas.height = size
    const ctx = ringCanvas.getContext('2d')
    if (!ctx) return

    const cx = size / 2
    const cy = size / 2
    const ringR = 46
    const tickInner = 53
    const tickOuter = 63

    ctx.beginPath()
    ctx.arc(cx, cy, ringR + 5, 0, Math.PI * 2)
    ctx.strokeStyle = 'rgba(0, 210, 255, 0.18)'
    ctx.lineWidth = 10
    ctx.stroke()

    ctx.beginPath()
    ctx.arc(cx, cy, ringR, 0, Math.PI * 2)
    ctx.strokeStyle = 'rgba(0, 230, 255, 0.9)'
    ctx.lineWidth = 2
    ctx.stroke()

    for (let i = 0; i < 4; i++) {
      const angle = (i * Math.PI) / 2
      const cos = Math.cos(angle)
      const sin = Math.sin(angle)
      ctx.beginPath()
      ctx.moveTo(cx + cos * tickInner, cy + sin * tickInner)
      ctx.lineTo(cx + cos * tickOuter, cy + sin * tickOuter)
      ctx.strokeStyle = 'rgba(0, 230, 255, 0.95)'
      ctx.lineWidth = 2
      ctx.stroke()
    }

    const ringTex = new THREE.CanvasTexture(ringCanvas)
    ringTex.needsUpdate = true
    const ringMat = new THREE.SpriteMaterial({
      map: ringTex,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
    this.shipReticleRing = new THREE.Sprite(ringMat)

    const wedgeCanvas = document.createElement('canvas')
    wedgeCanvas.width = size
    wedgeCanvas.height = size
    const wctx = wedgeCanvas.getContext('2d')
    if (!wctx) return

    const tipX = cx + 62
    const baseX = cx + 34
    const halfW = 13
    wctx.beginPath()
    wctx.moveTo(tipX, cy)
    wctx.lineTo(baseX, cy - halfW)
    wctx.lineTo(baseX, cy + halfW)
    wctx.closePath()
    wctx.fillStyle = 'rgba(0, 235, 255, 0.92)'
    wctx.fill()
    wctx.strokeStyle = 'rgba(255, 255, 255, 0.35)'
    wctx.lineWidth = 1
    wctx.stroke()

    const wedgeTex = new THREE.CanvasTexture(wedgeCanvas)
    wedgeTex.needsUpdate = true
    const wedgeMat = new THREE.SpriteMaterial({
      map: wedgeTex,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
    this.shipReticlePointer = new THREE.Sprite(wedgeMat)
    this.shipReticlePointer.visible = false

    this.shipReticleGroup = new THREE.Group()
    this.shipReticleGroup.add(this.shipReticleRing)
    this.shipReticleGroup.add(this.shipReticlePointer)
    this.shipReticleGroup.visible = false
    this.scene.add(this.shipReticleGroup)
  }

  private createApproachLockDisc(): THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial> {
    const geometry = new THREE.PlaneGeometry(1, 1, 1, 1)
    const uniforms: LockDiscUniforms = {
      uTime: { value: 0 },
      uProgress: { value: 0 },
      uOpacity: { value: 0 },
      uColor: { value: MAP_CONFIG.ORBIT_TETHER_ANCHOR_COLOR.clone() },
    }
    const material = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: uniforms as unknown as Record<string, THREE.IUniform>,
      vertexShader: lockDiscVertexShader,
      fragmentShader: approachLockDiscFragmentShader,
    })
    const mesh = new THREE.Mesh(geometry, material)
    mesh.rotation.x = -Math.PI / 2
    return mesh
  }
}
