/**
 * Tests for the /station route guard.
 *
 * @author guinetik
 * @date 2026-05-12
 */
import { describe, it, expect } from 'vitest'
import { canAccessStationRoute } from '../stationRouteAccess'

describe('canAccessStationRoute', () => {
  it('allows entry when dev=true is set', () => {
    expect(canAccessStationRoute({ dev: 'true', station: 'yamada-titania' })).toBe(true)
  })

  it('allows entry for a known station id', () => {
    expect(canAccessStationRoute({ station: 'yamada-titania' })).toBe(true)
  })

  it('denies entry when station id is unknown', () => {
    expect(canAccessStationRoute({ station: 'mystery' })).toBe(false)
  })

  it('denies entry when station param is missing', () => {
    expect(canAccessStationRoute({})).toBe(false)
  })
})
