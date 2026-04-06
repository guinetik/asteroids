import { describe, it, expect, vi } from 'vitest'
import { createLevelStateMachine, ARRIVAL_DURATION } from '../levelStateMachine'

describe('Level State Machine', () => {
  describe('arrival → lander', () => {
    it('starts in arrival state', () => {
      const sm = createLevelStateMachine({ onStateChange: vi.fn() })
      expect(sm.state).toBe('arrival')
    })

    it('auto-transitions to lander after ARRIVAL_DURATION seconds', () => {
      const sm = createLevelStateMachine({ onStateChange: vi.fn() })
      sm.tick(ARRIVAL_DURATION - 0.1)
      expect(sm.state).toBe('arrival')
      sm.tick(0.2)
      expect(sm.state).toBe('lander')
    })
  })

  describe('lander → eva (exitVehicle)', () => {
    it('blocks exitVehicle when guard returns false', () => {
      const sm = createLevelStateMachine({
        onStateChange: vi.fn(),
        isLanderGrounded: () => false,
      })
      sm.tick(ARRIVAL_DURATION + 0.1)
      expect(sm.state).toBe('lander')
      const result = sm.trigger('exitVehicle')
      expect(result).toBe(false)
      expect(sm.state).toBe('lander')
    })

    it('allows exitVehicle when lander is grounded', () => {
      const sm = createLevelStateMachine({
        onStateChange: vi.fn(),
        isLanderGrounded: () => true,
      })
      sm.tick(ARRIVAL_DURATION + 0.1)
      const result = sm.trigger('exitVehicle')
      expect(result).toBe(true)
      expect(sm.state).toBe('eva')
    })
  })

  describe('eva → lander (enterVehicle)', () => {
    it('blocks enterVehicle when player is far from lander', () => {
      const sm = createLevelStateMachine({
        onStateChange: vi.fn(),
        isLanderGrounded: () => true,
        isPlayerNearLander: () => false,
      })
      sm.tick(ARRIVAL_DURATION + 0.1)
      sm.trigger('exitVehicle')
      const result = sm.trigger('enterVehicle')
      expect(result).toBe(false)
      expect(sm.state).toBe('eva')
    })

    it('allows enterVehicle when player is near lander', () => {
      const sm = createLevelStateMachine({
        onStateChange: vi.fn(),
        isLanderGrounded: () => true,
        isPlayerNearLander: () => true,
      })
      sm.tick(ARRIVAL_DURATION + 0.1)
      sm.trigger('exitVehicle')
      const result = sm.trigger('enterVehicle')
      expect(result).toBe(true)
      expect(sm.state).toBe('lander')
    })
  })

  describe('round-trip', () => {
    it('supports lander → eva → lander → eva', () => {
      const sm = createLevelStateMachine({
        onStateChange: vi.fn(),
        isLanderGrounded: () => true,
        isPlayerNearLander: () => true,
      })
      sm.tick(ARRIVAL_DURATION + 0.1)
      sm.trigger('exitVehicle')
      sm.trigger('enterVehicle')
      sm.trigger('exitVehicle')
      expect(sm.state).toBe('eva')
    })
  })

  describe('callbacks', () => {
    it('fires onStateChange on every transition', () => {
      const onChange = vi.fn()
      const sm = createLevelStateMachine({
        onStateChange: onChange,
        isLanderGrounded: () => true,
      })
      sm.tick(ARRIVAL_DURATION + 0.1)
      expect(onChange).toHaveBeenCalledWith('lander', 'arrival', undefined)
    })
  })
})
