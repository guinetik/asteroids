/**
 * Three.js scene orchestrator — creates renderer and manages the scene graph.
 * Camera tracking is delegated to {@link VehicleCamera}.
 *
 * @author guinetik
 * @date 2026-04-04
 * @spec docs/superpowers/specs/2026-04-04-shuttle-scene-design.md
 */
import * as THREE from 'three'
import type { Tickable } from '@/lib/Tickable'
import type { VehicleCamera } from './VehicleCamera'

/**
 * Manages the Three.js renderer and scene graph.
 * Rendering uses the camera provided by the active {@link VehicleCamera}.
 *
 * @author guinetik
 * @date 2026-04-04
 * @spec docs/superpowers/specs/2026-04-04-shuttle-scene-design.md
 */
export class SceneManager implements Tickable {
  readonly scene: THREE.Scene
  readonly renderer: THREE.WebGLRenderer

  private container: HTMLElement | null = null
  private vehicleCamera: VehicleCamera | null = null
  /** Direct camera for scenes that don't use VehicleCamera (e.g. FPS). */
  private directCamera: THREE.PerspectiveCamera | null = null

  constructor() {
    this.scene = new THREE.Scene()

    this.renderer = new THREE.WebGLRenderer({ antialias: true })
    this.renderer.setClearColor(0x000000)
    this.renderer.setPixelRatio(window.devicePixelRatio)

    window.addEventListener('resize', this.onResize)
  }

  mount(container: HTMLElement): void {
    this.container = container
    const { clientWidth, clientHeight } = container
    this.renderer.setSize(clientWidth, clientHeight)
    container.appendChild(this.renderer.domElement)
  }

  /** Connect a vehicle camera for rendering. */
  setCamera(camera: VehicleCamera): void {
    this.vehicleCamera = camera
    if (this.container) {
      const { clientWidth, clientHeight } = this.container
      camera.resize(clientWidth, clientHeight)
    }
  }

  /** Set a raw perspective camera for rendering (FPS mode). */
  setActiveCamera(camera: THREE.PerspectiveCamera): void {
    this.directCamera = camera
    if (this.container) {
      const { clientWidth, clientHeight } = this.container
      camera.aspect = clientWidth / clientHeight
      camera.updateProjectionMatrix()
    }
  }

  addToScene(object: THREE.Object3D): void {
    this.scene.add(object)
  }

  removeFromScene(object: THREE.Object3D): void {
    this.scene.remove(object)
  }

  tick(_dt: number): void {
    const cam = this.directCamera ?? this.vehicleCamera?.camera
    if (cam) {
      this.renderer.render(this.scene, cam)
    }
  }

  dispose(): void {
    window.removeEventListener('resize', this.onResize)
    this.renderer.dispose()
    if (this.container) {
      this.container.removeChild(this.renderer.domElement)
    }
  }

  private onResize = (): void => {
    if (!this.container) return
    const { clientWidth, clientHeight } = this.container
    this.renderer.setSize(clientWidth, clientHeight)
    this.vehicleCamera?.resize(clientWidth, clientHeight)
    if (this.directCamera) {
      this.directCamera.aspect = clientWidth / clientHeight
      this.directCamera.updateProjectionMatrix()
    }
  }
}
