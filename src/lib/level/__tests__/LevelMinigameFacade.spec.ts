import { describe, expect, it, vi } from 'vitest'
import { LevelMinigameFacade } from '@/lib/level/LevelMinigameFacade'
import type { Enemy } from '@/lib/fps/enemy'
import type { MiniGame, MiniGameContext, MiniGameStep } from '@/lib/minigame/MiniGame'

function createMinigame(overrides: Partial<MiniGame> = {}): MiniGame {
  const steps: readonly MiniGameStep[] = []
  return {
    status: 'idle',
    objectiveIndex: 0,
    isPlayerNearInteraction: false,
    timeRemaining: null,
    progressCurrent: null,
    progressTotal: null,
    steps,
    tick: vi.fn(),
    dispose: vi.fn(),
    ...overrides,
  }
}

describe('LevelMinigameFacade', () => {
  it('ticks every minigame with the shared frame context and clears prompts when idle in EVA', () => {
    const facade = new LevelMinigameFacade()
    const minigameA = createMinigame()
    const minigameB = createMinigame()
    const onTerminalPrompt = vi.fn()
    facade.add(minigameA)
    facade.add(minigameB)

    facade.tick(
      0.25,
      {
        levelState: 'eva',
        landerPosition: { x: 1, y: 2, z: 3 },
        landerGrounded: true,
        playerPosition: { x: 4, y: 5, z: 6 },
        interactPressed: true,
        terminalInteractPressed: false,
      },
      onTerminalPrompt,
    )

    const expectedContext: MiniGameContext = {
      levelState: 'eva',
      landerPosition: { x: 1, y: 2, z: 3 },
      landerGrounded: true,
      playerPosition: { x: 4, y: 5, z: 6 },
      interactPressed: true,
      terminalInteractPressed: false,
    }

    expect(minigameA.tick).toHaveBeenCalledWith(0.25, expectedContext)
    expect(minigameB.tick).toHaveBeenCalledWith(0.25, expectedContext)
    expect(onTerminalPrompt).toHaveBeenCalledWith(null)
  })

  it('does not clear prompts when a minigame interaction is in range', () => {
    const facade = new LevelMinigameFacade()
    const minigame = createMinigame({ isPlayerNearInteraction: true })
    const onTerminalPrompt = vi.fn()
    facade.add(minigame)

    facade.tick(
      0.1,
      {
        levelState: 'eva',
        landerPosition: null,
        landerGrounded: false,
        playerPosition: { x: 0, y: 0, z: 0 },
        interactPressed: false,
        terminalInteractPressed: false,
      },
      onTerminalPrompt,
    )

    expect(onTerminalPrompt).not.toHaveBeenCalled()
  })

  it('tracks active and complete minigame state', () => {
    const facade = new LevelMinigameFacade()
    const completed = createMinigame({ objectiveIndex: 1, status: 'completed' })
    const active = createMinigame({
      objectiveIndex: 2,
      status: 'active',
      timeRemaining: 12,
      progressCurrent: 3,
      progressTotal: 7,
    })
    facade.add(completed)
    facade.add(active)

    expect(facade.getByObjectiveIndex(2)).toBe(active)
    expect(facade.getActive()).toBe(active)
    expect(facade.areAllComplete()).toBe(false)
  })

  it('returns false for completion when no minigames exist and true when all complete', () => {
    const facade = new LevelMinigameFacade()
    expect(facade.areAllComplete()).toBe(false)

    facade.add(createMinigame({ status: 'completed' }))
    facade.add(createMinigame({ objectiveIndex: 1, status: 'completed' }))

    expect(facade.areAllComplete()).toBe(true)
  })

  it('fans enemy-hit notifications out to registered minigames and disposes them on teardown', () => {
    const facade = new LevelMinigameFacade()
    const notifyEnemyHit = vi.fn()
    const minigame = createMinigame({ notifyEnemyHit, dispose: vi.fn() })
    facade.add(minigame)

    facade.notifyEnemyHit({} as Enemy)
    facade.dispose()

    expect(notifyEnemyHit).toHaveBeenCalledTimes(1)
    expect(minigame.dispose).toHaveBeenCalledTimes(1)
    expect(facade.getByObjectiveIndex(0)).toBeUndefined()
    expect(facade.getActive()).toBeUndefined()
  })
})
