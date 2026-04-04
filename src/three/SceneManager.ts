import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import type { Tickable } from '@/lib/Tickable'

const CAMERA_FOV = 60
const CAMERA_NEAR = 0.1
const CAMERA_FAR = 50000
const CAMERA_INITIAL_HEIGHT = 200
const CHASE_CAM_LERP_SPEED = 4
const ZOOM_SPEED = 0.1
const MIN_HEIGHT = 30
const MAX_HEIGHT = 2000

/**
 * Three.js scene orchestrator — creates renderer, camera, and controls.
 * Implements Tickable to render each frame via the game loop.
 *
 * @author guinetik
 * @date 2026-04-04
 * @spec docs/superpowers/specs/2026-04-04-shuttle-scene-design.md
 */
export class SceneManager implements Tickable {
  readonly scene: THREE.Scene
  readonly camera: THREE.PerspectiveCamera
  readonly renderer: THREE.WebGLRenderer
  readonly controls: OrbitControls

  private container: HTMLElement | null = null
  private chaseMode = true
  private shuttleRef: THREE.Object3D | null = null
  private cameraHeight = CAMERA_INITIAL_HEIGHT

  constructor() {
    this.scene = new THREE.Scene()

    this.camera = new THREE.PerspectiveCamera(CAMERA_FOV, 1, CAMERA_NEAR, CAMERA_FAR)
    this.camera.position.set(0, CAMERA_INITIAL_HEIGHT, 0)

    this.renderer = new THREE.WebGLRenderer({ antialias: true })
    this.renderer.setClearColor(0x000000)
    this.renderer.setPixelRatio(window.devicePixelRatio)

    this.controls = new OrbitControls(this.camera, this.renderer.domElement)
    this.controls.enableDamping = true
    this.controls.enabled = false // chase cam is default

    window.addEventListener('resize', this.onResize)
    window.addEventListener('wheel', this.onWheel, { passive: false })
  }

  mount(container: HTMLElement): void {
    this.container = container
    const { clientWidth, clientHeight } = container
    this.renderer.setSize(clientWidth, clientHeight)
    this.camera.aspect = clientWidth / clientHeight
    this.camera.updateProjectionMatrix()
    container.appendChild(this.renderer.domElement)
  }

  setShuttleRef(object: THREE.Object3D): void {
    this.shuttleRef = object
  }

  toggleCamera(): void {
    this.chaseMode = !this.chaseMode
    this.controls.enabled = !this.chaseMode
  }

  addToScene(object: THREE.Object3D): void {
    this.scene.add(object)
  }

  removeFromScene(object: THREE.Object3D): void {
    this.scene.remove(object)
  }

  tick(dt: number): void {
    if (this.shuttleRef) {
      const shuttlePos = this.shuttleRef.position

      if (this.chaseMode) {
        // Top-down: camera directly above shuttle, looking straight down
        const targetPos = shuttlePos.clone()
        targetPos.y += this.cameraHeight
        this.camera.position.lerp(targetPos, CHASE_CAM_LERP_SPEED * dt)
        this.camera.lookAt(shuttlePos)
      } else {
        this.controls.target.copy(shuttlePos)
        this.controls.update()
      }
    } else {
      this.controls.update()
    }

    this.renderer.render(this.scene, this.camera)
  }

  dispose(): void {
    window.removeEventListener('resize', this.onResize)
    window.removeEventListener('wheel', this.onWheel)
    this.controls.dispose()
    this.renderer.dispose()
    if (this.container) {
      this.container.removeChild(this.renderer.domElement)
    }
  }

  private onWheel = (e: WheelEvent): void => {
    if (!this.chaseMode) return
    e.preventDefault()
    const zoomDelta = 1 + Math.sign(e.deltaY) * ZOOM_SPEED
    this.cameraHeight = Math.max(MIN_HEIGHT, Math.min(MAX_HEIGHT, this.cameraHeight * zoomDelta))
  }

  private onResize = (): void => {
    if (!this.container) return
    const { clientWidth, clientHeight } = this.container
    this.renderer.setSize(clientWidth, clientHeight)
    this.camera.aspect = clientWidth / clientHeight
    this.camera.updateProjectionMatrix()
  }
}
