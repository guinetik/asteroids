/**
 * Standalone Three.js poster wall for habitat achievement posters.
 *
 * Builds framed solar-body poster slots in fixed Sun-outward order. Locked slots are fully hidden
 * (no empty frames); unlocked slots show frame, backing, and art. The wall is intentionally
 * unplaced: local +Z is the viewing side, so habitat integration can position and rotate the
 * returned group wherever the wall belongs.
 *
 * @author guinetik
 * @date 2026-05-07
 * @spec docs/superpowers/specs/2026-04-06-habitat-interior-design.md
 */
import * as THREE from 'three'
import {
  getSolarPosterVisibility,
  SOLAR_POSTER_CATALOG,
  type SolarPosterDefinition,
  type SolarPosterId,
} from '@/lib/posters/solarPosterUnlocks'

/** Height of each poster image in local wall units. */
const POSTER_HEIGHT = 1.08
/** Width-to-height ratio for the in-cabin poster frames. */
const POSTER_ASPECT_RATIO = 1 / 2
/** Width of each poster image in local wall units. */
const POSTER_WIDTH = POSTER_HEIGHT * POSTER_ASPECT_RATIO
/** Width of the frame border around the image plane. */
const FRAME_BORDER = 0.055
/** Depth of the frame and backing geometry. */
const FRAME_DEPTH = 0.045
/** Gap between neighboring poster slots. */
const POSTER_GAP = 0.2
/** Number of poster slots in the top row. */
const TOP_ROW_SLOT_COUNT = 6
/** Slight forward offset to prevent image/backing z-fighting. */
const IMAGE_Z_OFFSET = 0.027
/** Slight backing offset to sit behind the image plane. */
const BACKING_Z_OFFSET = -0.008
/** Vertical distance between poster row centers. */
const ROW_GAP = 1.48
/** Dark metal frame color. */
const FRAME_COLOR = 0xb0b8c0
/** Dim backing colour for unlocked poster slots (locked slots hide entirely). */
const BACKING_COLOR = 0x121820
/** Roughness used by poster wall metal materials. */
const POSTER_WALL_ROUGHNESS = 0.62
/** Metalness used by the poster frames. */
const FRAME_METALNESS = 0.42
/** Texture anisotropy requested for angled poster viewing. */
const POSTER_TEXTURE_ANISOTROPY = 4
/** Poster slot backer opacity when the slot is visible (locked slots are hidden entirely). */
const BACKING_OPACITY = 0.72
/** Default texture repeat value before fitting a loaded poster texture. */
const FULL_TEXTURE_REPEAT = 1
/** Default texture offset value before fitting a loaded poster texture. */
const NO_TEXTURE_OFFSET = 0

/**
 * Optional construction settings for the standalone poster wall.
 */
export interface HabitatPosterWallOptions {
  /** Poster definitions in fixed display order. Defaults to the solar poster catalog. */
  readonly posters?: readonly SolarPosterDefinition[]
  /** Achievement ids that should unlock matching poster image planes. */
  readonly unlockedAchievementIds?: readonly string[]
}

/**
 * Per-slot objects; locked slots hide {@link PosterSlotMeshes.root} (frame + backing + image).
 */
interface PosterSlotMeshes {
  /** Slot root — hidden until this poster unlocks (wall layout keeps fixed positions). */
  readonly root: THREE.Group
  /** Textured poster image plane; gated with {@link root}. */
  readonly image: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>
  /** Backing plate behind the image; gated with {@link root}. */
  readonly backing: THREE.Mesh<THREE.BoxGeometry, THREE.MeshStandardMaterial>
}

/**
 * Reusable framed poster wall object.
 */
export class HabitatPosterWall {
  /** Root object to add to a scene. Local +Z is the viewing side. */
  readonly group = new THREE.Group()

  private readonly posters: readonly SolarPosterDefinition[]
  private readonly slots = new Map<SolarPosterId, PosterSlotMeshes>()
  private readonly geometries = new Set<THREE.BufferGeometry>()
  private readonly materials = new Set<THREE.Material>()
  private readonly textures = new Set<THREE.Texture>()
  private readonly textureLoader = new THREE.TextureLoader()

  /**
   * Build poster frames and apply initial visibility.
   *
   * @param options - Optional poster catalog and unlocked achievement state.
   */
  constructor(options: HabitatPosterWallOptions = {}) {
    this.posters = options.posters ?? SOLAR_POSTER_CATALOG
    this.group.name = 'habitatPosterWall'
    this.buildWall()
    this.setUnlockedAchievementIds(options.unlockedAchievementIds ?? [])
  }

  /**
   * Load poster textures into their image planes.
   *
   * @returns Promise that settles after all currently authored poster images have loaded.
   */
  async load(): Promise<void> {
    await Promise.all(
      this.posters.map(async (poster) => {
        const slot = this.slots.get(poster.id)
        if (!slot) return
        const texture = await this.textureLoader.loadAsync(poster.assetPath)
        texture.colorSpace = THREE.SRGBColorSpace
        texture.anisotropy = POSTER_TEXTURE_ANISOTROPY
        fitTextureToPosterFrame(texture, POSTER_ASPECT_RATIO)
        slot.image.material.map = texture
        slot.image.material.needsUpdate = true
        this.textures.add(texture)
      }),
    )
  }

  /**
   * Show or hide each framed slot entirely from achievement ids (no empty frames when locked).
   *
   * @param unlockedAchievementIds - Persisted achievement ids, e.g. achievement store state.
   */
  setUnlockedAchievementIds(unlockedAchievementIds: readonly string[]): void {
    const visibility = getSolarPosterVisibility(unlockedAchievementIds, this.posters)
    for (const row of visibility) {
      const slot = this.slots.get(row.poster.id)
      if (!slot) continue
      slot.root.visible = row.unlocked
      slot.image.visible = row.unlocked
      slot.backing.visible = row.unlocked
    }
  }

