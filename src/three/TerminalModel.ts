/**
 * Survey terminal kiosk rendered at flat zone centers for survey objectives.
 * Player interacts in EVA to start or deliver scientific mission telemetry.
 *
 * @author guinetik
 * @date 2026-04-07
 * @spec docs/superpowers/specs/2026-04-07-survey-objective-design.md
 */
import * as THREE from 'three'
import type { WorldCollider } from '@/lib/physics/worldCollision'

/** Terminal body width in world units on the X axis. */
const TERMINAL_WIDTH = 2.4

/** Terminal body height in world units on the Y axis. */
export const TERMINAL_BODY_HEIGHT = 6.45

/** Terminal body depth in world units on the Z axis. */
const TERMINAL_DEPTH = 0.75

/** Pedestal width in world units on the X axis. */
const TERMINAL_BASE_WIDTH = 3.05

/** Pedestal height in world units on the Y axis. */
const TERMINAL_BASE_HEIGHT = 0.34

/** Pedestal depth in world units on the Z axis. */
const TERMINAL_BASE_DEPTH = 1.35

/** Screen panel width in world units on the X axis. */
const SCREEN_WIDTH = 1.52

/** Screen panel height in world units on the Y axis. */
const SCREEN_HEIGHT = 1.72

/** Screen frame width in world units on the X axis. */
const SCREEN_FRAME_WIDTH = 1.78

/** Screen frame height in world units on the Y axis. */
const SCREEN_FRAME_HEIGHT = 1.98

/** Screen frame depth in world units on the Z axis. */
const SCREEN_FRAME_DEPTH = 0.1

/** Status lamp strip width in world units on the X axis. */
const STATUS_STRIP_WIDTH = 1.55

/** Status lamp strip height in world units on the Y axis. */
const STATUS_STRIP_HEIGHT = 0.16

/** Decorative side rail width in world units on the X axis. */
const SIDE_RAIL_WIDTH = 0.12

/** Decorative side rail height in world units on the Y axis. */
const SIDE_RAIL_HEIGHT = 5.75

/** Decorative side rail depth in world units on the Z axis. */
const SIDE_RAIL_DEPTH = 0.12

/** Side rail horizontal offset from terminal center. */
const SIDE_RAIL_X_OFFSET = 1.08

/** Vertical screen center as a fraction of terminal body height. */
const SCREEN_CENTER_HEIGHT_FRACTION = 0.69

/** Screen surface offset in front of the body. */
const SCREEN_FRONT_OFFSET = 0.02

/** Frame surface offset in front of the body. */
const FRAME_FRONT_OFFSET = 0.005

/** Status strip vertical offset below the screen center. */
const STATUS_STRIP_Y_OFFSET = 1.62

/** Status strip surface offset in front of the body. */
const STATUS_STRIP_FRONT_OFFSET = 0.035

/** Cycling glyph offset in front of the emissive screen plane. */
const GLYPH_FRONT_OFFSET = 0.06

/** Outer radius of the central terminal glyph. */
const GLYPH_OUTER_RADIUS = 0.46

/** Inner radius used by the central terminal glyph spokes. */
const GLYPH_INNER_RADIUS = 0.17

/** Radius of the small side ticks that make the glyph read like alien UI. */
const GLYPH_TICK_RADIUS = 0.3

/** Number of segments used for the outer glyph ring. */
const GLYPH_RING_SEGMENTS = 48

/** Rounded side count for the tiny cylindrical glyph strokes. */
const GLYPH_STROKE_RADIAL_SEGMENTS = 8

/** Stroke thickness for terminal screen symbols in world units. */
const GLYPH_STROKE_RADIUS = 0.035

/** Number of points consumed by each glyph stroke segment. */
const GLYPH_SEGMENT_POINT_COUNT = 2

/** Seconds each screen symbol remains visible before the terminal cycles to the next one. */
const GLYPH_CYCLE_SECONDS = 0.75

/** Matte body color — dark graphite composite. */
const TERMINAL_COLOR = 0x151b22

/** Pedestal color — slightly darker graphite. */
const BASE_COLOR = 0x0d1117

