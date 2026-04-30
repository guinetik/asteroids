import { describe, expect, it } from 'vitest'
import { createProfile } from '@/lib/player/profile'
import { FANTASIA_INTRO_MESSAGE_ID, markFantasiaCosmeticIntroIfNeeded } from '@/lib/cosmetics/fantasiaIntro'

describe('fantasia cosmetic intro', () => {
  it('marks Fantasia intro only once after eligible orbital arrivals', () => {
    const starter = createProfile('Orbit Tester')
    expect(starter.fantasiaCosmeticIntroSent).toBe(false)

    const untouchedSun = markFantasiaCosmeticIntroIfNeeded(starter, 'sun')
    expect(untouchedSun).toBe(starter)

    const untouchedEarth = markFantasiaCosmeticIntroIfNeeded(starter, 'earth')
    expect(untouchedEarth).toBe(starter)

    const firstMarsTrip = markFantasiaCosmeticIntroIfNeeded(starter, 'mars')
    expect(firstMarsTrip.fantasiaCosmeticIntroSent).toBe(true)
    expect(firstMarsTrip).not.toBe(starter)

    const repeat = markFantasiaCosmeticIntroIfNeeded(firstMarsTrip, 'mars')
    expect(repeat).toBe(firstMarsTrip)

    expect(FANTASIA_INTRO_MESSAGE_ID).toBe('fantasia-pimp-my-shuttle-intro')
  })
})
