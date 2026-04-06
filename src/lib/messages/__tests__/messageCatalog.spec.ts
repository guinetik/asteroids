import { describe, expect, it } from 'vitest'
import { SHIP_MESSAGE_CATALOG } from '../messageCatalog'
import { MessageSystem } from '../messageSystem'

describe('SHIP_MESSAGE_CATALOG', () => {
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
