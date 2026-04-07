import { describe, expect, it } from 'vitest'
import {
  AUDIO_CATEGORIES,
  AUDIO_SOUND_IDS,
  SEEDED_SOUND_IDS,
  SILENT_STATIC_WAV_DATA_URI,
  audioManifest,
  getAudioDefinition,
} from '../audioManifest'

describe('audioManifest', () => {
  it('registers all expected sound ids', () => {
    expect(AUDIO_SOUND_IDS).toEqual([
      'ui.click',
      'ui.confirm',
      'ui.error',
      'ui.hover',
      'sfx.thrusterLoop',
      'sfx.thrusterBurst',
      'sfx.explosion',
      'sfx.landing',
      'sfx.collision',
      'sfx.slingshot',
      'sfx.fuelWarning',
      'sfx.laserFire',
      'sfx.projectileHit',
      'sfx.shieldHit',
      'sfx.pickup',
      'ambient.space',
      'ambient.engine',
      'ambient.wind',
      'music.menu',
      'music.level',
      'music.gameover',
      'voice.comms',
    ])
  })

  it('defines valid category and loading semantics for dynamic voice', () => {
    const def = getAudioDefinition('voice.comms')
    expect(def.category).toBe('voice')
    expect(def.load).toBe('lazy')
    expect(def.playback).toBe('exclusive-category')
    expect(def.allowDynamicSrc).toBe(true)
    expect(def.effect).toBe('radio')
  })

  it('keeps the manifest categories aligned with the exported category list', () => {
    for (const def of audioManifest) {
      expect(AUDIO_CATEGORIES).toContain(def.category)
    }
  })

  it('keeps record keys and definition ids aligned for every sound', () => {
    for (const id of AUDIO_SOUND_IDS) {
      expect(getAudioDefinition(id).id).toBe(id)
      const fromList = audioManifest.find((d) => d.id === id)
      expect(fromList).toBeDefined()
      expect(fromList!.id).toBe(id)
    }
  })

  it('requires static sources for non-dynamic sounds and forbids silent src omission', () => {
    for (const def of audioManifest) {
      if (def.allowDynamicSrc === true) {
        expect('src' in def && def.src !== undefined).toBe(false)
        continue
      }
      expect(def.src).toBeDefined()
      expect(typeof def.src === 'string' || Array.isArray(def.src)).toBe(true)
    }
  })

  it('returns frozen snapshots so callers cannot mutate shared manifest state', () => {
    const fromGetter = getAudioDefinition('ui.click')
    expect(Object.isFrozen(fromGetter)).toBe(true)

    try {
      ;(fromGetter as { src?: string }).src = '/tampered.mp3'
    } catch {
      /* strict mode may throw on frozen prop assign */
    }
    expect(getAudioDefinition('ui.click').src).toBe(SILENT_STATIC_WAV_DATA_URI)

    const fromList = audioManifest[0]
    expect(fromList?.id).toBe('ui.click')
    expect(Object.isFrozen(fromList)).toBe(true)
    try {
      ;(fromList as { volume?: number }).volume = 0
    } catch {
      /* frozen */
    }
    expect(getAudioDefinition('ui.click').volume).toBe(0.35)
  })

  it('locks seeded cues to bundled static sources', () => {
    expect(SEEDED_SOUND_IDS).toEqual(['ui.click', 'ui.error', 'sfx.explosion'])
    for (const id of SEEDED_SOUND_IDS) {
      const def = getAudioDefinition(id)
      expect(def.allowDynamicSrc).toBeUndefined()
      expect(def.effect).toBe('none')
      expect(typeof def.src).toBe('string')
      expect(def.src).toBe(SILENT_STATIC_WAV_DATA_URI)
    }
  })
})