/** Screen frame color — worn black alloy. */
const FRAME_COLOR = 0x222831

/** Emissive screen color — teal glow on front face. */
const SCREEN_COLOR = 0x00ffcc

/** High-contrast violet ink used for the active computer glyphs. */
const GLYPH_COLOR = 0x1b0030

/** Dark display glass albedo color. */
const SCREEN_GLASS_COLOR = 0x031412

/** Screen emissive intensity. */
const SCREEN_INTENSITY = 0.95

/** Display glass metalness: a dielectric screen should not mirror the environment. */
const SCREEN_METALNESS = 0

/** Display glass roughness softens the emissive panel under scene lighting. */
const SCREEN_ROUGHNESS = 0.72

/** Status strip color used for the active telemetry lamp. */
const STATUS_STRIP_COLOR = 0x66ffee

/** Status strip opacity keeps the lamp readable without overpowering the display. */
const STATUS_STRIP_OPACITY = 0.78

/** Screen glyph opacity: fully opaque so symbols cut through the emissive panel. */
const GLYPH_OPACITY = 1

/** Matte material roughness used by the composite shell. */
const MATTE_ROUGHNESS = 0.9

/** Low shell metalness keeps the terminal from reflecting like polished metal. */
const BODY_METALNESS = 0.04

/** Slightly higher frame metalness for a hard but non-glossy bezel. */
const FRAME_METALNESS = 0.18

/** Rough frame finish so environmental highlights stay soft. */
const FRAME_ROUGHNESS = 0.82

/** Interaction range — EVA player must be within this distance (world units). */
export const TERMINAL_INTERACT_RANGE = 8

/** Collider height includes the base plus upright kiosk body. */
const TERMINAL_COLLIDER_HEIGHT = TERMINAL_BASE_HEIGHT + TERMINAL_BODY_HEIGHT

/** Build a flat torus mesh for a screen glyph ring. */
function createGlyphRingMesh(radius: number, material: THREE.MeshBasicMaterial): THREE.Mesh {
  return new THREE.Mesh(
    new THREE.TorusGeometry(
      radius,
      GLYPH_STROKE_RADIUS,
      GLYPH_STROKE_RADIAL_SEGMENTS,
      GLYPH_RING_SEGMENTS,
    ),
    material,
  )
}

/** Build a cylindrical stroke between two local-space glyph points. */
function createGlyphStrokeMesh(
  start: THREE.Vector3,
  end: THREE.Vector3,
  material: THREE.MeshBasicMaterial,
): THREE.Mesh {
  const dx = end.x - start.x
  const dy = end.y - start.y
  const length = Math.hypot(dx, dy)
  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(
      GLYPH_STROKE_RADIUS,
      GLYPH_STROKE_RADIUS,
      length,
      GLYPH_STROKE_RADIAL_SEGMENTS,
    ),
    material,
  )
  mesh.position.set((start.x + end.x) / 2, (start.y + end.y) / 2, 0)
  mesh.rotation.z = Math.atan2(-dx, dy)
  return mesh
}

/** Add paired point strokes to a glyph symbol group. */
function addGlyphStrokes(
  symbol: THREE.Group,
  points: THREE.Vector3[],
  material: THREE.MeshBasicMaterial,
): void {
  for (let i = 0; i < points.length; i += GLYPH_SEGMENT_POINT_COUNT) {
    symbol.add(createGlyphStrokeMesh(points[i]!, points[i + 1]!, material))
  }
}

