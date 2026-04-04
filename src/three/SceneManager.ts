import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import type { Tickable } from '@/lib/Tickable'

const CAMERA_FOV = 60
const CAMERA_NEAR = 0.1
const CAMERA_FAR = 50000

/** Default 3rd-person offset: behind and above the shuttle */
const IDLE_CAM_OFFSET = new THREE.Vector3(-80, 40, 0)
const IDLE_CAM_LERP_SPEED = 5
const IDLE_TIMEOUT_S = 1.0 // seconds after mouse release before auto-returning
const MIN_CAMERA_Y = 15

/**
 * Three.js scene orchestrator — creates renderer, camera, and controls.
 * Orbit target is always locked to the shuttle (ship stays centered).
 * Camera position returns to idle 3rd-person when mouse is released.
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
  private lastShuttlePos = new THREE.Vector3()

  constructor() {
    this.scene = new THREE.Scene()

    this.camera = new THREE.PerspectiveCamera(CAMERA_FOV, 1, CAMERA_NEAR, CAMERA_FAR)

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
    this.lastShuttlePos.copy(object.position)
    this.controls.target.copy(object.position)

    // Set initial camera to idle position
    const idleOffset = IDLE_CAM_OFFSET.clone().applyQuaternion(object.quaternion)
    this.camera.position.copy(object.position).add(idleOffset)
    this.camera.position.y = Math.max(this.camera.position.y, MIN_CAMERA_Y)
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

      // How much the shuttle moved this frame
      const delta = shuttlePos.clone().sub(this.lastShuttlePos)
      this.lastShuttlePos.copy(shuttlePos)

      // Always keep orbit target on the shuttle — ship stays centered
      this.controls.target.copy(shuttlePos)

      // Move camera by the same delta so it tracks the shuttle
      this.camera.position.add(delta)

      if (!this.isMouseActive) {
        this.mouseIdleTimer += dt

        if (this.mouseIdleTimer > IDLE_TIMEOUT_S) {
          // Smoothly return to idle position behind shuttle
          const idleOffset = IDLE_CAM_OFFSET.clone()
            .applyQuaternion(this.shuttleRef.quaternion)
          const targetCamPos = shuttlePos.clone().add(idleOffset)
          targetCamPos.y = Math.max(targetCamPos.y, MIN_CAMERA_Y)

          this.camera.position.lerp(targetCamPos, IDLE_CAM_LERP_SPEED * dt)
        }
      }

      // Always clamp
      if (this.camera.position.y < MIN_CAMERA_Y) {
        this.camera.position.y = MIN_CAMERA_Y
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
