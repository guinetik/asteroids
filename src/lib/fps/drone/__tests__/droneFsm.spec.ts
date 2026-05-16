import { describe, it, expect } from 'vitest'
import { DroneFsm } from '../droneFsm'
import {
  DRONE_ALERT_SECONDS,
  DRONE_COOLING_SECONDS,
  DRONE_DETECT_RANGE,
  DRONE_DETECT_RANGE_HYSTERESIS,
} from '../droneConfig'

const FAR_DIST = DRONE_DETECT_RANGE_HYSTERESIS + 5
const CLOSE_DIST = DRONE_DETECT_RANGE - 1

describe('DroneFsm', () => {
  it('starts in patrolling', () => {
    const fsm = new DroneFsm()
    expect(fsm.state).toBe('patrolling')
  })

  it('stays patrolling when player is out of detect range', () => {
    const fsm = new DroneFsm()
    const intent = fsm.tick({
      dt: 0.1,
      distanceToPlayer: FAR_DIST,
      hasLineOfSight: true,
      isAlive: true,
    })
    expect(fsm.state).toBe('patrolling')
    expect(intent.wantsToFire).toBe(false)
    expect(intent.shouldAlertColor).toBe(false)
    expect(intent.shouldFacePlayer).toBe(false)
  })

  it('stays patrolling when LOS is blocked even at close range', () => {
    const fsm = new DroneFsm()
    fsm.tick({
      dt: 0.1,
      distanceToPlayer: CLOSE_DIST,
      hasLineOfSight: false,
      isAlive: true,
    })
    expect(fsm.state).toBe('patrolling')
  })

  it('transitions patrolling → alerting when player is in range with LOS', () => {
    const fsm = new DroneFsm()
    const intent = fsm.tick({
      dt: 0.016,
      distanceToPlayer: CLOSE_DIST,
      hasLineOfSight: true,
      isAlive: true,
    })
    expect(fsm.state).toBe('alerting')
    expect(intent.shouldAlertColor).toBe(true)
    expect(intent.shouldFacePlayer).toBe(true)
    expect(intent.wantsToFire).toBe(false)
  })

  it('transitions alerting → firing after DRONE_ALERT_SECONDS', () => {
    const fsm = new DroneFsm()
    fsm.tick({
      dt: 0.016,
      distanceToPlayer: CLOSE_DIST,
      hasLineOfSight: true,
      isAlive: true,
    })
    expect(fsm.state).toBe('alerting')

    // Burn the alert duration.
    const intent = fsm.tick({
      dt: DRONE_ALERT_SECONDS + 0.001,
      distanceToPlayer: CLOSE_DIST,
      hasLineOfSight: true,
      isAlive: true,
    })
    expect(fsm.state).toBe('firing')
    expect(intent.wantsToFire).toBe(true)
    expect(intent.shouldAlertColor).toBe(true)
  })

  it('transitions firing → cooling on LOS loss', () => {
    const fsm = new DroneFsm()
    // Get to firing.
    fsm.tick({
      dt: 0.016,
      distanceToPlayer: CLOSE_DIST,
      hasLineOfSight: true,
      isAlive: true,
    })
    fsm.tick({
      dt: DRONE_ALERT_SECONDS + 0.001,
      distanceToPlayer: CLOSE_DIST,
      hasLineOfSight: true,
      isAlive: true,
    })
    expect(fsm.state).toBe('firing')

    const intent = fsm.tick({
      dt: 0.016,
      distanceToPlayer: CLOSE_DIST,
      hasLineOfSight: false,
      isAlive: true,
    })
    expect(fsm.state).toBe('cooling')
    expect(intent.wantsToFire).toBe(false)
    expect(intent.shouldFacePlayer).toBe(true)
    expect(intent.shouldAlertColor).toBe(false)
  })

  it('transitions firing → cooling when distance exceeds hysteresis', () => {
    const fsm = new DroneFsm()
    fsm.tick({
      dt: 0.016,
      distanceToPlayer: CLOSE_DIST,
      hasLineOfSight: true,
      isAlive: true,
    })
    fsm.tick({
      dt: DRONE_ALERT_SECONDS + 0.001,
      distanceToPlayer: CLOSE_DIST,
      hasLineOfSight: true,
      isAlive: true,
    })
    expect(fsm.state).toBe('firing')

    fsm.tick({
      dt: 0.016,
      distanceToPlayer: DRONE_DETECT_RANGE_HYSTERESIS + 0.5,
      hasLineOfSight: true,
      isAlive: true,
    })
    expect(fsm.state).toBe('cooling')
  })

  it('transitions cooling → patrolling after timeout if player still far', () => {
    const fsm = new DroneFsm()
    // patrolling → alerting → cooling (via LOS loss).
    fsm.tick({
      dt: 0.016,
      distanceToPlayer: CLOSE_DIST,
      hasLineOfSight: true,
      isAlive: true,
    })
    fsm.tick({
      dt: 0.016,
      distanceToPlayer: CLOSE_DIST,
      hasLineOfSight: false,
      isAlive: true,
    })
    expect(fsm.state).toBe('cooling')

    fsm.tick({
      dt: DRONE_COOLING_SECONDS + 0.001,
      distanceToPlayer: FAR_DIST,
      hasLineOfSight: false,
      isAlive: true,
    })
    expect(fsm.state).toBe('patrolling')
  })

  it('cooling re-acquires player by going back to alerting after timeout', () => {
    const fsm = new DroneFsm()
    fsm.tick({
      dt: 0.016,
      distanceToPlayer: CLOSE_DIST,
      hasLineOfSight: true,
      isAlive: true,
    })
    fsm.tick({
      dt: 0.016,
      distanceToPlayer: CLOSE_DIST,
      hasLineOfSight: false,
      isAlive: true,
    })
    expect(fsm.state).toBe('cooling')

    fsm.tick({
      dt: DRONE_COOLING_SECONDS + 0.001,
      distanceToPlayer: CLOSE_DIST,
      hasLineOfSight: true,
      isAlive: true,
    })
    expect(fsm.state).toBe('alerting')
  })

  it('death is terminal from any state', () => {
    const fsm = new DroneFsm()
    fsm.tick({
      dt: 0.016,
      distanceToPlayer: CLOSE_DIST,
      hasLineOfSight: true,
      isAlive: true,
    })
    expect(fsm.state).toBe('alerting')

    const intent = fsm.tick({
      dt: 0.016,
      distanceToPlayer: CLOSE_DIST,
      hasLineOfSight: true,
      isAlive: false,
    })
    expect(fsm.state).toBe('dead')
    expect(intent.wantsToFire).toBe(false)
    expect(intent.shouldAlertColor).toBe(false)
    expect(intent.shouldFacePlayer).toBe(false)

    // Even with alive=true again, state is sticky in dead.
    fsm.tick({
      dt: 0.016,
      distanceToPlayer: CLOSE_DIST,
      hasLineOfSight: true,
      isAlive: false,
    })
    expect(fsm.state).toBe('dead')
  })
})
