/**
 * Vibe Coding Game Jam 2026 portal system.
 *
 * Framework-agnostic module that handles inter-game player transport
 * via URL query parameters. The game decides when a player enters a
 * portal; this module handles parsing arrivals, building departure
 * URLs, and navigating.
 *
 * @author guinetik
 * @date 2026-04-03
 * @spec docs/superpowers/specs/2026-04-03-vibe-portal-design.md
 */

/** Jam portal redirect endpoint. */
export const VIBE_JAM_PORTAL_URL = 'https://jam.pieter.com/portal/2026'

const NUMERIC_PARAMS = new Set([
  'speed',
  'speed_x',
  'speed_y',
  'speed_z',
  'rotation_x',
  'rotation_y',
  'rotation_z',
  'hp',
])

/** Typed representation of all known Vibe Jam portal query parameters. */
export interface VibeJamParams {
  /** Whether the player arrived through a portal. Parsed from `?portal=true`. */
  portal: boolean
  /** Domain of the game the player came from, e.g. "fly.pieter.com". Used by {@link VibePortal.returnToOrigin}. */
  ref?: string
  /** Player's display name. */
  username?: string
  /** Player color as a CSS color string (hex or named), e.g. "red", "#ff0000". */
  color?: string
  /** Player speed in meters per second (scalar). */
  speed?: number
  /** Player velocity X component in m/s. */
  speed_x?: number
  /** Player velocity Y component in m/s. */
  speed_y?: number
  /** Player velocity Z component in m/s. */
  speed_z?: number
  /** Player rotation around X axis in radians. */
  rotation_x?: number
  /** Player rotation around Y axis in radians. */
  rotation_y?: number
  /** Player rotation around Z axis in radians. */
  rotation_z?: number
  /** URL to player's avatar image. */
  avatar_url?: string
  /** Team name for multiplayer games. */
  team?: string
  /** Health points, 1–100. */
  hp?: number
}

/**
 * Portal adapter between game state and URL-based player transport.
 *
 * Construct once on game boot. Use {@link arrival} to read incoming
 * player data, call {@link depart} to send the player to the next
 * game, or {@link returnToOrigin} to go back to the referring game.
 */
export class VibePortal {
  /** Parsed arrival params from the current URL. */
  public readonly arrival: VibeJamParams
  /** Whether the player arrived via a portal (`?portal=true`). */
  public readonly isArrival: boolean
  /** Raw query params as a string map (includes custom/unknown keys). */
  public readonly params: Map<string, string>

  constructor() {
    const searchParams = new URLSearchParams(window.location.search)

    this.params = new Map<string, string>()
    for (const [key, value] of searchParams) {
      this.params.set(key, value)
    }

    this.arrival = VibePortal.parseParams(searchParams)
    this.isArrival = this.arrival.portal
  }

  /**
   * Navigate back to the game the player came from.
   * Returns `false` without navigating if no `ref` was present on arrival.
   */
  returnToOrigin(state?: Partial<VibeJamParams> & Record<string, string | number>): boolean {
    const ref = this.arrival.ref
    if (!ref) return false

    const baseUrl = ref.startsWith('http://') || ref.startsWith('https://') ? ref : `https://${ref}`
    const url = new URL(baseUrl)
    url.searchParams.set('portal', 'true')

    if (state) {
      for (const [key, value] of Object.entries(state)) {
        if (key === 'portal') continue
        url.searchParams.set(key, String(value))
      }
    }

    window.location.href = url.toString()
    return true
  }

  /**
   * Send the player to the jam portal with their current state.
   * Automatically sets `portal=true` and `ref` to the current game's host.
   */
  depart(state: Partial<VibeJamParams> & Record<string, string | number>): void {
    const url = new URL(VIBE_JAM_PORTAL_URL)
    url.searchParams.set('portal', 'true')
    url.searchParams.set('ref', window.location.host)

    for (const [key, value] of Object.entries(state)) {
      if (key === 'portal') continue
      url.searchParams.set(key, String(value))
    }

    window.location.href = url.toString()
  }

  private static parseParams(searchParams: URLSearchParams): VibeJamParams {
    const get = (key: string): string | undefined => {
      const value = searchParams.get(key)
      return value === null ? undefined : value
    }

    const getNumber = (key: string): number | undefined => {
      const raw = get(key)
      if (raw === undefined) return undefined
      const num = Number(raw)
      return Number.isNaN(num) ? undefined : num
    }

    const numericValues: Record<string, number | undefined> = {}
    for (const key of NUMERIC_PARAMS) {
      numericValues[key] = getNumber(key)
    }

    return {
      portal: searchParams.get('portal') === 'true',
      ref: get('ref'),
      username: get('username'),
      color: get('color'),
      avatar_url: get('avatar_url'),
      team: get('team'),
      ...numericValues,
    } as VibeJamParams
  }
}
