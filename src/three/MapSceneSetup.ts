/**
 * Creates the Three.js environment for the map view.
 *
 * Sets up renderer with ACES tone mapping, layered starlight fill lighting,
 * and damped orbital camera controls. No bloom — keeps stars crisp and saves GPU.
 * Self-contained — does not depend on SceneManager.
 *
 * @author guinetik
 * @date 2026-04-04
 * @spec docs/superpowers/specs/2026-04-04-map-view-design.md
 */
import * as THREE from 'three'
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'

// --- Scene constants ---

const BACKGROUND_COLOR = 0x000000
const CAMERA_FOV = 50
const CAMERA_NEAR = 0.1
const CAMERA_FAR = 50000
const CAMERA_INITIAL_POSITION_Y = 3
const CAMERA_INITIAL_POSITION_Z = 20
const TONE_MAPPING_EXPOSURE = 1.35

// --- Lighting ---

const AMBIENT_COLOR = 0x2a3858
const AMBIENT_INTENSITY = 0.55
const HEMISPHERE_SKY_COLOR = 0x7f97c8
const HEMISPHERE_GROUND_COLOR = 0x1f160f
const HEMISPHERE_INTENSITY = 0.6
const FILL_LIGHT_COLOR = 0xa9bfe6
const FILL_LIGHT_INTENSITY = 0.35
const CAMERA_LIGHT_COLOR = 0xcad4ff
const CAMERA_LIGHT_INTENSITY = 0.28

// --- Controls ---

const CONTROLS_DAMPING_FACTOR = 0.03
const CONTROLS_MIN_DISTANCE = 2
const CONTROLS_MAX_DISTANCE = 100
const CONTROLS_MAX_POLAR_ANGLE = Math.PI * 0.85
const CONTROLS_MIN_POLAR_ANGLE = Math.PI * 0.05
const CONTROLS_ZOOM_SPEED = 0.5
const CONTROLS_ROTATE_SPEED = 0.4

/** All objects created by the map scene setup. */
export interface MapSceneObjects {
  scene: THREE.Scene
  camera: THREE.PerspectiveCamera
  cameraLight: THREE.PointLight
  renderer: THREE.WebGLRenderer
  composer: EffectComposer
  controls: OrbitControls
}

/**
 * Create the full Three.js environment for the map view.
 *
 * @param canvas - The canvas element to render into
 * @returns All scene objects for the map view
 */
export function createMapScene(canvas: HTMLCanvasElement): MapSceneObjects {
  // Renderer
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false })
  renderer.setPixelRatio(window.devicePixelRatio)
  renderer.setSize(window.innerWidth, window.innerHeight)
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = TONE_MAPPING_EXPOSURE

  // Scene
  const scene = new THREE.Scene()
  scene.background = new THREE.Color(BACKGROUND_COLOR)

  // Layered starlight fill
  scene.add(new THREE.AmbientLight(AMBIENT_COLOR, AMBIENT_INTENSITY))
  scene.add(new THREE.HemisphereLight(HEMISPHERE_SKY_COLOR, HEMISPHERE_GROUND_COLOR, HEMISPHERE_INTENSITY))

  const fillLight = new THREE.DirectionalLight(FILL_LIGHT_COLOR, FILL_LIGHT_INTENSITY)
  fillLight.position.set(-1.5, 0.8, -1.0)
  scene.add(fillLight)

  // Camera
  const camera = new THREE.PerspectiveCamera(
    CAMERA_FOV,
    window.innerWidth / window.innerHeight,
    CAMERA_NEAR,
    CAMERA_FAR,
  )
  camera.position.set(0, CAMERA_INITIAL_POSITION_Y, CAMERA_INITIAL_POSITION_Z)
  camera.lookAt(0, 0, 0)

  // Soft camera fill light
  const cameraLight = new THREE.PointLight(CAMERA_LIGHT_COLOR, CAMERA_LIGHT_INTENSITY, 0)
  cameraLight.decay = 1.5
  camera.add(cameraLight)
  scene.add(camera)

  // Post-processing (bloom intentionally omitted — see StarFieldController / map stars)
  const composer = new EffectComposer(renderer)
  composer.addPass(new RenderPass(scene, camera))

  // OrbitControls
  const controls = new OrbitControls(camera, canvas)
  controls.enableDamping = true
  controls.dampingFactor = CONTROLS_DAMPING_FACTOR
  controls.minDistance = CONTROLS_MIN_DISTANCE
  controls.maxDistance = CONTROLS_MAX_DISTANCE
  controls.maxPolarAngle = CONTROLS_MAX_POLAR_ANGLE
  controls.minPolarAngle = CONTROLS_MIN_POLAR_ANGLE
  controls.zoomSpeed = CONTROLS_ZOOM_SPEED
  controls.rotateSpeed = CONTROLS_ROTATE_SPEED

  return { scene, camera, cameraLight, renderer, composer, controls }
}

/**
 * Handle browser resize for the map scene.
 *
 * @param objects - The map scene objects to resize
 */
export function handleMapResize(objects: MapSceneObjects): void {
  const { camera, renderer, composer } = objects
  camera.aspect = window.innerWidth / window.innerHeight
  camera.updateProjectionMatrix()
  renderer.setSize(window.innerWidth, window.innerHeight)
  composer.setSize(window.innerWidth, window.innerHeight)
}
