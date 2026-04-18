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
  /** External render callback — when set, tick() calls this instead of renderer.render(). */
  renderOverride: (() => void) | null = null
  /** Called on resize so external systems (post-processing) can update. */
  onResizeCallback: ((width: number, height: number) => void) | null = null

  constructor() {
    this.scene = new THREE.Scene()

    this.renderer = new THREE.WebGLRenderer({ antialias: true })
    this.renderer.setClearColor(0x000000)
    // Cap pixel ratio. On hi-DPI displays (Retina, 4K), `window.devicePixelRatio`
    // is often 2 or even 3, which means the GPU shades 4× to 9× as many fragments
    // as the logical viewport. PBR + shadow lookup + post-processing made this the
    // single biggest steady-state fragment-shader cost. Capping at 1.5 keeps the
    // image clearly sharper than 1.0 (visually negligible blur on text/edges) but
    // halves fragment cost vs DPR 2.
    //
    // @spec docs/superpowers/specs/2026-04-18-fps-perf-fixes-design.md (v4)
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5))
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = THREE.PCFShadowMap

    window.addEventListener('resize', this.onResize)
  }

  mount(container: HTMLElement): void {
    this.container = container
    const { clientWidth, clientHeight } = container
    this.renderer.setSize(clientWidth, clientHeight)
    container.appendChild(this.renderer.domElement)
  }

  /** Connect a vehicle camera for rendering. Pass null to clear. */
  setCamera(camera: VehicleCamera | null): void {
    this.vehicleCamera = camera
    if (camera && this.container) {
      const { clientWidth, clientHeight } = this.container
      camera.resize(clientWidth, clientHeight)
    }
  }

  /** Set a raw perspective camera for rendering (FPS mode). Pass null to clear. */
  setActiveCamera(camera: THREE.PerspectiveCamera | null): void {
    this.directCamera = camera
    if (camera && this.container) {
      const { clientWidth, clientHeight } = this.container
      camera.aspect = clientWidth / clientHeight
      camera.updateProjectionMatrix()
    }
  }

  /** Returns whichever camera is currently active (direct or vehicle). */
  get activeCamera(): THREE.PerspectiveCamera | null {
    return this.directCamera ?? this.vehicleCamera?.camera ?? null
  }

  addToScene(object: THREE.Object3D): void {
    this.scene.add(object)
  }

  removeFromScene(object: THREE.Object3D): void {
    this.scene.remove(object)
  }

  tick(_dt: number): void {
    if (this.renderOverride) {
      this.renderOverride()
      return
    }
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
    this.onResizeCallback?.(clientWidth, clientHeight)
  }
}