/** Build the first symbol: orbital ring with angular telemetry strokes. */
function createOrbitGlyphSymbol(material: THREE.MeshBasicMaterial): THREE.Group {
  const symbol = new THREE.Group()
  symbol.name = 'survey-terminal-glyph-symbol-orbit'
  symbol.add(createGlyphRingMesh(GLYPH_OUTER_RADIUS, material))
  const points = [
    new THREE.Vector3(-GLYPH_INNER_RADIUS, GLYPH_INNER_RADIUS, 0),
    new THREE.Vector3(0, GLYPH_OUTER_RADIUS, 0),
    new THREE.Vector3(0, GLYPH_OUTER_RADIUS, 0),
    new THREE.Vector3(GLYPH_INNER_RADIUS, GLYPH_INNER_RADIUS, 0),
    new THREE.Vector3(-GLYPH_OUTER_RADIUS, 0, 0),
    new THREE.Vector3(-GLYPH_TICK_RADIUS, 0, 0),
    new THREE.Vector3(GLYPH_TICK_RADIUS, 0, 0),
    new THREE.Vector3(GLYPH_OUTER_RADIUS, 0, 0),
    new THREE.Vector3(-GLYPH_INNER_RADIUS, -GLYPH_INNER_RADIUS, 0),
    new THREE.Vector3(GLYPH_INNER_RADIUS, -GLYPH_INNER_RADIUS, 0),
  ]
  addGlyphStrokes(symbol, points, material)
  return symbol
}

/** Build the second symbol: diamond locator with clipped inner datum bars. */
function createDiamondGlyphSymbol(material: THREE.MeshBasicMaterial): THREE.Group {
  const symbol = new THREE.Group()
  symbol.name = 'survey-terminal-glyph-symbol-diamond'
  const diamond = [
    new THREE.Vector3(0, GLYPH_OUTER_RADIUS, 0),
    new THREE.Vector3(GLYPH_OUTER_RADIUS, 0, 0),
    new THREE.Vector3(0, -GLYPH_OUTER_RADIUS, 0),
    new THREE.Vector3(-GLYPH_OUTER_RADIUS, 0, 0),
  ]
  const bars = [
    new THREE.Vector3(-GLYPH_TICK_RADIUS, GLYPH_TICK_RADIUS, 0),
    new THREE.Vector3(GLYPH_TICK_RADIUS, GLYPH_TICK_RADIUS, 0),
    new THREE.Vector3(-GLYPH_TICK_RADIUS, -GLYPH_TICK_RADIUS, 0),
    new THREE.Vector3(GLYPH_TICK_RADIUS, -GLYPH_TICK_RADIUS, 0),
    new THREE.Vector3(0, GLYPH_INNER_RADIUS, 0),
    new THREE.Vector3(0, -GLYPH_INNER_RADIUS, 0),
  ]
  for (let i = 0; i < diamond.length; i++) {
    symbol.add(createGlyphStrokeMesh(diamond[i]!, diamond[(i + 1) % diamond.length]!, material))
  }
  addGlyphStrokes(symbol, bars, material)
  return symbol
}

/** Build the third symbol: asymmetric wing-like chevrons and center post. */
function createWingGlyphSymbol(material: THREE.MeshBasicMaterial): THREE.Group {
  const symbol = new THREE.Group()
  symbol.name = 'survey-terminal-glyph-symbol-wing'
  const points = [
    new THREE.Vector3(-GLYPH_OUTER_RADIUS, GLYPH_TICK_RADIUS, 0),
    new THREE.Vector3(-GLYPH_INNER_RADIUS, 0, 0),
    new THREE.Vector3(-GLYPH_INNER_RADIUS, 0, 0),
    new THREE.Vector3(-GLYPH_OUTER_RADIUS, -GLYPH_TICK_RADIUS, 0),
    new THREE.Vector3(GLYPH_INNER_RADIUS, 0, 0),
    new THREE.Vector3(GLYPH_OUTER_RADIUS, GLYPH_TICK_RADIUS, 0),
    new THREE.Vector3(GLYPH_INNER_RADIUS, 0, 0),
    new THREE.Vector3(GLYPH_OUTER_RADIUS, -GLYPH_TICK_RADIUS, 0),
    new THREE.Vector3(0, GLYPH_OUTER_RADIUS, 0),
    new THREE.Vector3(0, -GLYPH_OUTER_RADIUS, 0),
  ]
  symbol.add(createGlyphRingMesh(GLYPH_TICK_RADIUS, material))
  addGlyphStrokes(symbol, points, material)
  return symbol
}

/**
 * A survey terminal placed at a flat zone.
 *
 * @author guinetik
 * @date 2026-04-07
 */
