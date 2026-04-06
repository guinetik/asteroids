import { beforeEach, describe, expect, it } from 'vitest'
import { MessageSystem } from '../messageSystem'
import type { ShipMessageDefinition, ShipMessageRecord } from '../messageTypes'

const definitions: ShipMessageDefinition[] = [
  {
    id: 'low-priority',
    from: 'Dispatch',
    subject: 'Low priority',
    sentAt: '2306-04-05 08:00 UTC',
    body: ['Low priority message body.'],
    trigger: 'map_start_earth_orbit',
    delivery: 'blocking_intro',
    priority: 10,
  },
  {
    id: 'high-priority',
    from: 'Dispatch',
    subject: 'High priority',
    sentAt: '2306-04-05 08:01 UTC',
    body: ['High priority message body.'],
    trigger: 'map_start_earth_orbit',
    delivery: 'blocking_intro',
    priority: 100,
  },
  {
    id: 'fuel-tip',
    from: 'Jay',
    subject: 'Fuel tip',
    sentAt: '2306-04-05 08:02 UTC',
    body: ['Hey, you got Jay.'],
    trigger: 'map_main_thruster_depleted',
    delivery: 'inbox_prompt',
    priority: 50,
  },
]

let savedRecords: Record<string, ShipMessageRecord> = {}

beforeEach(() => {
  savedRecords = {}
})

function createSystem(initialRecords: Record<string, ShipMessageRecord> = {}): MessageSystem {
  return new MessageSystem(definitions, {
    load: () => initialRecords,
    save: (records) => {
      savedRecords = structuredClone(records)
    },
  })
}

describe('MessageSystem.notifyTrigger', () => {
  it('creates an active pending message when a matching trigger fires', () => {
    const system = createSystem()

    system.notifyTrigger('map_start_earth_orbit')

    expect(system.getActiveMessage()).toMatchObject({
      id: 'high-priority',
      status: 'pending',
    })
  })

  it('chooses the highest-priority eligible message', () => {
    const system = createSystem()

    system.notifyTrigger('map_start_earth_orbit')

    expect(system.getActiveMessage()?.id).toBe('high-priority')
  })
})

describe('MessageSystem.markShown', () => {
  it('transitions the active message from pending to shown', () => {
    const system = createSystem()

    system.notifyTrigger('map_start_earth_orbit')
    system.markShown('high-priority')

    expect(system.getActiveMessage()).toMatchObject({
      id: 'high-priority',
      status: 'shown',
    })
  })
})

describe('MessageSystem.getPendingMessageCount', () => {
  it('counts pending messages across different triggers', () => {
    const system = createSystem()

    system.notifyTrigger('map_start_earth_orbit')
    system.notifyTrigger('map_main_thruster_depleted')

    expect(system.getPendingMessageCount()).toBe(2)
  })

  it('does not count shown messages as pending', () => {
    const system = createSystem()

    system.notifyTrigger('map_start_earth_orbit')
    system.markShown('high-priority')

    expect(system.getPendingMessageCount()).toBe(0)
  })
})

describe('MessageSystem.dismiss', () => {
  it('persists dismissal and clears the active message', () => {
    const system = createSystem()

    system.notifyTrigger('map_start_earth_orbit')
    system.dismiss('high-priority')

    expect(system.getActiveMessage()).toBeNull()
    expect(savedRecords['high-priority']).toMatchObject({
      id: 'high-priority',
      status: 'dismissed',
    })
  })

  it('does not re-surface a dismissed message after reload', () => {
    const reloaded = createSystem({
      'high-priority': {
        id: 'high-priority',
        status: 'dismissed',
        shownAt: '2306-04-05T08:00:00.000Z',
        dismissedAt: '2306-04-05T08:05:00.000Z',
      },
    })

    reloaded.notifyTrigger('map_start_earth_orbit')

    expect(reloaded.getActiveMessage()?.id).toBe('low-priority')
  })
})
