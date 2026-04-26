import { describe, expect, it } from 'vitest'
import { DepositRocketModel } from '../DepositRocketModel'

describe('DepositRocketModel', () => {
  it('holds on the pad briefly after ignition before climbing away', () => {
    const rocket = new DepositRocketModel()
    rocket.placeAt(4, 8, 12)

    rocket.takeOff()

    const initialY = rocket.group.position.y
    const doneDuringIgnition = rocket.tick(0.2)

    expect(doneDuringIgnition).toBe(false)
    expect(rocket.group.visible).toBe(true)
    expect(rocket.group.position.y).toBe(initialY)

    rocket.tick(0.5)

    expect(rocket.group.position.y).toBeGreaterThan(initialY)
  })

  it('reports completion only after a readable launch window', () => {
    const rocket = new DepositRocketModel()
    rocket.takeOff()

    let done = false
    for (let i = 0; i < 8; i++) {
      done = rocket.tick(0.25)
    }

    expect(done).toBe(false)

    for (let i = 0; i < 24; i++) {
      done = rocket.tick(0.25)
    }

    expect(done).toBe(true)
  })

  it('does not complete early when it crosses the removal height during ignition climb', () => {
    const rocket = new DepositRocketModel()
    rocket.placeAt(0, 0, 119.9)
    rocket.takeOff()

    const done = rocket.tick(0.5)

    expect(done).toBe(false)
  })
})
