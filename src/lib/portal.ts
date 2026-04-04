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
