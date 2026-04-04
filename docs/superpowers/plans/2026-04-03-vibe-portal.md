# Vibe Portal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement `VibePortal` — a self-contained, zero-dependency TypeScript module for the Vibe Coding Game Jam 2026 portal system.

**Architecture:** Single class in `src/lib/portal.ts` handles URL param parsing (incoming), URL building (outgoing), and navigation. The game triggers portal transitions; the module handles the plumbing. TDD — tests first.

**Tech Stack:** TypeScript, Vitest, browser URLSearchParams/URL APIs.

---

### File Map

- Create: `src/lib/portal.ts` — the module (class, types, constants)
- Create: `src/lib/__tests__/portal.spec.ts` — all tests

---

### Task 1: Types and Constants

**Files:**
- Create: `src/lib/portal.ts`

- [ ] **Step 1: Create the file with types and constants**

```ts
export const VIBE_JAM_PORTAL_URL = 'https://jam.pieter.com/portal/2026'

const NUMERIC_PARAMS = new Set([
  'speed',
  'speed_x',
  'speed_y',
  'speed_z',
  'rotation_x',
  'rotation_y',
  'rotation_z',
  'hp',
])

export interface VibeJamParams {
  portal: boolean
  ref?: string
  username?: string
  color?: string
  speed?: number
  speed_x?: number
  speed_y?: number
  speed_z?: number
  rotation_x?: number
  rotation_y?: number
  rotation_z?: number
  avatar_url?: string
  team?: string
  hp?: number
}
```

- [ ] **Step 2: Verify it compiles**

Run: `bun run type-check`
Expected: PASS (no errors)

- [ ] **Step 3: Commit**

```bash
git add src/lib/portal.ts
git commit -m "feat(portal): add VibeJamParams type and constants"
```

---

### Task 2: Arrival Parsing — Tests First

**Files:**
- Create: `src/lib/__tests__/portal.spec.ts`
- Modify: `src/lib/portal.ts`

- [ ] **Step 1: Write failing tests for arrival parsing**

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { VibePortal } from '../portal'

function setSearch(search: string) {
  Object.defineProperty(window, 'location', {
    value: { search, host: 'mygame.com', href: '' },
    writable: true,
  })
}

