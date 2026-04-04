import { describe, it, expect, beforeEach } from 'vitest'
import { VibePortal } from '../portal'

function setSearch(search: string) {
  Object.defineProperty(window, 'location', {
    value: { search, host: 'mygame.com', href: '' },
    writable: true,
  })
}

describe('VibePortal', () => {
  beforeEach(() => setSearch(''))

  describe('arrival parsing', () => {
    it('parses all known params', () => {
      setSearch(
        '?portal=true&ref=othergame.com&username=player1&color=red' +
          '&speed=5&speed_x=1.2&speed_y=-3.4&speed_z=0' +
          '&rotation_x=0.5&rotation_y=1.0&rotation_z=3.14' +
          '&avatar_url=https://img.com/a.png&team=blue&hp=75',
      )
      const portal = new VibePortal()

      expect(portal.isArrival).toBe(true)
      expect(portal.arrival.portal).toBe(true)
      expect(portal.arrival.ref).toBe('othergame.com')
      expect(portal.arrival.username).toBe('player1')
      expect(portal.arrival.color).toBe('red')
      expect(portal.arrival.speed).toBe(5)
      expect(portal.arrival.speed_x).toBe(1.2)
      expect(portal.arrival.speed_y).toBe(-3.4)
      expect(portal.arrival.speed_z).toBe(0)
      expect(portal.arrival.rotation_x).toBe(0.5)
      expect(portal.arrival.rotation_y).toBe(1.0)
      expect(portal.arrival.rotation_z).toBe(3.14)
      expect(portal.arrival.avatar_url).toBe('https://img.com/a.png')
      expect(portal.arrival.team).toBe('blue')
      expect(portal.arrival.hp).toBe(75)
    })

    it('parses partial params', () => {
      setSearch('?portal=true&ref=somegame.com')
      const portal = new VibePortal()

      expect(portal.isArrival).toBe(true)
      expect(portal.arrival.ref).toBe('somegame.com')
      expect(portal.arrival.username).toBeUndefined()
      expect(portal.arrival.speed).toBeUndefined()
    })

    it('handles no params', () => {
      setSearch('')
      const portal = new VibePortal()

      expect(portal.isArrival).toBe(false)
      expect(portal.arrival.portal).toBe(false)
      expect(portal.arrival.ref).toBeUndefined()
    })

    it('stores custom params in the params map', () => {
      setSearch('?portal=true&custom_key=custom_value&another=123')
      const portal = new VibePortal()

      expect(portal.params.get('custom_key')).toBe('custom_value')
      expect(portal.params.get('another')).toBe('123')
    })

    it('returns undefined for NaN numeric params', () => {
      setSearch('?speed=abc&hp=0')
      const portal = new VibePortal()

      expect(portal.arrival.speed).toBeUndefined()
      expect(portal.arrival.hp).toBe(0)
    })

    it('preserves empty string params', () => {
      setSearch('?username=&color=red')
      const portal = new VibePortal()

      expect(portal.arrival.username).toBe('')
      expect(portal.arrival.color).toBe('red')
    })
  })
})
