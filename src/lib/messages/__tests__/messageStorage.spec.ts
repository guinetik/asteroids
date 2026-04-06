import { beforeEach, describe, expect, it } from 'vitest'
import {
  SHIP_MESSAGE_STORAGE_KEY,
  loadMessageRecords,
  saveMessageRecords,
} from '../messageStorage'
import type { ShipMessageRecord } from '../messageTypes'

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

describe('loadMessageRecords', () => {
  it('returns an empty object when storage is empty', () => {
    expect(loadMessageRecords()).toEqual({})
  })

  it('returns an empty object when storage contains invalid JSON', () => {
    mockStorage[SHIP_MESSAGE_STORAGE_KEY] = '{not-valid-json'
    expect(loadMessageRecords()).toEqual({})
  })

  it('returns an empty object when storage contains a non-object JSON root', () => {
    mockStorage[SHIP_MESSAGE_STORAGE_KEY] = '[]'
    expect(loadMessageRecords()).toEqual({})
  })
})

describe('saveMessageRecords', () => {
  it('round-trips message records through localStorage', () => {
    const records: Record<string, ShipMessageRecord> = {
      'seller-welcome': {
        id: 'seller-welcome',
        status: 'dismissed',
        shownAt: '2306-04-05T08:00:00.000Z',
        dismissedAt: '2306-04-05T08:05:00.000Z',
      },
    }

    saveMessageRecords(records)

    expect(loadMessageRecords()).toEqual(records)
  })

  it('stores the payload under the ship-message key', () => {
    saveMessageRecords({})
    expect(mockStorage[SHIP_MESSAGE_STORAGE_KEY]).toBeDefined()
  })
})
