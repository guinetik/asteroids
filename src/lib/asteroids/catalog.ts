import type { AsteroidDefinition } from './types'

import bennuData from '@/data/asteroids/bennu.json'
import itokawaData from '@/data/asteroids/itokawa.json'
import psycheData from '@/data/asteroids/psyche.json'
import xg7Data from '@/data/asteroids/2019-xg7.json'
import kr3Data from '@/data/asteroids/2021-kr3.json'

const COMPOSITION_SUM = 100

function validateAsteroid(data: AsteroidDefinition): AsteroidDefinition {
  const sum = data.composition.reduce((acc, m) => acc + m.percentage, 0)
  if (sum !== COMPOSITION_SUM) {
    throw new Error(
      `Asteroid "${data.id}" composition sums to ${sum}, expected ${COMPOSITION_SUM}`,
    )
  }
  return data
}

export const ASTEROID_CATALOG: AsteroidDefinition[] = [
  bennuData,
  itokawaData,
  psycheData,
  xg7Data,
  kr3Data,
].map((data) => validateAsteroid(data as unknown as AsteroidDefinition))

export function getAsteroidById(id: string): AsteroidDefinition | undefined {
  return ASTEROID_CATALOG.find((a) => a.id === id)
}
