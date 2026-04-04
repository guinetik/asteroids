import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import type { Tickable } from '@/lib/Tickable'

const CAMERA_FOV = 60
const CAMERA_NEAR = 0.1
const CAMERA_FAR = 50000
const CAMERA_INITIAL_OFFSET = new THREE.Vector3(0, 20, 30)
const CHASE_CAM_OFFSET = new THREE.Vector3(0, 12, -20)
const CHASE_CAM_LERP_SPEED = 5

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
  private chaseMode = false
  private shuttleRef: THREE.Object3D | null = null

  constructor() {
    this.scene = new THREE.Scene()

    this.camera = new THREE.PerspectiveCamera(CAMERA_FOV, 1, CAMERA_NEAR, CAMERA_FAR)
    this.camera.position.copy(CAMERA_INITIAL_OFFSET)

    this.renderer = new THREE.WebGLRenderer({ antialias: true })
    this.renderer.setClearColor(0x000000)
    this.renderer.setPixelRatio(window.devicePixelRatio)

    this.controls = new OrbitControls(this.camera, this.renderer.domElement)
    this.controls.enableDamping = true

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
        const offset = CHASE_CAM_OFFSET.clone().applyQuaternion(this.shuttleRef.quaternion)
        const targetPos = shuttlePos.clone().add(offset)
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
    this.controls.dispose()
    this.renderer.dispose()
    if (this.container) {
      this.container.removeChild(this.renderer.domElement)
    }
  }

  private onResize = (): void => {
    if (!this.container) return
    const { clientWidth, clientHeight } = this.container
    this.renderer.setSize(clientWidth, clientHeight)
    this.camera.aspect = clientWidth / clientHeight
    this.camera.updateProjectionMatrix()
  }
}
