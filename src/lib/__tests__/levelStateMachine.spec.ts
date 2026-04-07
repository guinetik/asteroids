import { describe, it, expect, vi } from 'vitest'
import {
  createLevelStateMachine,
  ARRIVAL_DURATION,
  EXFIL_SEQUENCE_DURATION,
} from '@/lib/level/levelStateMachine'

describe('exfil transitions', () => {
  it('transitions lander → exfil on exfiltrate when near shuttle and has EVA history', () => {
    const sm = createLevelStateMachine({
      onStateChange: vi.fn(),
      isLanderGrounded: () => true,
      isPlayerNearLander: () => true,
      isLanderNearShuttle: () => true,
      hasCompletedEva: () => true,
    })
    sm.tick(ARRIVAL_DURATION + 0.1)
    expect(sm.state).toBe('lander')
    expect(sm.trigger('exfiltrate')).toBe(true)
    expect(sm.state).toBe('exfil')
  })

  it('blocks exfiltrate when lander is NOT near shuttle', () => {
    const sm = createLevelStateMachine({
      onStateChange: vi.fn(),
      isLanderGrounded: () => true,
      isPlayerNearLander: () => true,
      isLanderNearShuttle: () => false,
      hasCompletedEva: () => true,
    })
    sm.tick(ARRIVAL_DURATION + 0.1)
    expect(sm.trigger('exfiltrate')).toBe(false)
    expect(sm.state).toBe('lander')
  })

  it('blocks exfiltrate when player has NOT completed EVA', () => {
    const sm = createLevelStateMachine({
      onStateChange: vi.fn(),
      isLanderGrounded: () => true,
      isPlayerNearLander: () => true,
      isLanderNearShuttle: () => true,
      hasCompletedEva: () => false,
    })
    sm.tick(ARRIVAL_DURATION + 0.1)
    expect(sm.trigger('exfiltrate')).toBe(false)
    expect(sm.state).toBe('lander')
  })

  it('auto-transitions exfil → complete after EXFIL_SEQUENCE_DURATION', () => {
    const sm = createLevelStateMachine({
      onStateChange: vi.fn(),
      isLanderGrounded: () => true,
      isLanderNearShuttle: () => true,
      hasCompletedEva: () => true,
    })
    sm.tick(ARRIVAL_DURATION + 0.1)
    sm.trigger('exfiltrate')
    expect(sm.state).toBe('exfil')
    sm.tick(EXFIL_SEQUENCE_DURATION + 0.1)
    expect(sm.state).toBe('complete')
  })
})
