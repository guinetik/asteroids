/**
 * Standalone Three.js completion poster for the habitat back wall.
 *
 * The poster uses the authored completion art and only reveals its image after
 * every achievement-backed solar poster has unlocked.
 *
 * @author guinetik
 * @date 2026-05-07
 * @spec docs/superpowers/specs/2026-04-06-habitat-interior-design.md
 */
import * as THREE from 'three'
import {
  isSolarCompletionPosterUnlocked,
  SOLAR_COMPLETION_POSTER,
  SOLAR_POSTER_CATALOG,
  type SolarCompletionPosterDefinition,
  type SolarPosterDefinition,
} from '@/lib/posters/solarPosterUnlocks'

/** Height of the large completion image in local wall units. */
const COMPLETION_POSTER_HEIGHT = 1.92
/** Width-to-height ratio for the in-cabin completion poster frame. */
const COMPLETION_POSTER_ASPECT_RATIO = 1 / 2
/** Width of the large completion image in local wall units. */
const COMPLETION_POSTER_WIDTH = COMPLETION_POSTER_HEIGHT * COMPLETION_POSTER_ASPECT_RATIO
/** Width of the frame border around the completion image plane. */
const COMPLETION_FRAME_BORDER = 0.075
/** Depth of the completion frame and backing geometry. */
const COMPLETION_FRAME_DEPTH = 0.055
/** Slight forward offset to prevent image/backing z-fighting. */
const COMPLETION_IMAGE_Z_OFFSET = 0.033
/** Slight backing offset to sit behind the image plane. */
const COMPLETION_BACKING_Z_OFFSET = -0.01
/** Dark metal frame color. */
const COMPLETION_FRAME_COLOR = 0xb0b8c0
/** Dim backing visible before the completion poster unlocks. */
const COMPLETION_BACKING_COLOR = 0x121820
/** Roughness used by completion poster wall metal materials. */
const COMPLETION_ROUGHNESS = 0.62
/** Metalness used by the completion poster frame. */
const COMPLETION_FRAME_METALNESS = 0.42
/** Texture anisotropy requested for angled poster viewing. */
const COMPLETION_TEXTURE_ANISOTROPY = 4
/** Completion poster slot backer opacity before the image is visible. */
const COMPLETION_BACKING_OPACITY = 0.72
/** Default texture repeat value before fitting the loaded completion texture. */
const FULL_TEXTURE_REPEAT = 1
/** Default texture offset value before fitting the loaded completion texture. */
const NO_TEXTURE_OFFSET = 0

/**
 * Optional construction settings for the standalone completion poster.
 */
export interface HabitatCompletionPosterOptions {
  /** Completion poster definition. Defaults to the authored solar completion poster. */
  readonly poster?: SolarCompletionPosterDefinition
  /** Poster catalog used to decide when every achievement-backed poster is unlocked. */
  readonly posters?: readonly SolarPosterDefinition[]
  /** Achievement ids that should unlock the completion poster image. */
  readonly unlockedAchievementIds?: readonly string[]
}

/**
 * Reusable framed completion poster object.
 */
export class HabitatCompletionPoster {
  /** Root object to add to a scene. Local +Z is the viewing side. */
  readonly group = new THREE.Group()

  private readonly poster: SolarCompletionPosterDefinition
  private readonly posters: readonly SolarPosterDefinition[]
  private readonly image: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>
  private readonly backing: THREE.Mesh<THREE.BoxGeometry, THREE.MeshStandardMaterial>
  private readonly geometries = new Set<THREE.BufferGeometry>()
  private readonly materials = new Set<THREE.Material>()
  private readonly textures = new Set<THREE.Texture>()
  private readonly textureLoader = new THREE.TextureLoader()

  /**
   * Build the completion poster frame and apply initial visibility.
   *
   * @param options - Optional poster catalog, completion art, and unlocked achievement state.
   */
  constructor(options: HabitatCompletionPosterOptions = {}) {
    this.poster = options.poster ?? SOLAR_COMPLETION_POSTER
    this.posters = options.posters ?? SOLAR_POSTER_CATALOG
    this.group.name = 'habitatCompletionPoster'
    this.backing = this.createBacking()
    this.image = this.createImage()
    this.group.add(this.backing, this.createFrame(), this.image)
    this.setUnlockedAchievementIds(options.unlockedAchievementIds ?? [])
  }

  /**
   * Load the completion poster texture into its image plane.
   *
   * @returns Promise that settles after the authored completion image has loaded.
   */
  async load(): Promise<void> {
    const texture = await this.textureLoader.loadAsync(this.poster.assetPath)
    texture.colorSpace = THREE.SRGBColorSpace
    texture.anisotropy = COMPLETION_TEXTURE_ANISOTROPY
    fitTextureToCompletionFrame(texture, COMPLETION_POSTER_ASPECT_RATIO)
    this.image.material.map = texture
    this.image.material.needsUpdate = true
    this.textures.add(texture)
  }

  /**
   * Update completion image visibility from persisted achievement ids.
   *
   * @param unlockedAchievementIds - Current unlocked achievement ids from the map UI.
   */
  setUnlockedAchievementIds(unlockedAchievementIds: readonly string[]): void {
    this.image.visible = isSolarCompletionPosterUnlocked(unlockedAchievementIds, this.posters)
    this.backing.visible = true
  }

