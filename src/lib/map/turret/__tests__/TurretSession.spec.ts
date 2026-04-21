import { describe, it, expect, vi, beforeEach } from 'vitest'
import { TurretSession } from '../TurretSession'
import {
  TURRET_FADE_IN_DURATION,
  TURRET_FADE_OUT_DURATION,
  TURRET_OPENING_COMPLETE_THRESHOLD,
  TURRET_CLOSING_COMPLETE_THRESHOLD,
} from '../turretConstants'

function makeDeps() {
  return {
    onOpen: vi.fn(),
    onClose: vi.fn(),
    tickActive: vi.fn(),
    shuttleIsDead: vi.fn(() => false),
  }
}

describe('TurretSession', () => {
  let deps: ReturnType<typeof makeDeps>
  let session: TurretSession
  beforeEach(() => {
    deps = makeDeps()
    session = new TurretSession(deps)
  })

  it('starts idle with 0 fade opacity', () => {
    expect(session.phase).toBe('idle')
    expect(session.fadeOpacity).toBe(0)
    expect(session.isActive).toBe(false)
  })

  it('open() transitions idle to opening and invokes onOpen', () => {
    session.open()
    expect(session.phase).toBe('opening')
    expect(session.isActive).toBe(true)
    expect(deps.onOpen).toHaveBeenCalledTimes(1)
  })

  it('tick advances fade during opening and promotes to active at threshold', () => {
    session.open()
    session.tick(TURRET_FADE_IN_DURATION, { exitPressed: false })
    expect(session.phase).toBe('active')
    expect(session.fadeOpacity).toBeGreaterThanOrEqual(TURRET_OPENING_COMPLETE_THRESHOLD)
  })

  it('calls tickActive only while phase is active', () => {
    session.open()
    session.tick(TURRET_FADE_IN_DURATION, { exitPressed: false })
    expect(session.phase).toBe('active')
    session.tick(0.016, { exitPressed: false })
    expect(deps.tickActive).toHaveBeenCalledTimes(1)
  })

  it('exitPressed during active transitions to closing', () => {
    session.open()
    session.tick(TURRET_FADE_IN_DURATION, { exitPressed: false })
    session.tick(0.016, { exitPressed: true })
    expect(session.phase).toBe('closing')
  })

  it('closing fades out and transitions to idle + invokes onClose', () => {
    session.open()
    session.tick(TURRET_FADE_IN_DURATION, { exitPressed: false })
    session.tick(0.016, { exitPressed: true })
    expect(session.phase).toBe('closing')
    session.tick(TURRET_FADE_OUT_DURATION, { exitPressed: false })
    expect(session.phase).toBe('idle')
    expect(session.isActive).toBe(false)
    expect(session.fadeOpacity).toBeLessThanOrEqual(TURRET_CLOSING_COMPLETE_THRESHOLD)
    expect(deps.onClose).toHaveBeenCalledTimes(1)
  })

  it('shuttle death forces closing from active', () => {
    session.open()
    session.tick(TURRET_FADE_IN_DURATION, { exitPressed: false })
    deps.shuttleIsDead.mockReturnValue(true)
    session.tick(0.016, { exitPressed: false })
    expect(session.phase).toBe('closing')
  })

  it('open() is no-op while already active', () => {
    session.open()
    session.tick(TURRET_FADE_IN_DURATION, { exitPressed: false })
    session.open()
    expect(deps.onOpen).toHaveBeenCalledTimes(1)
    expect(session.phase).toBe('active')
  })
})
