import { describe, it, expect } from 'vitest'
import { BunkerSceneState, type BunkerSubState } from '../bunkerSceneState'

const ENTERED: BunkerSubState = 'antechamber-idle'
const ARENA_ENTRY: BunkerSubState = 'arena-entry'
const ACTIVE: BunkerSubState = 'wave-active'
const BREATHER: BunkerSubState = 'wave-breather'
const FINAL: BunkerSubState = 'final-clear'
const EXIT: BunkerSubState = 'exit-prompt'

describe('BunkerSceneState', () => {
  it('starts in entering', () => {
    const s = new BunkerSceneState({ totalWaves: 3 })
    expect(s.current).toBe('entering')
  })

  it('transitions entering → antechamber-idle on activate', () => {
    const s = new BunkerSceneState({ totalWaves: 3 })
    s.notifyActivated()
    expect(s.current).toBe(ENTERED)
  })

  it('transitions antechamber-idle → arena-entry on door interact', () => {
    const s = new BunkerSceneState({ totalWaves: 3 })
    s.notifyActivated()
    s.notifyDoorInteracted()
    expect(s.current).toBe(ARENA_ENTRY)
    expect(s.currentWaveIndex).toBe(-1)
  })

  it('transitions arena-entry → wave-active when the player enters the arena', () => {
    const s = new BunkerSceneState({ totalWaves: 3 })
    s.notifyActivated()
    s.notifyDoorInteracted()
    s.notifyArenaEntered()
    expect(s.current).toBe(ACTIVE)
    expect(s.currentWaveIndex).toBe(0)
  })

  it('door-interact during arena-entry is ignored (interlock)', () => {
    const s = new BunkerSceneState({ totalWaves: 3 })
    s.notifyActivated()
    s.notifyDoorInteracted() // → arena-entry
    const before = s.currentWaveIndex
    s.notifyDoorInteracted()
    expect(s.current).toBe(ARENA_ENTRY)
    expect(s.currentWaveIndex).toBe(before)
  })

  it('transitions wave-active → wave-breather when wave is cleared (non-final)', () => {
    const s = new BunkerSceneState({ totalWaves: 3 })
    s.notifyActivated()
    s.notifyDoorInteracted()
    s.notifyArenaEntered()
    s.notifyWaveCleared()
    expect(s.current).toBe(BREATHER)
    expect(s.currentWaveIndex).toBe(0)
  })

  it('breather counts down and advances to wave-active with the next wave index', () => {
    const s = new BunkerSceneState({ totalWaves: 3, breatherSeconds: 3 })
    s.notifyActivated()
    s.notifyDoorInteracted()
    s.notifyArenaEntered()
    s.notifyWaveCleared() // → breather, wave 0 done
    s.tick(1.5)
    expect(s.current).toBe(BREATHER)
    s.tick(1.5)
    expect(s.current).toBe(ACTIVE)
    expect(s.currentWaveIndex).toBe(1)
  })

  it('final wave clear transitions wave-active → final-clear → exit-prompt', () => {
    const s = new BunkerSceneState({ totalWaves: 3 })
    s.notifyActivated()
    s.notifyDoorInteracted()
    s.notifyArenaEntered()
    s.notifyWaveCleared() // wave 0 done → breather
    s.tick(3)
    s.notifyWaveCleared() // wave 1 done → breather
    s.tick(3)
    s.notifyWaveCleared() // wave 2 done → final-clear → exit-prompt
    expect([FINAL, EXIT]).toContain(s.current)
    s.tick(1) // settle
    expect(s.current).toBe(EXIT)
  })

  it('hatch-interact before exit-prompt is ignored', () => {
    const s = new BunkerSceneState({ totalWaves: 3 })
    s.notifyActivated()
    s.notifyHatchInteracted()
    expect(s.current).toBe(ENTERED)
    s.notifyDoorInteracted()
    s.notifyHatchInteracted()
    expect(s.current).toBe(ARENA_ENTRY)
  })

  it('hatch-interact during exit-prompt transitions to exiting', () => {
    const s = new BunkerSceneState({ totalWaves: 1 })
    s.notifyActivated()
    s.notifyDoorInteracted()
    s.notifyArenaEntered()
    s.notifyWaveCleared()
    s.tick(1) // settle to exit-prompt
    s.notifyHatchInteracted()
    expect(s.current).toBe('exiting')
  })

  it('emits an event on every transition', () => {
    const events: BunkerSubState[] = []
    const s = new BunkerSceneState({ totalWaves: 1, onTransition: (next) => events.push(next) })
    s.notifyActivated()
    s.notifyDoorInteracted()
    s.notifyArenaEntered()
    s.notifyWaveCleared()
    s.tick(1)
    s.notifyHatchInteracted()
    expect(events).toEqual([ENTERED, ARENA_ENTRY, ACTIVE, FINAL, EXIT, 'exiting'])
  })
})
