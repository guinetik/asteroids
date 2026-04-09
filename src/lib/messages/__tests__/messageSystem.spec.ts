import { Timer } from '@/lib/Timer'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
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
  {
    id: 'follow-up',
    from: 'Jay',
    subject: 'Follow up',
    sentAt: '2306-04-05 08:03 UTC',
    body: ['Second message body.'],
    trigger: 'map_brake_used',
    delivery: 'inbox_prompt',
    priority: 40,
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

  it('prefers unread pending messages over older shown messages', () => {
    const system = createSystem()

    system.notifyTrigger('map_start_earth_orbit')
    system.markShown('high-priority')
    system.notifyTrigger('map_main_thruster_depleted')

    expect(system.getActiveMessage()).toMatchObject({
      id: 'fuel-tip',
      status: 'pending',
    })
  })

  it('does not enqueue follow-ups on show when the parent uses enqueueOnDismiss', () => {
    const system = new MessageSystem(
      definitions.map((definition) =>
        definition.id === 'high-priority'
          ? { ...definition, enqueueOnDismiss: ['follow-up'] }
          : { ...definition },
      ),
      {
        load: () => ({}),
        save: (records) => {
          savedRecords = structuredClone(records)
        },
      },
    )

    system.notifyTrigger('map_start_earth_orbit')
    system.markShown('high-priority')

    expect(system.getRecord('follow-up')).toBeNull()
  })
})

describe('MessageSystem.enqueueOnDismiss', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    Timer.cancelAll()
  })

  it('enqueues follow-up messages immediately when no delay is set', () => {
    const system = new MessageSystem(
      definitions.map((definition) =>
        definition.id === 'high-priority'
          ? { ...definition, enqueueOnDismiss: ['follow-up'] }
          : { ...definition },
      ),
      {
        load: () => ({}),
        save: (records) => {
          savedRecords = structuredClone(records)
        },
      },
    )

    system.notifyTrigger('map_start_earth_orbit')
    system.markShown('high-priority')
    system.dismiss('high-priority')

    const rows = system.listInboxRows().map((row) => row.id)
    expect(rows).toContain('follow-up')
    expect(system.getRecord('follow-up')).toMatchObject({
      id: 'follow-up',
      status: 'pending',
    })
  })

  it('schedules follow-ups after enqueueOnDismissDelaySeconds', () => {
    let scheduled: (() => void) | null = null
    vi.spyOn(Timer, 'after').mockImplementation((delaySec, fn) => {
      expect(delaySec).toBe(12)
      scheduled = fn
      return 42
    })

    const system = new MessageSystem(
      definitions.map((definition) =>
        definition.id === 'high-priority'
          ? {
              ...definition,
              enqueueOnDismiss: ['follow-up'],
              enqueueOnDismissDelaySeconds: 12,
            }
          : { ...definition },
      ),
      {
        load: () => ({}),
        save: (records) => {
          savedRecords = structuredClone(records)
        },
      },
    )

    system.notifyTrigger('map_start_earth_orbit')
    system.markShown('high-priority')
    system.dismiss('high-priority')

    expect(system.getRecord('follow-up')).toBeNull()
    expect(scheduled).not.toBeNull()
    scheduled!()

    expect(system.getRecord('follow-up')).toMatchObject({
      id: 'follow-up',
      status: 'pending',
    })
  })

  it('invokes onFollowUpsEnqueued when delayed follow-ups are written', () => {
    const hook = vi.fn()
    vi.spyOn(Timer, 'after').mockImplementation((_delaySec, fn) => {
      fn()
      return 1
    })

    const system = new MessageSystem(
      definitions.map((definition) =>
        definition.id === 'high-priority'
          ? {
              ...definition,
              enqueueOnDismiss: ['follow-up'],
              enqueueOnDismissDelaySeconds: 5,
            }
          : { ...definition },
      ),
      { load: () => ({}), save: () => {} },
      { onFollowUpsEnqueued: hook },
    )

    system.notifyTrigger('map_start_earth_orbit')
    system.markShown('high-priority')
    system.dismiss('high-priority')

    expect(hook).toHaveBeenCalledTimes(1)
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

describe('MessageSystem.listInboxRows', () => {
  it('returns no rows until at least one message is delivered', () => {
    const system = createSystem()
    expect(system.listInboxRows()).toHaveLength(0)
  })

  it('lists only definitions that have a persisted record', () => {
    const system = createSystem()
    system.notifyTrigger('map_start_earth_orbit')

    const rows = system.listInboxRows()
    expect(rows).toHaveLength(1)
    expect(rows[0]!.id).toBe('high-priority')
    expect(rows.find((r) => r.id === 'fuel-tip')).toBeUndefined()
  })

  it('reflects pending and shown after triggers and markShown', () => {
    const system = createSystem()
    system.notifyTrigger('map_start_earth_orbit')

    let rows = system.listInboxRows()
    const hi = rows.find((r) => r.id === 'high-priority')
    expect(hi?.status).toBe('pending')
    expect(hi?.isUnread).toBe(true)

    system.markShown('high-priority')
    rows = system.listInboxRows()
    expect(rows.find((r) => r.id === 'high-priority')?.status).toBe('shown')
    expect(rows.find((r) => r.id === 'high-priority')?.isUnread).toBe(false)
  })

  it('includes one row per delivered message when several triggers fired', () => {
    const system = createSystem()
    system.notifyTrigger('map_start_earth_orbit')
    system.notifyTrigger('map_main_thruster_depleted')
    const rows = system.listInboxRows()
    expect(rows).toHaveLength(2)
    const ids = rows.map((r) => r.id).sort()
    expect(ids).toEqual(['fuel-tip', 'high-priority'])
  })
})

describe('MessageSystem.getReadableShipMessage', () => {
  it('returns null when no record exists', () => {
    const system = createSystem()
    expect(system.getReadableShipMessage('high-priority')).toBeNull()
  })

  it('returns body and inboxStatus including dismissed', () => {
    const system = createSystem()
    system.notifyTrigger('map_start_earth_orbit')
    system.markShown('high-priority')
    system.dismiss('high-priority')

    const readable = system.getReadableShipMessage('high-priority')
    expect(readable?.subject).toBe('High priority')
    expect(readable?.inboxStatus).toBe('dismissed')
  })
})
