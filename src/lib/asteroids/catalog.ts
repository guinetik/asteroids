/**
 * Asteroid catalog loader.
 *
 * Imports all asteroid JSON data files at build time via Vite static
 * imports, validates composition integrity, and exports the typed
 * catalog for consumption by both the UI and procedural generator.
 *
 * @author guinetik
 * @date 2026-04-03
 * @spec docs/superpowers/specs/2026-04-03-asteroid-data-model-design.md
 */
import type { AsteroidDefinition } from './types'

import bennuData from '@/data/asteroids/bennu.json'
import erosData from '@/data/asteroids/eros.json'
import itokawaData from '@/data/asteroids/itokawa.json'
import psycheData from '@/data/asteroids/psyche.json'
import vestaData from '@/data/asteroids/vesta.json'
import xg7Data from '@/data/asteroids/2019-xg7.json'
import kr3Data from '@/data/asteroids/2021-kr3.json'

const COMPOSITION_SUM = 100

/** Throws if composition percentages don't sum to 100. */
function validateAsteroid(data: AsteroidDefinition): AsteroidDefinition {
  const sum = data.composition.reduce((acc, m) => acc + m.percentage, 0)
  if (sum !== COMPOSITION_SUM) {
    throw new Error(`Asteroid "${data.id}" composition sums to ${sum}, expected ${COMPOSITION_SUM}`)
  }
  return data
}

/** All playable asteroids, validated at load time. */
export const ASTEROID_CATALOG: AsteroidDefinition[] = [
  bennuData,
  erosData,
  itokawaData,
  vestaData,
  psycheData,
  xg7Data,
  kr3Data,
].map((data) => validateAsteroid(data as unknown as AsteroidDefinition))

/** Look up an asteroid by its unique ID. Returns `undefined` if not found. */
export function getAsteroidById(id: string): AsteroidDefinition | undefined {
  return ASTEROID_CATALOG.find((a) => a.id === id)
}
