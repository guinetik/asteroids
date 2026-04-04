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

export interface VibeJamParams {
  portal: boolean
  ref?: string
  username?: string
  color?: string
  speed?: number
  speed_x?: number
  speed_y?: number
  speed_z?: number
  rotation_x?: number
  rotation_y?: number
  rotation_z?: number
  avatar_url?: string
  team?: string
  hp?: number
}

export class VibePortal {
  public readonly arrival: VibeJamParams
  public readonly isArrival: boolean
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