describe('VibePortal', () => {
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test:unit src/lib/__tests__/portal.spec.ts`
Expected: FAIL — `VibePortal` is not exported / not a constructor

- [ ] **Step 3: Implement the VibePortal class with arrival parsing**

Add to `src/lib/portal.ts` after the existing types and constants:

```ts
export class VibePortal {
  public readonly arrival: VibeJamParams
  public readonly isArrival: boolean
  public readonly params: Map<string, string>

  constructor() {
    const searchParams = new URLSearchParams(window.location.search)

    this.params = new Map<string, string>()
    for (const [key, value] of searchParams) {
      this.params.set(key, value)
    }

    this.arrival = VibePortal.parseParams(searchParams)
    this.isArrival = this.arrival.portal
  }

  private static parseParams(searchParams: URLSearchParams): VibeJamParams {
    const get = (key: string): string | undefined => {
      const value = searchParams.get(key)
      return value === null ? undefined : value
    }

    const getNumber = (key: string): number | undefined => {
      const raw = get(key)
      if (raw === undefined) return undefined
      const num = Number(raw)
      return Number.isNaN(num) ? undefined : num
    }

    return {
      portal: searchParams.get('portal') === 'true',
      ref: get('ref'),
      username: get('username'),
      color: get('color'),
      speed: getNumber('speed'),
      speed_x: getNumber('speed_x'),
      speed_y: getNumber('speed_y'),
      speed_z: getNumber('speed_z'),
      rotation_x: getNumber('rotation_x'),
      rotation_y: getNumber('rotation_y'),
      rotation_z: getNumber('rotation_z'),
      avatar_url: get('avatar_url'),
      team: get('team'),
      hp: getNumber('hp'),
    }
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test:unit src/lib/__tests__/portal.spec.ts`
Expected: All 6 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/portal.ts src/lib/__tests__/portal.spec.ts
git commit -m "feat(portal): implement arrival parsing with tests"
```

---

### Task 3: Depart — Tests First

**Files:**
- Modify: `src/lib/__tests__/portal.spec.ts`
- Modify: `src/lib/portal.ts`

- [ ] **Step 1: Write failing tests for depart**

Add to `portal.spec.ts` inside the top-level `describe('VibePortal')`:

```ts
  describe('depart', () => {
    it('navigates to jam portal with player state', () => {
      setSearch('')
      const portal = new VibePortal()
      portal.depart({ username: 'player1', color: 'red', speed: 5 })

      const url = new URL(window.location.href)
      expect(url.origin + url.pathname).toBe('https://jam.pieter.com/portal/2026')
      expect(url.searchParams.get('portal')).toBe('true')
      expect(url.searchParams.get('ref')).toBe('mygame.com')
      expect(url.searchParams.get('username')).toBe('player1')
      expect(url.searchParams.get('color')).toBe('red')
      expect(url.searchParams.get('speed')).toBe('5')
    })

    it('departs with minimal state', () => {
      setSearch('')
      const portal = new VibePortal()
      portal.depart({})

      const url = new URL(window.location.href)
      expect(url.searchParams.get('portal')).toBe('true')
      expect(url.searchParams.get('ref')).toBe('mygame.com')
    })

    it('passes through custom params', () => {
      setSearch('')
      const portal = new VibePortal()
      portal.depart({ username: 'p1', custom_thing: 'hello' })

      const url = new URL(window.location.href)
      expect(url.searchParams.get('custom_thing')).toBe('hello')
    })

    it('encodes special characters', () => {
      setSearch('')
      const portal = new VibePortal()
      portal.depart({ username: 'player one&two' })

      const url = new URL(window.location.href)
      expect(url.searchParams.get('username')).toBe('player one&two')
    })
  })
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test:unit src/lib/__tests__/portal.spec.ts`
Expected: FAIL — `portal.depart is not a function`

- [ ] **Step 3: Implement depart**

Add to the `VibePortal` class in `src/lib/portal.ts`:

```ts
  depart(state: Partial<VibeJamParams> & Record<string, string | number>): void {
    const url = new URL(VIBE_JAM_PORTAL_URL)
    url.searchParams.set('portal', 'true')
    url.searchParams.set('ref', window.location.host)

    for (const [key, value] of Object.entries(state)) {
      if (key === 'portal') continue
      url.searchParams.set(key, String(value))
    }

    window.location.href = url.toString()
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test:unit src/lib/__tests__/portal.spec.ts`
Expected: All 10 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/portal.ts src/lib/__tests__/portal.spec.ts
git commit -m "feat(portal): implement depart with tests"
```

---

### Task 4: Return to Origin — Tests First

**Files:**
- Modify: `src/lib/__tests__/portal.spec.ts`
- Modify: `src/lib/portal.ts`

- [ ] **Step 1: Write failing tests for returnToOrigin**

Add to `portal.spec.ts` inside the top-level `describe('VibePortal')`:

```ts
  describe('returnToOrigin', () => {
    it('navigates back to ref and returns true', () => {
      setSearch('?portal=true&ref=othergame.com')
      const portal = new VibePortal()
      const result = portal.returnToOrigin({ username: 'player1', speed: 3 })

      expect(result).toBe(true)
      const url = new URL(window.location.href)
      expect(url.origin).toBe('https://othergame.com')
      expect(url.searchParams.get('portal')).toBe('true')
      expect(url.searchParams.get('username')).toBe('player1')
      expect(url.searchParams.get('speed')).toBe('3')
    })

    it('returns false when no ref is present', () => {
      setSearch('?portal=true')
      const portal = new VibePortal()
      const hrefBefore = window.location.href
      const result = portal.returnToOrigin({ username: 'player1' })

      expect(result).toBe(false)
      expect(window.location.href).toBe(hrefBefore)
    })

    it('prepends https:// when ref has no protocol', () => {
      setSearch('?portal=true&ref=othergame.com')
      const portal = new VibePortal()
      portal.returnToOrigin()

      const url = new URL(window.location.href)
      expect(url.protocol).toBe('https:')
      expect(url.host).toBe('othergame.com')
    })

    it('preserves protocol when ref already has one', () => {
      setSearch('?portal=true&ref=https://othergame.com')
      const portal = new VibePortal()
      portal.returnToOrigin()

      const url = new URL(window.location.href)
      expect(url.protocol).toBe('https:')
      expect(url.host).toBe('othergame.com')
    })

    it('works with no state argument', () => {
      setSearch('?portal=true&ref=othergame.com')
      const portal = new VibePortal()
      const result = portal.returnToOrigin()

      expect(result).toBe(true)
      const url = new URL(window.location.href)
      expect(url.searchParams.get('portal')).toBe('true')
    })
  })
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test:unit src/lib/__tests__/portal.spec.ts`
Expected: FAIL — `portal.returnToOrigin is not a function`

- [ ] **Step 3: Implement returnToOrigin**

Add to the `VibePortal` class in `src/lib/portal.ts`:

```ts
  returnToOrigin(state?: Partial<VibeJamParams> & Record<string, string | number>): boolean {
    const ref = this.arrival.ref
    if (!ref) return false

    const baseUrl = ref.startsWith('http://') || ref.startsWith('https://') ? ref : `https://${ref}`
    const url = new URL(baseUrl)
    url.searchParams.set('portal', 'true')

    if (state) {
      for (const [key, value] of Object.entries(state)) {
        if (key === 'portal') continue
        url.searchParams.set(key, String(value))
      }
    }

    window.location.href = url.toString()
    return true
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test:unit src/lib/__tests__/portal.spec.ts`
Expected: All 15 tests PASS

- [ ] **Step 5: Run type-check**

Run: `bun run type-check`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/lib/portal.ts src/lib/__tests__/portal.spec.ts
git commit -m "feat(portal): implement returnToOrigin with tests"
```

---

### Task 5: Final Verification

**Files:** None (verification only)

- [ ] **Step 1: Run the full test suite**

Run: `bun test:unit`
Expected: All tests PASS (portal tests + existing App.spec.ts)

- [ ] **Step 2: Run lint**

Run: `bun lint`
Expected: PASS (or auto-fixed)

- [ ] **Step 3: Run build**

Run: `bun run build`
Expected: PASS

- [ ] **Step 4: Commit any lint fixes**

If lint auto-fixed anything:
```bash
git add src/lib/portal.ts src/lib/__tests__/portal.spec.ts
git commit -m "style(portal): apply lint fixes"
```
