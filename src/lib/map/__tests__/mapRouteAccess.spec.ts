import { describe, it, expect, beforeEach } from 'vitest'
import { canAccessMapRoute } from '../mapRouteAccess'
import { saveProfile, createProfile, PROFILE_STORAGE_KEY } from '@/lib/player/profile'

const mockStorage: Record<string, string> = {}

beforeEach(() => {
  for (const key of Object.keys(mockStorage)) {
    delete mockStorage[key]
  }
  Object.defineProperty(window, 'localStorage', {
    value: {
      getItem: (key: string) => mockStorage[key] ?? null,
      setItem: (key: string, value: string) => {
        mockStorage[key] = value
      },
      removeItem: (key: string) => {
        delete mockStorage[key]
      },
    },
    writable: true,
  })
})

describe('canAccessMapRoute', () => {
  it('denies when profile is missing', () => {
    expect(canAccessMapRoute()).toBe(false)
  })

  it('denies when profile JSON is invalid', () => {
    mockStorage[PROFILE_STORAGE_KEY] = 'not-json'
    expect(canAccessMapRoute()).toBe(false)
  })

  it('allows when a valid profile is stored', () => {
    saveProfile(createProfile('Test'))
    expect(canAccessMapRoute()).toBe(true)
  })
})
