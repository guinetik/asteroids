/**
 * Large framed achievement poster (completion-poster footprint) for flat bulkheads or end caps.
 *
 * Local +Z faces into the cabin; orient the group so +Z points toward the room center.
 *
 * @author guinetik
 * @date 2026-05-08
 * @spec docs/superpowers/specs/2026-04-06-habitat-interior-design.md
 */
import * as THREE from 'three'
import { isSolarPosterUnlocked, type SolarPosterDefinition } from '@/lib/posters/solarPosterUnlocks'

/** Height of the large image in local wall units (same footprint as the habitat completion poster). */
const LARGE_POSTER_HEIGHT = 1.92
/** Width-to-height ratio (matches completion poster). */
const LARGE_POSTER_ASPECT_RATIO = 1 / 2
/** Width of the large image in local wall units. */
const LARGE_POSTER_WIDTH = LARGE_POSTER_HEIGHT * LARGE_POSTER_ASPECT_RATIO
/** Width of the frame border. */
const LARGE_FRAME_BORDER = 0.075
/** Depth of the frame and backing. */
const LARGE_FRAME_DEPTH = 0.055
/** Forward offset for the image plane. */
const LARGE_IMAGE_Z_OFFSET = 0.033
/** Backing offset behind the image. */
const LARGE_BACKING_Z_OFFSET = -0.01
/** Frame metal colour. */
const LARGE_FRAME_COLOR = 0xb0b8c0
/** Backing colour. */
const LARGE_BACKING_COLOR = 0x121820
const LARGE_ROUGHNESS = 0.62
const LARGE_FRAME_METALNESS = 0.42
const LARGE_TEXTURE_ANISOTROPY = 4
const LARGE_BACKING_OPACITY = 0.72
const FULL_TEXTURE_REPEAT = 1
const NO_TEXTURE_OFFSET = 0

/**
 * Construction settings for a single large achievement poster.
 */
export interface HabitatLargeAchievementPosterOptions {
  /** Poster row (asset path + single achievement gate). */
  readonly poster: SolarPosterDefinition
  /** Initial unlocked achievement ids. */
  readonly unlockedAchievementIds?: readonly string[]
}

/**
 * One completion-sized framed poster driven by a single achievement.
 */
export class HabitatLargeAchievementPoster {
  /** Root group; local +Z should face the cabin interior. */
  readonly group = new THREE.Group()

  private readonly poster: SolarPosterDefinition
  private readonly image: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>
  private readonly backing: THREE.Mesh<THREE.BoxGeometry, THREE.MeshStandardMaterial>
  private readonly geometries = new Set<THREE.BufferGeometry>()
  private readonly materials = new Set<THREE.Material>()
  private readonly textures = new Set<THREE.Texture>()
  private readonly textureLoader = new THREE.TextureLoader()

  /**
   * @param options - Poster definition and optional initial unlock ids.
   */
  constructor(options: HabitatLargeAchievementPosterOptions) {
    this.poster = options.poster
    this.group.name = `habitatLargeAchievementPoster.${this.poster.id}`
    this.backing = this.createBacking()
    this.image = this.createImage()
    this.group.add(this.backing, this.createFrame(), this.image)
    this.setUnlockedAchievementIds(options.unlockedAchievementIds ?? [])
  }

  /**
   * Load the poster texture.
   */
  async load(): Promise<void> {
    const texture = await this.textureLoader.loadAsync(this.poster.assetPath)
    texture.colorSpace = THREE.SRGBColorSpace
    texture.anisotropy = LARGE_TEXTURE_ANISOTROPY
    fitTextureToLargeFrame(texture, LARGE_POSTER_ASPECT_RATIO)
    this.image.material.map = texture
    this.image.material.needsUpdate = true
    this.textures.add(texture)
  }

  /**
   * @param unlockedAchievementIds - Persisted achievement ids.
   */
  setUnlockedAchievementIds(unlockedAchievementIds: readonly string[]): void {
    this.image.visible = isSolarPosterUnlocked(this.poster, unlockedAchievementIds)
    this.backing.visible = true
  }

  /**
   * Release GPU resources.
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
      LARGE_POSTER_WIDTH + LARGE_FRAME_BORDER * 2,
      LARGE_POSTER_HEIGHT + LARGE_FRAME_BORDER * 2,
      LARGE_FRAME_DEPTH,
    )
    const material = new THREE.MeshStandardMaterial({
      color: LARGE_BACKING_COLOR,
      roughness: LARGE_ROUGHNESS,
      transparent: true,
      opacity: LARGE_BACKING_OPACITY,
    })
    const mesh = new THREE.Mesh(geometry, material)
    mesh.name = `habitatLargePosterBacking.${this.poster.id}`
    mesh.position.z = LARGE_BACKING_Z_OFFSET
    this.geometries.add(geometry)
    this.materials.add(material)
    return mesh
  }

  private createFrame(): THREE.Group {
    const frame = new THREE.Group()
    frame.name = `habitatLargePosterFrame.${this.poster.id}`

    const horizontalGeometry = new THREE.BoxGeometry(
      LARGE_POSTER_WIDTH + LARGE_FRAME_BORDER * 2,
      LARGE_FRAME_BORDER,
      LARGE_FRAME_DEPTH,
    )
    const verticalGeometry = new THREE.BoxGeometry(
      LARGE_FRAME_BORDER,
      LARGE_POSTER_HEIGHT,
      LARGE_FRAME_DEPTH,
    )
    const material = new THREE.MeshStandardMaterial({
      color: LARGE_FRAME_COLOR,
      metalness: LARGE_FRAME_METALNESS,
      roughness: LARGE_ROUGHNESS,
    })

    const top = new THREE.Mesh(horizontalGeometry, material)
    const bottom = new THREE.Mesh(horizontalGeometry, material)
    const left = new THREE.Mesh(verticalGeometry, material)
    const right = new THREE.Mesh(verticalGeometry, material)
    top.position.y = LARGE_POSTER_HEIGHT / 2 + LARGE_FRAME_BORDER / 2
    bottom.position.y = -LARGE_POSTER_HEIGHT / 2 - LARGE_FRAME_BORDER / 2
    left.position.x = -LARGE_POSTER_WIDTH / 2 - LARGE_FRAME_BORDER / 2
    right.position.x = LARGE_POSTER_WIDTH / 2 + LARGE_FRAME_BORDER / 2
    frame.add(top, bottom, left, right)

    this.geometries.add(horizontalGeometry)
    this.geometries.add(verticalGeometry)
    this.materials.add(material)
    return frame
  }

  private createImage(): THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial> {
    const geometry = new THREE.PlaneGeometry(LARGE_POSTER_WIDTH, LARGE_POSTER_HEIGHT)
    const material = new THREE.MeshBasicMaterial({ toneMapped: false })
    const mesh = new THREE.Mesh(geometry, material)
    mesh.name = `habitatLargePosterImage.${this.poster.id}`
    mesh.position.z = LARGE_IMAGE_Z_OFFSET
    mesh.visible = false
    this.geometries.add(geometry)
    this.materials.add(material)
    return mesh
  }
}

/**
 * Crop loaded art to fill the frame aspect ratio without stretching.
 *
 * @param texture - Loaded texture.
 * @param frameAspectRatio - Width ÷ height (e.g. `0.5`).
 */
function fitTextureToLargeFrame(texture: THREE.Texture, frameAspectRatio: number): void {
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
