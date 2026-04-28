import { describe, expect, it } from 'vitest'
import { shouldHardReloadLevelRestart } from '../levelRestartPolicy'

describe('shouldHardReloadLevelRestart', () => {
  it('hard reloads rescue survivor-loss restarts', () => {
    expect(shouldHardReloadLevelRestart('All Survivors Lost')).toBe(true)
  })

  it('hard reloads bunker operator death restarts', () => {
    expect(shouldHardReloadLevelRestart('Operator KIA')).toBe(true)
  })

  it('allows normal in-place restarts for generic lander deaths', () => {
    expect(shouldHardReloadLevelRestart('Lander Destroyed')).toBe(false)
  })
})
