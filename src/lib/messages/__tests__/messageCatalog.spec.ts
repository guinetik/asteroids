import { describe, expect, it } from 'vitest'
import { SHIP_MESSAGE_CATALOG } from '../messageCatalog'
import { MessageSystem } from '../messageSystem'

describe('SHIP_MESSAGE_CATALOG', () => {
  it('includes Marta audio on the startup seller message', () => {
    const startup = SHIP_MESSAGE_CATALOG.find(
      (message) => message.id === 'seller-welcome-earth-orbit',
    )

    expect(startup?.audioUrl).toBe('/sound/marta-001.mp3')
    expect(startup?.enqueueOnDismiss).toEqual(['jay-so-you-actually-did-it'])
    expect(startup?.enqueueOnDismissDelaySeconds).toBeUndefined()
  })

  it('includes the Jay startup follow-up with audio', () => {
    const followUp = SHIP_MESSAGE_CATALOG.find(
      (message) => message.id === 'jay-so-you-actually-did-it',
    )

    expect(followUp).toMatchObject({
      from: 'Jay Mercer',
      subject: 'So You Actually Did It',
      audioUrl: '/sound/jay-001.mp3',
      delivery: 'inbox_prompt',
    })
  })

  it('includes Jay brake guidance for the first brake-system use', () => {
    const system = new MessageSystem(SHIP_MESSAGE_CATALOG, {
      load: () => ({}),
      save: () => {},
    })

    system.notifyTrigger('map_brake_used')

    expect(system.getActiveMessage()).toMatchObject({
      id: 'jay-brake-system-warning',
      trigger: 'map_brake_used',
      delivery: 'inbox_prompt',
      from: 'Jay Mercer',
    })
  })
})
