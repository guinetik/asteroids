import * as THREE from 'three'
import type { MapSceneObjects } from '@/three/MapSceneSetup'
import { MAP_VIEW_CONTROLLER_CONFIG as MAP_CONFIG } from '@/lib/map/mapViewControllerConfig'

export interface ShipReticleUpdate {
  shuttlePosition: THREE.Vector3
  shuttleVelocity: THREE.Vector3
  shuttleScale: number
  cameraPosition: THREE.Vector3
  cameraFov: number
  cameraAzimuth: number
  isFreeFlight: boolean
}

interface ApproachTetherVisuals {
  readonly line: THREE.Line<THREE.BufferGeometry, THREE.ShaderMaterial>
  readonly lineGeometry: THREE.BufferGeometry
  readonly lineMaterial: THREE.ShaderMaterial
  readonly linePositions: Float32Array
  readonly shipLockMesh: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>
  readonly planetLockMesh: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>
}

interface TetherLineUniforms {
  uTime: { value: number }
  uProgress: { value: number }
  uOpacity: { value: number }
  uColor: { value: THREE.Color }
  uPulseColor: { value: THREE.Color }
}

interface LockDiscUniforms {
  uTime: { value: number }
  uProgress: { value: number }
  uOpacity: { value: number }
  uColor: { value: THREE.Color }
}

interface SurfCouplingTetherVisuals {
  readonly line: THREE.Line<THREE.BufferGeometry, THREE.ShaderMaterial>
  readonly lineGeometry: THREE.BufferGeometry
  readonly lineMaterial: THREE.ShaderMaterial
  readonly linePositions: Float32Array
  readonly lockMesh: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>
}

interface ProgradeMarkerVisuals {
  readonly progradeSprite: THREE.Sprite
  readonly retrogradeSprite: THREE.Sprite
}

export class MapSceneVisuals {
  private scene: THREE.Scene
  private shuttleGroup: THREE.Group | null = null
  private orbitRing: THREE.LineLoop | null = null
  private launchArrow: THREE.ArrowHelper | null = null
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

  updateLaunchArrow(charge: number, blocked: boolean): void {
    if (!this.shuttleGroup) return
    if (!this.launchArrow) {
      this.launchArrow = new THREE.ArrowHelper(
        new THREE.Vector3(1, 0, 0),
        new THREE.Vector3(0, 0, 0),
        MAP_CONFIG.ARROW_MAX_LENGTH,
        MAP_CONFIG.ARROW_COLOR_SAFE,
        MAP_CONFIG.ARROW_HEAD_LENGTH,
        MAP_CONFIG.ARROW_HEAD_WIDTH,
      )
      this.shuttleGroup.add(this.launchArrow)
    }

    this.launchArrow.setColor(
      new THREE.Color(blocked ? MAP_CONFIG.ARROW_COLOR_BLOCKED : MAP_CONFIG.ARROW_COLOR_SAFE),
    )
    this.launchArrow.setLength(
      MAP_CONFIG.ARROW_MAX_LENGTH * charge,
      MAP_CONFIG.ARROW_HEAD_LENGTH * charge,
      MAP_CONFIG.ARROW_HEAD_WIDTH * charge,
    )
  }

  hideLaunchArrow(): void {
    if (!this.launchArrow || !this.shuttleGroup) return
    this.shuttleGroup.remove(this.launchArrow)
    this.launchArrow.dispose()
    this.launchArrow = null
  }

