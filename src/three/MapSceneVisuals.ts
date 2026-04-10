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

export class MapSceneVisuals {
  private scene: THREE.Scene
  private shuttleGroup: THREE.Group | null = null
  private orbitRing: THREE.LineLoop | null = null
  private launchArrow: THREE.ArrowHelper | null = null
  private shipReticleGroup: THREE.Group | null = null
  private shipReticleRing: THREE.Sprite | null = null
  private shipReticlePointer: THREE.Sprite | null = null

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

  dispose(): void {
    this.hideLaunchArrow()
    this.hideOrbitRing()
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
}