  /**
   * Release all geometries, materials, and textures owned by this poster.
   */
  dispose(): void {
    for (const texture of this.textures) texture.dispose()
    for (const material of this.materials) material.dispose()
    for (const geometry of this.geometries) geometry.dispose()
    this.textures.clear()
    this.materials.clear()
    this.geometries.clear()
    this.group.clear()
  }

  private createBacking(): THREE.Mesh<THREE.BoxGeometry, THREE.MeshStandardMaterial> {
    const geometry = new THREE.BoxGeometry(
      COMPLETION_POSTER_WIDTH + COMPLETION_FRAME_BORDER * 2,
      COMPLETION_POSTER_HEIGHT + COMPLETION_FRAME_BORDER * 2,
      COMPLETION_FRAME_DEPTH,
    )
    const material = new THREE.MeshStandardMaterial({
      color: COMPLETION_BACKING_COLOR,
      roughness: COMPLETION_ROUGHNESS,
      transparent: true,
      opacity: COMPLETION_BACKING_OPACITY,
    })
    const mesh = new THREE.Mesh(geometry, material)
    mesh.name = `habitatCompletionPosterBacking.${this.poster.id}`
    mesh.position.z = COMPLETION_BACKING_Z_OFFSET
    this.geometries.add(geometry)
    this.materials.add(material)
    return mesh
  }

  private createFrame(): THREE.Group {
    const frame = new THREE.Group()
    frame.name = `habitatCompletionPosterFrame.${this.poster.id}`

    const horizontalGeometry = new THREE.BoxGeometry(
      COMPLETION_POSTER_WIDTH + COMPLETION_FRAME_BORDER * 2,
      COMPLETION_FRAME_BORDER,
      COMPLETION_FRAME_DEPTH,
    )
    const verticalGeometry = new THREE.BoxGeometry(
      COMPLETION_FRAME_BORDER,
      COMPLETION_POSTER_HEIGHT,
      COMPLETION_FRAME_DEPTH,
    )
    const material = new THREE.MeshStandardMaterial({
      color: COMPLETION_FRAME_COLOR,
      metalness: COMPLETION_FRAME_METALNESS,
      roughness: COMPLETION_ROUGHNESS,
    })

    const top = new THREE.Mesh(horizontalGeometry, material)
    const bottom = new THREE.Mesh(horizontalGeometry, material)
    const left = new THREE.Mesh(verticalGeometry, material)
    const right = new THREE.Mesh(verticalGeometry, material)
    top.position.y = COMPLETION_POSTER_HEIGHT / 2 + COMPLETION_FRAME_BORDER / 2
    bottom.position.y = -COMPLETION_POSTER_HEIGHT / 2 - COMPLETION_FRAME_BORDER / 2
    left.position.x = -COMPLETION_POSTER_WIDTH / 2 - COMPLETION_FRAME_BORDER / 2
    right.position.x = COMPLETION_POSTER_WIDTH / 2 + COMPLETION_FRAME_BORDER / 2
    frame.add(top, bottom, left, right)

    this.geometries.add(horizontalGeometry)
    this.geometries.add(verticalGeometry)
    this.materials.add(material)
    return frame
  }

  private createImage(): THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial> {
    const geometry = new THREE.PlaneGeometry(COMPLETION_POSTER_WIDTH, COMPLETION_POSTER_HEIGHT)
    const material = new THREE.MeshBasicMaterial({ toneMapped: false })
    const mesh = new THREE.Mesh(geometry, material)
    mesh.name = `habitatCompletionPosterImage.${this.poster.id}`
    mesh.position.z = COMPLETION_IMAGE_Z_OFFSET
    mesh.visible = false
    this.geometries.add(geometry)
    this.materials.add(material)
    return mesh
  }
}

/**
 * Crop loaded completion art to fill the authored frame ratio without stretching.
 *
 * @param texture - Loaded poster texture.
 * @param frameAspectRatio - Target width divided by height, e.g. `0.5`.
 */
function fitTextureToCompletionFrame(texture: THREE.Texture, frameAspectRatio: number): void {
  const image = texture.image as { width?: number; height?: number } | undefined
  const imageWidth = image?.width ?? 0
  const imageHeight = image?.height ?? 0
  if (imageWidth <= 0 || imageHeight <= 0) return

  const imageAspectRatio = imageWidth / imageHeight
  texture.repeat.set(FULL_TEXTURE_REPEAT, FULL_TEXTURE_REPEAT)
  texture.offset.set(NO_TEXTURE_OFFSET, NO_TEXTURE_OFFSET)

  if (imageAspectRatio > frameAspectRatio) {
    const repeatX = frameAspectRatio / imageAspectRatio
    texture.repeat.x = repeatX
    texture.offset.x = (FULL_TEXTURE_REPEAT - repeatX) / 2
    return
  }

  const repeatY = imageAspectRatio / frameAspectRatio
  texture.repeat.y = repeatY
  texture.offset.y = (FULL_TEXTURE_REPEAT - repeatY) / 2
}
