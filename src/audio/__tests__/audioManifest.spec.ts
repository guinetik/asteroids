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
      // shuttle propulsion
      'sfx.thrusterLoop',
      'sfx.thrusterBurst',
      'sfx.brake',
      'sfx.slingshot',
      'sfx.slingshot.burst',
      'sfx.slingshot.charge',
      'sfx.orbitCapture',
      'sfx.wormhole',
      'sfx.fuelWarning',
      // lander propulsion
      'sfx.lander.thrusterLoop',
      'sfx.lander.thrusterBurst',
      'sfx.lander.thruster.ground',
      'sfx.lander.gyro',
      'sfx.lander.shake',
      'sfx.lander.alarm',
      'sfx.lander.alarm.attitude',
      'sfx.landing',
      'sfx.collision',
      'sfx.explosion',
      // shuttle systems
      'sfx.touchdown',
      'sfx.harpoon',
      'sfx.ice_break',
      'sfx.mission.shuttle.clear',
      'sfx.collect',
      'sfx.mistake',
      'sfx.telemetry.shoot',
      'sfx.target',
      'sfx.drone',
      'sfx.drone.pickup',
      'sfx.geyser',
      'sfx.cargo.open',
      'sfx.cargo.close',
      // footsteps
      'sfx.step.habitat.1',
      'sfx.step.habitat.2',
      'sfx.step.asteroid.1',
      'sfx.step.asteroid.2',
      // level / cinematic
      'sfx.level.arrival',
      'sfx.arrivalSeparation',
      'sfx.dockingClamp',
      // combat / EVA
      'sfx.laserFire',
      'sfx.projectileHit',
      'sfx.shieldHit',
      'sfx.pickup',
      // ambient
      'ambient.space',
      'ambient.engine',
      'ambient.landerCockpit',
      'ambient.habitat',
      'ambient.anomaly',
      'ambient.asteroid',
      'ambient.wind',
      'sfx.floating',
      'sfx.jump',
      'sfx.breathing.walk',
      'sfx.breathing.run',
      // music
      'music.menu',
      'music.level',
      'music.gameover',
      // voice
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

  it('points the shipped music cues at the bundled loop assets', () => {
    expect(getAudioDefinition('music.menu').src).toBe('/sound/theme.mp3')
    expect(getAudioDefinition('music.level').src).toBe('/sound/level.mp3')
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
    expect(SEEDED_SOUND_IDS).toEqual(['ui.click', 'ui.error'])
    for (const id of SEEDED_SOUND_IDS) {
      const def = getAudioDefinition(id)
      expect(def.allowDynamicSrc).toBeUndefined()
      expect(def.effect).toBe('none')
      expect(typeof def.src).toBe('string')
      expect(def.src).toBe(SILENT_STATIC_WAV_DATA_URI)
    }
  })
})
