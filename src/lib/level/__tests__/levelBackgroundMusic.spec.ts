import { describe, expect, it } from 'vitest'
import { resolveLevelBackgroundMusicSoundId } from '@/lib/level/levelBackgroundMusic'
import type { ObjectiveType } from '@/lib/missions/types'

function objs(...types: ObjectiveType[]) {
  return types.map((type) => ({ type }))
}

describe('resolveLevelBackgroundMusicSoundId', () => {
  it('returns combat for exterminate, bunker, dan', () => {
    expect(resolveLevelBackgroundMusicSoundId(objs('exterminate'))).toBe('music.levelCombat')
    expect(resolveLevelBackgroundMusicSoundId(objs('bunker'))).toBe('music.levelCombat')
    expect(resolveLevelBackgroundMusicSoundId(objs('dan'))).toBe('music.levelCombat')
  })

  it('prefers combat over rescue when mixed', () => {
    expect(resolveLevelBackgroundMusicSoundId(objs('rescue', 'exterminate'))).toBe(
      'music.levelCombat',
    )
  })

  it('returns rescue when only rescue', () => {
    expect(resolveLevelBackgroundMusicSoundId(objs('rescue'))).toBe('music.levelRescue')
  })

  it('returns gather bed for mining and collect', () => {
    expect(resolveLevelBackgroundMusicSoundId(objs('gather'))).toBe('music.levelGather')
    expect(resolveLevelBackgroundMusicSoundId(objs('collect'))).toBe('music.levelGather')
  })

  it('prefers rescue over gather when both present without combat', () => {
    expect(resolveLevelBackgroundMusicSoundId(objs('gather', 'rescue'))).toBe('music.levelRescue')
  })

  it('returns gravity for survey photometry prospectus-terminal', () => {
    expect(resolveLevelBackgroundMusicSoundId(objs('survey'))).toBe('music.levelGravity')
    expect(resolveLevelBackgroundMusicSoundId(objs('photometry'))).toBe('music.levelGravity')
    expect(resolveLevelBackgroundMusicSoundId(objs('prospectus-terminal'))).toBe('music.levelGravity')
  })

  it('defaults to combat when list is empty', () => {
    expect(resolveLevelBackgroundMusicSoundId([])).toBe('music.levelCombat')
  })
})
