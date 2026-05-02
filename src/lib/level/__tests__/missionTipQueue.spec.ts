import { describe, expect, it } from 'vitest'
import type { MissionTipTransmission } from '@/lib/level/missionTips'
import {
  getVisibleMissionTips,
  getVisibleMissionTipsForView,
  pushMissionTipQueue,
  removeMissionTipQueueEntry,
} from '@/lib/level/missionTipQueue'

function tip(id: string, view: MissionTipTransmission['view'] = 'fps'): MissionTipTransmission {
  return {
    id,
    speaker: 'Jay',
    channel: 'TEST',
    view,
    tone: 'logistics',
    message: id,
    objectiveType: 'gather',
  }
}

describe('missionTipQueue', () => {
  it('keeps two transmissions visible and one hidden in reserve', () => {
    let queue: MissionTipTransmission[] = []
    queue = pushMissionTipQueue(queue, tip('one'))
    queue = pushMissionTipQueue(queue, tip('two'))
    queue = pushMissionTipQueue(queue, tip('three'))

    expect(queue.map((entry) => entry.id)).toEqual(['one', 'two', 'three'])
    expect(getVisibleMissionTips(queue).map((entry) => entry.id)).toEqual(['one', 'two'])
  })

  it('drops the oldest entry when a fourth tip arrives', () => {
    let queue: MissionTipTransmission[] = [tip('one'), tip('two'), tip('three')]
    queue = pushMissionTipQueue(queue, tip('four'))

    expect(queue.map((entry) => entry.id)).toEqual(['two', 'three', 'four'])
    expect(getVisibleMissionTips(queue).map((entry) => entry.id)).toEqual(['two', 'three'])
  })

  it('does not duplicate active transmissions', () => {
    const queue = pushMissionTipQueue([tip('one')], tip('one'))

    expect(queue.map((entry) => entry.id)).toEqual(['one'])
  })

  it('removes entries by id', () => {
    const queue = removeMissionTipQueueEntry([tip('one'), tip('two')], 'one')

    expect(queue.map((entry) => entry.id)).toEqual(['two'])
  })

  it('filters by gameplay view before reserving the two visible slots', () => {
    const queue = [tip('first-run-lander', 'lander'), tip('objective-gather'), tip('rtg-low')]

    expect(getVisibleMissionTipsForView(queue, 'fps').map((entry) => entry.id)).toEqual([
      'objective-gather',
      'rtg-low',
    ])
  })
})