  /**
   * Show or hide each framed slot entirely by poster id (testing / tooling).
   *
   * @param unlockedPosterIds - Poster ids whose slots should be visible.
   */
  setUnlockedPosterIds(unlockedPosterIds: readonly SolarPosterId[]): void {
    const unlocked = new Set(unlockedPosterIds)
    for (const [posterId, slot] of this.slots.entries()) {
      const show = unlocked.has(posterId)
      slot.root.visible = show
      slot.image.visible = show
      slot.backing.visible = show
    }
  }

  /**
   * Release all geometries, materials, and textures owned by this wall.
   */
  dispose(): void {
    for (const texture of this.textures) texture.dispose()
    for (const material of this.materials) material.dispose()
    for (const geometry of this.geometries) geometry.dispose()
    this.textures.clear()
    this.materials.clear()
    this.geometries.clear()
    this.slots.clear()
    this.group.clear()
  }

  private buildWall(): void {
    for (const [index, poster] of this.posters.entries()) {
      const slot = this.buildPosterSlot(poster)
      const rowIndex = index < TOP_ROW_SLOT_COUNT ? 0 : 1
      const columnIndex = rowIndex === 0 ? index : index - TOP_ROW_SLOT_COUNT
      const rowSlotCount = rowIndex === 0 ? TOP_ROW_SLOT_COUNT : this.posters.length - TOP_ROW_SLOT_COUNT
      const x = this.getColumnX(columnIndex, rowSlotCount)
      const y = rowIndex === 0 ? ROW_GAP / 2 : -ROW_GAP / 2
      slot.position.set(x, y, 0)
      this.group.add(slot)
    }
  }

  private buildPosterSlot(poster: SolarPosterDefinition): THREE.Group {
    const slot = new THREE.Group()
    slot.name = `habitatPosterSlot.${poster.id}`

    const backing = this.createBacking(poster)
    const frame = this.createFrame(poster)
    const image = this.createImage(poster)

    slot.add(backing, frame, image)
    this.slots.set(poster.id, { root: slot, image, backing })
    return slot
  }

  private createBacking(
    poster: SolarPosterDefinition,
  ): THREE.Mesh<THREE.BoxGeometry, THREE.MeshStandardMaterial> {
    const geometry = new THREE.BoxGeometry(
      POSTER_WIDTH + FRAME_BORDER * 2,
      POSTER_HEIGHT + FRAME_BORDER * 2,
      FRAME_DEPTH,
    )
    const material = new THREE.MeshStandardMaterial({
      color: BACKING_COLOR,
      roughness: POSTER_WALL_ROUGHNESS,
      transparent: true,
      opacity: BACKING_OPACITY,
    })
    const mesh = new THREE.Mesh(geometry, material)
    mesh.name = `habitatPosterBacking.${poster.id}`
    mesh.position.z = BACKING_Z_OFFSET
    this.geometries.add(geometry)
    this.materials.add(material)
    return mesh
  }

  private createFrame(poster: SolarPosterDefinition): THREE.Group {
    const frame = new THREE.Group()
    frame.name = `habitatPosterFrame.${poster.id}`

    const horizontalGeometry = new THREE.BoxGeometry(
      POSTER_WIDTH + FRAME_BORDER * 2,
      FRAME_BORDER,
      FRAME_DEPTH,
    )
    const verticalGeometry = new THREE.BoxGeometry(FRAME_BORDER, POSTER_HEIGHT, FRAME_DEPTH)
    const material = new THREE.MeshStandardMaterial({
      color: FRAME_COLOR,
      metalness: FRAME_METALNESS,
      roughness: POSTER_WALL_ROUGHNESS,
    })

    const top = new THREE.Mesh(horizontalGeometry, material)
    const bottom = new THREE.Mesh(horizontalGeometry, material)
    const left = new THREE.Mesh(verticalGeometry, material)
    const right = new THREE.Mesh(verticalGeometry, material)
    top.position.y = POSTER_HEIGHT / 2 + FRAME_BORDER / 2
    bottom.position.y = -POSTER_HEIGHT / 2 - FRAME_BORDER / 2
    left.position.x = -POSTER_WIDTH / 2 - FRAME_BORDER / 2
    right.position.x = POSTER_WIDTH / 2 + FRAME_BORDER / 2
    frame.add(top, bottom, left, right)

    this.geometries.add(horizontalGeometry)
    this.geometries.add(verticalGeometry)
    this.materials.add(material)
    return frame
  }

  private createImage(
    poster: SolarPosterDefinition,
  ): THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial> {
    const geometry = new THREE.PlaneGeometry(POSTER_WIDTH, POSTER_HEIGHT)
    const material = new THREE.MeshBasicMaterial({ toneMapped: false })
    const mesh = new THREE.Mesh(geometry, material)
    mesh.name = `habitatPosterImage.${poster.id}`
    mesh.position.z = IMAGE_Z_OFFSET
    mesh.visible = false
    this.geometries.add(geometry)
    this.materials.add(material)
    return mesh
  }

  private getColumnX(columnIndex: number, rowSlotCount: number): number {
    const slotStride = POSTER_WIDTH + FRAME_BORDER * 2 + POSTER_GAP
    return (columnIndex - (rowSlotCount - 1) / 2) * slotStride
  }
}

/**
 * Crop loaded poster art to fill the authored frame ratio without stretching.
 *
 * @param texture - Loaded poster texture.
 * @param frameAspectRatio - Target width divided by height, e.g. `0.5`.
 */
function fitTextureToPosterFrame(texture: THREE.Texture, frameAspectRatio: number): void {
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
