import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import type { Tickable } from '@/lib/Tickable'

const CAMERA_FOV = 60
const CAMERA_NEAR = 0.1
const CAMERA_FAR = 50000
const CAMERA_INITIAL_POSITION = new THREE.Vector3(300, 200, 300)

/** Default 3rd-person offset: behind and above the shuttle */
const IDLE_CAM_OFFSET = new THREE.Vector3(-20, 50, 0)
const IDLE_CAM_LERP_SPEED = 2
const IDLE_TIMEOUT_S = 1.5 // seconds of no mouse before auto-returning

/**
 * Three.js scene orchestrator — creates renderer, camera, and controls.
 * Implements Tickable to render each frame via the game loop.
 * Camera follows the shuttle and returns to 3rd-person idle position
 * when the mouse is not being used.
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
  private shuttleRef: THREE.Object3D | null = null
  private mouseIdleTimer = 0
  private isMouseActive = false

  constructor() {
    this.scene = new THREE.Scene()

    this.camera = new THREE.PerspectiveCamera(CAMERA_FOV, 1, CAMERA_NEAR, CAMERA_FAR)
    this.camera.position.copy(CAMERA_INITIAL_POSITION)

    this.renderer = new THREE.WebGLRenderer({ antialias: true })
    this.renderer.setClearColor(0x000000)
    this.renderer.setPixelRatio(window.devicePixelRatio)

    this.controls = new OrbitControls(this.camera, this.renderer.domElement)
    this.controls.enableDamping = true
    this.controls.dampingFactor = 0.1

    this.controls.addEventListener('start', this.onControlStart)
    this.controls.addEventListener('end', this.onControlEnd)

    window.addEventListener('resize', this.onResize)
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
    this.controls.target.copy(object.position)
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

      if (this.isMouseActive) {
        // User is controlling camera — just follow the shuttle
        const offset = this.camera.position.clone().sub(this.controls.target)
        this.controls.target.copy(shuttlePos)
        this.camera.position.copy(shuttlePos).add(offset)
      } else {
        this.mouseIdleTimer += dt

        if (this.mouseIdleTimer > IDLE_TIMEOUT_S) {
          // Smoothly return to 3rd-person idle position behind shuttle
          const idleOffset = IDLE_CAM_OFFSET.clone()
            .applyQuaternion(this.shuttleRef.quaternion)
          const targetCamPos = shuttlePos.clone().add(idleOffset)

          this.camera.position.lerp(targetCamPos, IDLE_CAM_LERP_SPEED * dt)
          this.controls.target.lerp(shuttlePos, IDLE_CAM_LERP_SPEED * dt)
        } else {
          // Still in cooldown — keep following
          const offset = this.camera.position.clone().sub(this.controls.target)
          this.controls.target.copy(shuttlePos)
          this.camera.position.copy(shuttlePos).add(offset)
        }
      }
    }

    this.controls.update()
    this.renderer.render(this.scene, this.camera)
  }

  dispose(): void {
    window.removeEventListener('resize', this.onResize)
    this.controls.removeEventListener('start', this.onControlStart)
    this.controls.removeEventListener('end', this.onControlEnd)
    this.controls.dispose()
    this.renderer.dispose()
    if (this.container) {
      this.container.removeChild(this.renderer.domElement)
    }
  }

  private onControlStart = (): void => {
    this.isMouseActive = true
    this.mouseIdleTimer = 0
  }

  private onControlEnd = (): void => {
    this.isMouseActive = false
    this.mouseIdleTimer = 0
  }

  private onResize = (): void => {
    if (!this.container) return
    const { clientWidth, clientHeight } = this.container
    this.renderer.setSize(clientWidth, clientHeight)
    this.camera.aspect = clientWidth / clientHeight
    this.camera.updateProjectionMatrix()
  }
}