export class TerminalModel {
  /** The Three.js group containing the terminal mesh. */
  readonly group: THREE.Group

  private readonly glyph: THREE.Group
  private readonly glyphSymbols: THREE.Group[] = []
  private glyphElapsed = 0
  private glyphIndex = 0

  /** World-space position of this terminal. */
  get position(): THREE.Vector3 {
    return this.group.position
  }

  constructor() {
    this.group = new THREE.Group()
    this.glyph = new THREE.Group()
    this.glyph.name = 'survey-terminal-rotating-glyph'

    const baseGeo = new THREE.BoxGeometry(
      TERMINAL_BASE_WIDTH,
      TERMINAL_BASE_HEIGHT,
      TERMINAL_BASE_DEPTH,
    )
    const bodyGeo = new THREE.BoxGeometry(TERMINAL_WIDTH, TERMINAL_BODY_HEIGHT, TERMINAL_DEPTH)
    const frameGeo = new THREE.BoxGeometry(
      SCREEN_FRAME_WIDTH,
      SCREEN_FRAME_HEIGHT,
      SCREEN_FRAME_DEPTH,
    )
    const screenGeo = new THREE.PlaneGeometry(SCREEN_WIDTH, SCREEN_HEIGHT)
    const statusStripGeo = new THREE.PlaneGeometry(STATUS_STRIP_WIDTH, STATUS_STRIP_HEIGHT)
    const sideRailGeo = new THREE.BoxGeometry(SIDE_RAIL_WIDTH, SIDE_RAIL_HEIGHT, SIDE_RAIL_DEPTH)

    const bodyMat = new THREE.MeshStandardMaterial({
      color: TERMINAL_COLOR,
      metalness: BODY_METALNESS,
      roughness: MATTE_ROUGHNESS,
    })
    const baseMat = new THREE.MeshStandardMaterial({
      color: BASE_COLOR,
      metalness: BODY_METALNESS,
      roughness: MATTE_ROUGHNESS,
    })
    const frameMat = new THREE.MeshStandardMaterial({
      color: FRAME_COLOR,
      metalness: FRAME_METALNESS,
      roughness: FRAME_ROUGHNESS,
    })
    const screenMat = new THREE.MeshStandardMaterial({
      color: SCREEN_GLASS_COLOR,
      emissive: SCREEN_COLOR,
      emissiveIntensity: SCREEN_INTENSITY,
      metalness: SCREEN_METALNESS,
      roughness: SCREEN_ROUGHNESS,
      toneMapped: false,
    })
    const statusStripMat = new THREE.MeshBasicMaterial({
      color: STATUS_STRIP_COLOR,
      transparent: true,
      opacity: STATUS_STRIP_OPACITY,
    })
    const glyphMat = new THREE.MeshBasicMaterial({
      color: GLYPH_COLOR,
      transparent: true,
      opacity: GLYPH_OPACITY,
      blending: THREE.NormalBlending,
      depthWrite: false,
      toneMapped: false,
    })

    const base = new THREE.Mesh(baseGeo, baseMat)
    base.name = 'survey-terminal-base'
    base.position.y = TERMINAL_BASE_HEIGHT / 2
    base.castShadow = true
    base.receiveShadow = true
    this.group.add(base)

    const body = new THREE.Mesh(bodyGeo, bodyMat)
    body.name = 'survey-terminal-body'
    body.position.y = TERMINAL_BASE_HEIGHT + TERMINAL_BODY_HEIGHT / 2
    body.castShadow = true
    body.receiveShadow = true
    this.group.add(body)

    const screenCenterY = TERMINAL_BASE_HEIGHT + TERMINAL_BODY_HEIGHT * SCREEN_CENTER_HEIGHT_FRACTION
    const frontZ = TERMINAL_DEPTH / 2
    const frame = new THREE.Mesh(frameGeo, frameMat)
    frame.name = 'survey-terminal-screen-frame'
    frame.position.set(0, screenCenterY, frontZ + FRAME_FRONT_OFFSET)
    frame.castShadow = true
    this.group.add(frame)

    const screen = new THREE.Mesh(screenGeo, screenMat)
    screen.name = 'survey-terminal-screen'
    screen.position.set(0, screenCenterY, frontZ + SCREEN_FRAME_DEPTH / 2 + SCREEN_FRONT_OFFSET)
    this.group.add(screen)

    this.glyphSymbols.push(
      createOrbitGlyphSymbol(glyphMat),
      createDiamondGlyphSymbol(glyphMat),
      createWingGlyphSymbol(glyphMat),
    )
    for (const [index, symbol] of this.glyphSymbols.entries()) {
      symbol.visible = index === this.glyphIndex
      this.glyph.add(symbol)
    }
    this.glyph.position.set(0, screenCenterY, frontZ + SCREEN_FRAME_DEPTH / 2 + GLYPH_FRONT_OFFSET)
    this.group.add(this.glyph)

    const statusStrip = new THREE.Mesh(statusStripGeo, statusStripMat)
    statusStrip.name = 'survey-terminal-status-strip'
    statusStrip.position.set(
      0,
      screenCenterY - STATUS_STRIP_Y_OFFSET,
      frontZ + SCREEN_FRAME_DEPTH / 2 + STATUS_STRIP_FRONT_OFFSET,
    )
    this.group.add(statusStrip)

    for (const x of [-SIDE_RAIL_X_OFFSET, SIDE_RAIL_X_OFFSET]) {
      const rail = new THREE.Mesh(sideRailGeo, frameMat)
      rail.name = 'survey-terminal-side-rail'
      rail.position.set(x, TERMINAL_BASE_HEIGHT + TERMINAL_BODY_HEIGHT / 2, frontZ)
      rail.castShadow = true
      this.group.add(rail)
    }
  }

