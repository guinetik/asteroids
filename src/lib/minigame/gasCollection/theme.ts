/**
 * Visual themes for the gas collection minigame.
 *
 * Each planet that uses the gas-collection minigame type gets its own
 * color palette and briefing text. The canvas renderer indexes into
 * this map by planet id.
 *
 * @author guinetik
 * @date 2026-04-11
 * @spec docs/superpowers/specs/2026-04-10-gas-collection-minigame-design.md
 */

/** Color stops for the deep-space-to-atmosphere background gradient. */
export interface SkyGradient {
  /** Top of canvas — deep space. */
  space: string
  /** Upper mid — transition. */
  upperMid: string
  /** Lower mid — atmosphere glow. */
  lowerMid: string
  /** Horizon line. */
  horizon: string
  /** Bottom — dense atmosphere. */
  dense: string
}

/** Colors for the curved planet surface. */
export interface PlanetSurface {
  /** Bright inner edge. */
  bright: string
  /** Mid tone. */
  mid: string
  /** Dark outer edge. */
  dark: string
  /** Deepest shadow. */
  shadow: string
}

/** Briefing screen content shown before the minigame starts. */
export interface BriefingContent {
  /** Warning icon character. */
  icon: string
  /** Bold title line. */
  title: string
  /** First paragraph — situation description. */
  situation: string
  /** Second paragraph — gameplay instructions. */
  instructions: string
}

/** A persistent surface feature that scrolls with the planet (e.g. Great Red Spot). */
export interface SurfaceFeature {
  /** Horizontal offset in the scroll cycle (0–1 = fraction of wrap width). */
  scrollPhase: number
  /** Vertical offset below PLANET_HORIZON_Y in px. */
  yOffset: number
  /** Ellipse semi-axis width in px. */
  radiusX: number
  /** Ellipse semi-axis height in px. */
  radiusY: number
  /** Core color (center of the spot). */
  coreColor: string
  /** Mid-ring color. */
  midColor: string
  /** Outer-ring color. */
  outerColor: string
  /** Rotation speed in radians/s for the swirl effect. */
  swirlSpeed: number
}

/** Surface rendering style — determines how cloud bands are drawn. */
export type SurfaceStyle = 'flat' | 'banded'

/** Full visual theme for a gas collection minigame instance. */
export interface GasCollectionTheme {
  /** Background sky gradient stops. */
  sky: SkyGradient
  /** Planet surface radial gradient. */
  surface: PlanetSurface
  /** How to render the cloud bands: 'flat' (simple rects) or 'banded' (sine wave + turbulence). */
  surfaceStyle: SurfaceStyle
  /** Cloud band colors (cycled). */
  cloudBands: [string, string, string]
  /** Atmospheric glow tint (RGBA base, alpha varies). */
  glowTint: string
  /** Wind streak color. */
  windColor: string
  /** Gas puff outer haze color. */
  puffOuter: string
  /** Gas puff inner core color. */
  puffInner: string
  /** Gas puff bright center. */
  puffCenter: string
  /** Optional surface features drawn on the planet (e.g. Great Red Spot). */
  surfaceFeatures?: SurfaceFeature[]
  /** Briefing screen content. */
  briefing: BriefingContent
}

/** Venus — amber/orange sulfuric atmosphere. */
const VENUS_THEME: GasCollectionTheme = {
  sky: {
    space: '#020108',
    upperMid: '#0a0510',
    lowerMid: '#1a0800',
    horizon: '#4d2200',
    dense: '#cc6600',
  },
  surface: {
    bright: '#ff9933',
    mid: '#e67300',
    dark: '#cc5500',
    shadow: '#993300',
  },
  surfaceStyle: 'flat',
  cloudBands: ['#ffdd99', '#e68a00', '#cc7700'],
  glowTint: 'rgb(255, 180, 80)',
  windColor: '#ffcc88',
  puffOuter: '#ffdd44',
  puffInner: '#ffcc44',
  puffCenter: '#ffeeaa',
  briefing: {
    icon: '⚠',
    title: 'ATMOSPHERIC STORM DETECTED',
    situation:
      'Sensors detect a massive storm brewing near the atmosphere — gas pockets are ' +
      'rising from the cloud layer. This is a rare collection window.',
    instructions:
      'Your ship cannot cross the atmosphere threshold or it will overheat. ' +
      'Orbit at close range and deploy collection drones into the rising gas puffs. ' +
      'Catch your drones before they burn up to bank the gas.',
  },
}

/** Jupiter — deep red/brown/tan banded giant. */
const JUPITER_THEME: GasCollectionTheme = {
  sky: {
    space: '#010105',
    upperMid: '#06040d',
    lowerMid: '#1a0c06',
    horizon: '#5c2e10',
    dense: '#a0522d',
  },
  surface: {
    bright: '#d2a679',
    mid: '#b87333',
    dark: '#8b4513',
    shadow: '#5c2e10',
  },
  surfaceStyle: 'banded',
  cloudBands: ['#e8d5b0', '#c4804a', '#8b5c2a'],
  glowTint: 'rgb(210, 160, 100)',
  windColor: '#d4b896',
  puffOuter: '#e8c080',
  puffInner: '#d4a060',
  puffCenter: '#f0dcc0',
  surfaceFeatures: [
    {
      scrollPhase: 0.35,
      yOffset: 45,
      radiusX: 90,
      radiusY: 50,
      coreColor: '#c0392b',
      midColor: '#a83226',
      outerColor: '#8b2500',
      swirlSpeed: 0.4,
    },
  ],
  briefing: {
    icon: '⚠',
    title: 'HYDROGEN UPWELLING DETECTED',
    situation:
      'A massive convection cell is pushing metallic hydrogen up through Jupiter\'s ' +
      'cloud bands. Concentration levels are off the charts — move fast.',
    instructions:
      'The radiation belt will cook your hull if you drop too low. ' +
      'Skim the upper cloud layer and deploy drones into the hydrogen plumes. ' +
      'Catch them before they sink into the pressure crush zone.',
  },
}

/** Theme lookup by planet id. Falls back to Venus for unknown planets. */
const THEMES: Record<string, GasCollectionTheme> = {
  venus: VENUS_THEME,
  jupiter: JUPITER_THEME,
}

/**
 * Get the gas collection visual theme for a planet.
 *
 * @param planetId - planet id from the mission target
 * @returns the theme, falling back to Venus if not configured
 */
export function getGasCollectionTheme(planetId: string): GasCollectionTheme {
  return THEMES[planetId] ?? VENUS_THEME
}
