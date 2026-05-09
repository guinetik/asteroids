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
      'ui.switch',
      'ui.type',
      'ui.processing',
      'ui.scan',
      'ui.achievement',
      'ui.reward',
      'sfx.upgrade.install',
      'sfx.ui.shuttleprogram.click',
      'sfx.inbox',
      'sfx.tracker',
      'sfx.contract',
      'sfx.money',
      'sfx.knob',
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
      'sfx.laserPulse',
      'sfx.sizzle',
      'sfx.sizzle.impact',
      'sfx.rock.melt',
      'sfx.heartbeat',
      'sfx.flatline',
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
      'sfx.explosive',
      'sfx.suit.impact',
      'sfx.grunt.damage',
      'sfx.suit.alarm',
      'sfx.damage.slash',
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
      'sfx.geiger',
      'sfx.cargo.open',
      'sfx.cargo.close',
      'sfx.hatch.open',
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
      'sfx.tool.drill',
      'sfx.impact.gun',
      'sfx.laserFire',
      'sfx.tool.heal',
      'sfx.tool.prospectComplete',
      'sfx.tool.surveyReveal',
      'sfx.projectileHit',
      'sfx.shieldHit',
      'sfx.dan',
      'sfx.dan.hit',
      'sfx.pickup',
      'sfx.grunt',
      // ambient
      'ambient.space',
      'ambient.engine',
      'ambient.shuttleMission',
      'ambient.landerCockpit',
      'ambient.habitat',
      'ambient.anomaly',
      'ambient.asteroid',
      'ambient.wind',
      'sfx.floating',
      'sfx.jump',
      'sfx.jump.voice',
      'sfx.breathing.walk',
      'sfx.breathing.run',
      'sfx.breathing.hard',
      'sfx.oxygen.low',
      // sushi the cat
      'sfx.cat.purr',
      'sfx.cat.sleep',
      'sfx.cat.pet',
      'sfx.cat.eat',
      'sfx.cat.run',
      'sfx.cat.catch',
      'sfx.cat.meow.pet',
      'sfx.cat.meow.variant',
      'sfx.litter.scoop',
      'sfx.litter.use',
      'sfx.meow.happy',
      'sfx.meow.alert',
      // music
      'music.menu',
      'music.levelCombat',
      'music.levelGather',
      'music.levelRescue',
      'music.levelGravity',
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
    expect(getAudioDefinition('music.levelCombat').src).toBe('/sound/level_combat.mp3')
    expect(getAudioDefinition('music.levelGather').src).toBe('/sound/level_gather.mp3')
    expect(getAudioDefinition('music.levelRescue').src).toBe('/sound/level_rescue.mp3')
    expect(getAudioDefinition('music.levelGravity').src).toBe('/sound/level_gravity.mp3')
  })

  it('keeps record keys and definition ids aligned for every sound', () => {
    for (const id of AUDIO_SOUND_IDS) {
      expect(getAudioDefinition(id).id).toBe(id)
      const fromList = audioManifest.find((d) => d.id === id)
      expect(fromList).toBeDefined()
      expect(fromList!.id).toBe(id)
    }
  })

  it('allows dynamic sounds to omit static src', () => {
    for (const def of audioManifest) {
      if (def.allowDynamicSrc !== true) continue
      expect('src' in def && def.src !== undefined).toBe(false)
    }
  })

  it('requires static src for non-dynamic sounds', () => {
    for (const def of audioManifest) {
      if (def.allowDynamicSrc === true) continue
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
    expect(getAudioDefinition('ui.click').src).toBe('/sound/sfx.ui.primary.mp3')

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
    expect(SEEDED_SOUND_IDS).toEqual(['ui.error'])
    for (const id of SEEDED_SOUND_IDS) {
      const def = getAudioDefinition(id)
      expect(def.allowDynamicSrc).toBeUndefined()
      expect(def.effect).toBe('none')
      expect(typeof def.src).toBe('string')
      expect(def.src).toBe(SILENT_STATIC_WAV_DATA_URI)
    }
  })
})