  /**
   * Place this terminal at a world position on the terrain.
   *
   * @param x - World X.
   * @param groundY - Ground height at (x, z).
   * @param z - World Z.
   */
  placeAt(x: number, groundY: number, z: number): void {
    this.group.position.set(x, groundY, z)
  }

  /**
   * Advance animated screen glyphs.
   *
   * @param dt - Frame delta in seconds.
   */
  tick(dt: number): void {
    this.glyphElapsed += dt
    while (this.glyphElapsed >= GLYPH_CYCLE_SECONDS) {
      this.glyphElapsed -= GLYPH_CYCLE_SECONDS
      this.setGlyphIndex((this.glyphIndex + 1) % this.glyphSymbols.length)
    }
  }

  private setGlyphIndex(index: number): void {
    this.glyphIndex = index
    for (let i = 0; i < this.glyphSymbols.length; i++) {
      this.glyphSymbols[i]!.visible = i === index
    }
  }

  /**
   * Build the analytic collision volume used by surface movement.
   *
   * The collider intentionally follows the pedestal footprint rather than the
   * full screen detail so the player bumps into the kiosk cleanly without
   * snagging on tiny bevel pieces.
   *
   * @param id - Stable collider id for debug and ignore filters.
   * @returns Lazy world-space AABB collider for the terminal kiosk.
   */
  createWorldCollider(id: string): WorldCollider {
    return {
      id,
      kind: 'aabb',
      min: () => ({
        x: this.group.position.x - TERMINAL_BASE_WIDTH / 2,
        y: this.group.position.y,
        z: this.group.position.z - TERMINAL_BASE_DEPTH / 2,
      }),
      max: () => ({
        x: this.group.position.x + TERMINAL_BASE_WIDTH / 2,
        y: this.group.position.y + TERMINAL_COLLIDER_HEIGHT,
        z: this.group.position.z + TERMINAL_BASE_DEPTH / 2,
      }),
      enabled: () => this.group.visible,
    }
  }

  /** Dispose geometry and materials. */
  dispose(): void {
    this.group.traverse((child) => {
      if (child instanceof THREE.Mesh || child instanceof THREE.Line) {
        child.geometry.dispose()
        const materials = Array.isArray(child.material) ? child.material : [child.material]
        for (const material of materials) {
          if (material instanceof THREE.Material) material.dispose()
        }
      }
    })
  }
}