  /** Override the launch arrow color (e.g. for prograde/retrograde alignment feedback). */
  updateLaunchArrowColor(color: number): void {
    if (!this.launchArrow) return
    this.launchArrow.setColor(new THREE.Color(color))
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
      vertexShader: `
        attribute float lineU;
        varying float vLineU;

        void main() {
          vLineU = lineU;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform float uTime;
        uniform float uProgress;
        uniform float uOpacity;
        uniform vec3 uColor;
        uniform vec3 uPulseColor;
        varying float vLineU;

        void main() {
          float pulse = 0.5 + 0.5 * sin((vLineU * 10.0) - (uTime * 8.0));
          float captureFront = smoothstep(0.0, 0.85, uProgress + (1.0 - vLineU) * 0.35);
          vec3 color = mix(uColor, uPulseColor, pulse * 0.45);
          float alpha = uOpacity * captureFront * (0.55 + pulse * 0.45);
          gl_FragColor = vec4(color, alpha);
        }
      `,
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

    const dist = update.cameraPosition.distanceTo(update.shuttlePosition)
    const halfFovRad = THREE.MathUtils.degToRad(update.cameraFov / 2)
    const overscale = update.shuttleScale / MAP_CONFIG.MAP_SHUTTLE_SCALE
    const t = THREE.MathUtils.clamp(
      (overscale - MAP_CONFIG.MAP_RETICLE_FADE_START) /
        (MAP_CONFIG.MAP_RETICLE_FADE_END - MAP_CONFIG.MAP_RETICLE_FADE_START),
      0,
      1,
    )
    const reticleAlpha = t * t * (3 - 2 * t)

    if (update.isFreeFlight && reticleAlpha > 0.005) {
      this.shipReticleGroup.visible = true
      this.shipReticleGroup.position.copy(update.shuttlePosition)
      const reticleWorld =
        MAP_CONFIG.MAP_RETICLE_APPARENT_SIZE * 2 * dist * Math.tan(halfFovRad)
      this.shipReticleGroup.scale.setScalar(reticleWorld)
      this.shipReticleRing.visible = false

      const speed = Math.hypot(update.shuttleVelocity.x, update.shuttleVelocity.z)
      if (speed >= MAP_CONFIG.MAP_RETICLE_MIN_SPEED) {
        const worldHeading = Math.atan2(update.shuttleVelocity.x, update.shuttleVelocity.z)
        const spriteAngle = worldHeading - update.cameraAzimuth - Math.PI / 2
        this.shipReticlePointer.visible = true
        ;(this.shipReticlePointer.material as THREE.SpriteMaterial).rotation = spriteAngle
        ;(this.shipReticlePointer.material as THREE.SpriteMaterial).opacity = reticleAlpha
      } else {
        this.shipReticlePointer.visible = false
      }
    } else {
      this.shipReticleGroup.visible = false
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
      vertexShader: `
        attribute float lineU;
        varying float vLineU;

        void main() {
          vLineU = lineU;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform float uTime;
        uniform float uProgress;
        uniform float uOpacity;
        uniform vec3 uColor;
        uniform vec3 uPulseColor;
        varying float vLineU;

        void main() {
          float pulse = 0.5 + 0.5 * sin((vLineU * 14.0) - (uTime * 12.0));
          float captureFront = smoothstep(0.0, 0.7, uProgress + (1.0 - vLineU) * 0.4);
          vec3 color = mix(uColor, uPulseColor, pulse * 0.5);
          float alpha = uOpacity * captureFront * (0.5 + pulse * 0.5);
          gl_FragColor = vec4(color, alpha);
        }
      `,
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
      vertexShader: `
        varying vec2 vUv;

        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform float uTime;
        uniform float uProgress;
        uniform float uOpacity;
        uniform vec3 uColor;
        varying vec2 vUv;

        void main() {
          vec2 centered = (vUv - 0.5) * 2.0;
          float radius = length(centered);
          float rim = smoothstep(0.8, 0.2, radius);
          float ring = smoothstep(0.3, 0.26, abs(radius - (0.5 + 0.06 * sin(uTime * 6.0))));
          float grid = max(
            smoothstep(0.04, 0.0, abs(centered.x)),
            smoothstep(0.04, 0.0, abs(centered.y))
          );
          float intensity = max(rim * 0.4, max(ring * 0.8, grid * 0.6 * uProgress));
          float alpha = intensity * uOpacity * (0.4 + uProgress * 0.6);
          gl_FragColor = vec4(uColor, alpha);
        }
      `,
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
    _dt: number,
  ): void {
    if (!this.progradeMarkers) return
    const { progradeSprite, retrogradeSprite } = this.progradeMarkers

    progradeSprite.position.copy(progradePos)
    retrogradeSprite.position.copy(retrogradePos)

    // Pulse prograde marker brightness when aligned
    const progradeMat = progradeSprite.material as THREE.SpriteMaterial
    const baseOpacity = 0.7
    const alignGlow = alignment > 0.85 ? 0.3 * ((alignment - 0.85) / 0.15) : 0
    progradeMat.opacity = baseOpacity + alignGlow

    const retroMat = retrogradeSprite.material as THREE.SpriteMaterial
    const retroGlow = alignment < -0.85 ? 0.3 * ((Math.abs(alignment) - 0.85) / 0.15) : 0
    retroMat.opacity = baseOpacity + retroGlow
  }

  hideProgradeMarkers(): void {
    if (!this.progradeMarkers) return
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
      vertexShader: `
        varying vec2 vUv;

        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform float uTime;
        uniform float uProgress;
        uniform float uOpacity;
        uniform vec3 uColor;
        varying vec2 vUv;

        void main() {
          vec2 centered = (vUv - 0.5) * 2.0;
          float radius = length(centered);
          float rim = smoothstep(0.7, 0.25, radius);
          float ring = smoothstep(0.38, 0.34, abs(radius - (0.45 + 0.08 * sin(uTime * 5.0))));
          float spokes = 0.5 + 0.5 * sin(atan(centered.y, centered.x) * 6.0 + uTime * 3.0);
          float intensity = max(rim * 0.55, ring * (0.65 + 0.35 * spokes));
          float alpha = intensity * uOpacity * (0.45 + uProgress * 0.55);
          gl_FragColor = vec4(uColor, alpha);
        }
      `,
    })
    const mesh = new THREE.Mesh(geometry, material)
    mesh.rotation.x = -Math.PI / 2
    return mesh
  }
}
