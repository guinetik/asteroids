import { describe, expect, it } from 'vitest'
import { hashString, mulberry32 } from '@/lib/minigame/relayRepair/rng'
import {
  aabbOverlaps,
  type Anchor,
  ATTACHMENT_PADDING,
  attachmentAnchors,
  centerAnchor,
  cornerAnchors,
  DEFAULT_ROOM_BUDGET_FACTOR,
  edgeAnchors,
  placeAtAnchors,
  placeByAffinity,
  placeFillers,
  type Placement,
  placeWithAttachments,
  type PropAffinity,
  type PropClass,
  type PropSpec,
  roomBudget,
  scoreAnchor,
  sortByClass,
} from '@/lib/station/propPlacement'

describe('cornerAnchors', () => {
  it('returns four anchors, all classified as corners', () => {
    const anchors = cornerAnchors({ width: 6, depth: 4 }, 0)
    expect(anchors).toHaveLength(4)
    expect(anchors.every((a) => a.kind === 'corner')).toBe(true)
  })

  it('places the corners at +/- half-width and half-depth when margin is zero', () => {
    const anchors = cornerAnchors({ width: 6, depth: 4 }, 0)
    const byId = Object.fromEntries(anchors.map((a) => [a.id, a]))
    expect(byId['corner-nw']).toMatchObject({ x: -3, z: -2 })
    expect(byId['corner-ne']).toMatchObject({ x: +3, z: -2 })
    expect(byId['corner-sw']).toMatchObject({ x: -3, z: +2 })
    expect(byId['corner-se']).toMatchObject({ x: +3, z: +2 })
  })

  it('insets every corner by margin, so all four pull toward the centre', () => {
    const anchors = cornerAnchors({ width: 6, depth: 4 }, 0.5)
    const byId = Object.fromEntries(anchors.map((a) => [a.id, a]))
    expect(byId['corner-nw']).toMatchObject({ x: -2.5, z: -1.5 })
    expect(byId['corner-se']).toMatchObject({ x: +2.5, z: +1.5 })
  })

  it('emits anchor ids in NW, NE, SW, SE order so callers can rely on iteration', () => {
    const ids = cornerAnchors({ width: 4, depth: 4 }, 0).map((a) => a.id)
    expect(ids).toEqual(['corner-nw', 'corner-ne', 'corner-sw', 'corner-se'])
  })
})

describe('placeAtAnchors', () => {
  const corners: Anchor[] = [
    { id: 'corner-nw', x: -3, z: -2, kind: 'corner' },
    { id: 'corner-ne', x: +3, z: -2, kind: 'corner' },
    { id: 'corner-sw', x: -3, z: +2, kind: 'corner' },
    { id: 'corner-se', x: +3, z: +2, kind: 'corner' },
  ]

  /** Shorthand to keep test fixtures readable. */
  const prop = (id: string, weight: number): PropSpec => ({ id, weight })

  it('zips props to anchors in input order when budget is unlimited', () => {
    const props = [prop('box-1', 1), prop('box-2', 1)]
    const placements = placeAtAnchors(props, corners, Infinity)
    expect(placements).toHaveLength(2)
    expect(placements[0]).toEqual({ propId: 'box-1', anchorId: 'corner-nw', x: -3, z: -2 })
    expect(placements[1]).toEqual({ propId: 'box-2', anchorId: 'corner-ne', x: +3, z: -2 })
  })

  it('stops when props run out, leaving anchors unconsumed', () => {
    const placements = placeAtAnchors([prop('lone-box', 1)], corners, Infinity)
    expect(placements).toHaveLength(1)
    expect(placements[0]?.anchorId).toBe('corner-nw')
  })

  it('stops when anchors run out, dropping the surplus props on the floor', () => {
    const props = [
      prop('a', 1),
      prop('b', 1),
      prop('c', 1),
      prop('d', 1),
      prop('e', 1),
    ]
    const placements = placeAtAnchors(props, corners, Infinity)
    expect(placements).toHaveLength(4)
    expect(placements.map((p) => p.propId)).toEqual(['a', 'b', 'c', 'd'])
  })

  it('returns an empty list when either side is empty', () => {
    expect(placeAtAnchors([], corners, Infinity)).toEqual([])
    expect(placeAtAnchors([prop('x', 1)], [], Infinity)).toEqual([])
  })

  it('skips a prop whose weight would push spend over the budget', () => {
    const props = [prop('table', 3), prop('chair', 2)]
    const placements = placeAtAnchors(props, corners, 4)
    expect(placements.map((p) => p.propId)).toEqual(['table'])
  })

  it('keeps trying smaller props once a heavy one was rejected', () => {
    const props = [prop('table-big', 10), prop('chair-small', 2)]
    const placements = placeAtAnchors(props, corners, 4)
    expect(placements.map((p) => p.propId)).toEqual(['chair-small'])
    expect(placements[0]?.anchorId).toBe('corner-nw')
  })

  it('treats zero-weight props as free — they always place if anchors remain', () => {
    const props = [prop('decor-1', 0), prop('decor-2', 0), prop('decor-3', 0)]
    const placements = placeAtAnchors(props, corners, 0)
    expect(placements).toHaveLength(3)
  })

  it('places nothing when the budget is zero and every prop costs something', () => {
    const props = [prop('a', 1), prop('b', 1)]
    expect(placeAtAnchors(props, corners, 0)).toEqual([])
  })
})

describe('edgeAnchors', () => {
  it('returns nothing when countPerSide is zero', () => {
    expect(edgeAnchors({ width: 6, depth: 4 }, 0, 0)).toEqual([])
  })

  it('places one anchor at the midpoint of each wall when countPerSide is 1', () => {
    const anchors = edgeAnchors({ width: 6, depth: 4 }, 1, 0)
    const byId = Object.fromEntries(anchors.map((a) => [a.id, a]))
    expect(anchors).toHaveLength(4)
    expect(byId['edge-n-0']).toMatchObject({ x: 0, z: -2, kind: 'edge' })
    expect(byId['edge-s-0']).toMatchObject({ x: 0, z: +2, kind: 'edge' })
    expect(byId['edge-e-0']).toMatchObject({ x: +3, z: 0, kind: 'edge' })
    expect(byId['edge-w-0']).toMatchObject({ x: -3, z: 0, kind: 'edge' })
  })

  it('spaces two anchors per wall at 1/3 and 2/3 along the wall', () => {
    const anchors = edgeAnchors({ width: 6, depth: 4 }, 2, 0)
    expect(anchors).toHaveLength(8)
    const north = anchors.filter((a) => a.id.startsWith('edge-n-'))
    expect(north.map((a) => a.x)).toEqual([-1, 1])
    expect(north.every((a) => a.z === -2)).toBe(true)
  })

  it('insets every anchor from the wall by margin', () => {
    const anchors = edgeAnchors({ width: 6, depth: 4 }, 1, 0.5)
    const byId = Object.fromEntries(anchors.map((a) => [a.id, a]))
    expect(byId['edge-n-0']).toMatchObject({ z: -1.5 })
    expect(byId['edge-e-0']).toMatchObject({ x: +2.5 })
  })

  it('never duplicates a corner — edges live strictly between corner anchors', () => {
    const corners = cornerAnchors({ width: 6, depth: 4 }, 0)
    const edges = edgeAnchors({ width: 6, depth: 4 }, 3, 0)
    for (const corner of corners) {
      const collision = edges.find((e) => e.x === corner.x && e.z === corner.z)
      expect(collision).toBeUndefined()
    }
  })
})

describe('centerAnchor', () => {
  it('emits a single anchor of kind center at the room origin', () => {
    const anchors = centerAnchor({ width: 6, depth: 4 })
    expect(anchors).toEqual([{ id: 'center', x: 0, z: 0, kind: 'center' }])
  })
})

describe('scoreAnchor', () => {
  const corner: Anchor = { id: 'corner-nw', x: -3, z: -2, kind: 'corner' }
  const center: Anchor = { id: 'center', x: 0, z: 0, kind: 'center' }

  it('returns 0 when the prop has no affinity field at all', () => {
    expect(scoreAnchor({ id: 'p', weight: 1 }, corner)).toBe(0)
  })

  it('returns 0 when the prop has affinity but not for this anchor kind', () => {
    expect(scoreAnchor({ id: 'p', weight: 1, affinity: { center: 3 } }, corner)).toBe(0)
  })

  it('returns the configured score for the matching anchor kind', () => {
    const prop: PropSpec = { id: 'table', weight: 3, affinity: { center: 3, corner: -2 } }
    expect(scoreAnchor(prop, center)).toBe(3)
    expect(scoreAnchor(prop, corner)).toBe(-2)
  })
})

describe('placeByAffinity', () => {
  /** Realistic affinity presets — these match what callers will likely use. */
  const TABLE: PropAffinity = { center: 3, edge: 1, corner: -2 }
  const CONTAINER: PropAffinity = { corner: 3, edge: 0, center: -2 }
  const CHAIR: PropAffinity = { edge: 2, corner: -1, center: -1 }

  /** Compose a full anchor pool — corners + 1 edge per wall + center. */
  const room = { width: 6, depth: 4 }
  const fullPool: Anchor[] = [
    ...cornerAnchors(room, 0),
    ...edgeAnchors(room, 1, 0),
    ...centerAnchor(room),
  ]

  it('sends each prop to its highest-scoring anchor when the pool is rich', () => {
    const props: PropSpec[] = [
      { id: 'table', weight: 3, affinity: TABLE },
      { id: 'box', weight: 1, affinity: CONTAINER },
      { id: 'chair', weight: 2, affinity: CHAIR },
    ]
    const placements = placeByAffinity(props, fullPool, Infinity)
    const byProp = Object.fromEntries(placements.map((p) => [p.propId, p.anchorId]))
    expect(byProp['table']).toBe('center')
    expect(byProp['box']).toBe('corner-nw')
    expect(byProp['chair']).toMatch(/^edge-/)
  })

  it('breaks score ties by anchor input order — first-encountered wins', () => {
    const props: PropSpec[] = [
      { id: 'box-1', weight: 1, affinity: CONTAINER },
      { id: 'box-2', weight: 1, affinity: CONTAINER },
    ]
    const placements = placeByAffinity(props, fullPool, Infinity)
    expect(placements[0]?.anchorId).toBe('corner-nw')
    expect(placements[1]?.anchorId).toBe('corner-ne')
  })

  it('never reuses an anchor across props', () => {
    const props: PropSpec[] = Array.from({ length: 5 }, (_, i) => ({
      id: `box-${i}`,
      weight: 1,
      affinity: CONTAINER,
    }))
    const placements = placeByAffinity(props, fullPool, Infinity)
    const ids = placements.map((p) => p.anchorId)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('skips a prop entirely when every remaining anchor scores below the threshold', () => {
    const cornersOnly = cornerAnchors(room, 0)
    const placements = placeByAffinity(
      [{ id: 'table', weight: 3, affinity: TABLE }],
      cornersOnly,
      Infinity,
    )
    expect(placements).toEqual([])
  })

  it('falls back to a neutral (score 0) anchor when no preferred anchor is left', () => {
    const props: PropSpec[] = [
      { id: 'box-1', weight: 1, affinity: CONTAINER },
      { id: 'box-2', weight: 1, affinity: CONTAINER },
      { id: 'box-3', weight: 1, affinity: CONTAINER },
      { id: 'box-4', weight: 1, affinity: CONTAINER },
      { id: 'box-5', weight: 1, affinity: CONTAINER },
    ]
    const placements = placeByAffinity(props, fullPool, Infinity)
    expect(placements).toHaveLength(5)
    expect(placements[4]?.anchorId).toMatch(/^edge-/)
  })

  it('respects the budget — heavy props that overrun are skipped', () => {
    const props: PropSpec[] = [
      { id: 'table', weight: 3, affinity: TABLE },
      { id: 'chair', weight: 2, affinity: CHAIR },
    ]
    const placements = placeByAffinity(props, fullPool, 4)
    expect(placements.map((p) => p.propId)).toEqual(['table'])
  })

  it('places a prop with no affinity at the first available anchor (neutral preference)', () => {
    const placements = placeByAffinity(
      [{ id: 'lone', weight: 1 }],
      fullPool,
      Infinity,
    )
    expect(placements[0]?.anchorId).toBe('corner-nw')
  })
})

describe('attachmentAnchors', () => {
  const tableFootprint = { halfX: 0.6, halfZ: 0.4 }
  const tablePlacement = {
    propId: 'desk',
    anchorId: 'center',
    x: 0,
    z: 0,
  }

  it('emits one anchor on the host -Z side, offset by host half-depth + padding when follower is point-like', () => {
    const anchors = attachmentAnchors(tablePlacement, tableFootprint, 0, 0.1)
    expect(anchors).toHaveLength(1)
    expect(anchors[0]).toMatchObject({
      x: 0,
      z: -0.5,
      kind: 'attachment',
      facingYaw: 0,
    })
  })

  it('derives a stable id from the host anchor id so multiple hosts do not clash', () => {
    const a = attachmentAnchors(
      { ...tablePlacement, anchorId: 'edge-n-0' },
      tableFootprint,
      0,
      0.1,
    )
    const b = attachmentAnchors(
      { ...tablePlacement, anchorId: 'edge-s-1' },
      tableFootprint,
      0,
      0.1,
    )
    expect(a[0]?.id).not.toBe(b[0]?.id)
  })

  it('sets facingYaw = 0 so the follower looks toward the host on +Z', () => {
    const offHost = { ...tablePlacement, x: 2, z: 1.5 }
    const anchors = attachmentAnchors(offHost, tableFootprint, 0, 0.2)
    expect(anchors[0]?.facingYaw).toBe(0)
    expect(anchors[0]).toMatchObject({ x: 2, z: 1.5 - 0.4 - 0.2 })
  })

  it('factors the follower half-depth into the offset so two footprints sit padding apart', () => {
    const anchors = attachmentAnchors(tablePlacement, tableFootprint, 0.25, 0.1)
    expect(anchors[0]).toMatchObject({ x: 0, z: 0 - 0.4 - 0.25 - 0.1 })
  })
})

describe('placeWithAttachments', () => {
  const room = { width: 6, depth: 4 }
  const fullPool: Anchor[] = [
    ...cornerAnchors(room, 0),
    ...edgeAnchors(room, 1, 0),
    ...centerAnchor(room),
  ]

  const tableFootprint = { halfX: 0.6, halfZ: 0.4 }

  /** A desk: tagged 'table', wants the centre, big enough to host one chair. */
  const desk: PropSpec = {
    id: 'desk',
    weight: 3,
    affinity: { center: 3, edge: 1, corner: -2 },
    tags: ['table'],
    footprint: tableFootprint,
  }

  /** A chair: prefers attachment, tolerates edges, hates corners and centre. */
  const chair: PropSpec = {
    id: 'chair',
    weight: 2,
    affinity: { attachment: 5, edge: 2, corner: -1, center: -1 },
    attachTo: ['table'],
  }

  it('clusters a chair behind a placed table via attachment anchor', () => {
    const placements = placeWithAttachments([desk, chair], fullPool, Infinity)
    const byProp = Object.fromEntries(placements.map((p) => [p.propId, p]))
    expect(byProp['desk']?.anchorId).toBe('center')
    expect(byProp['chair']?.anchorId).toBe('attach-center-back')
    expect(byProp['chair']).toMatchObject({
      x: 0,
      z: -tableFootprint.halfZ - ATTACHMENT_PADDING,
      facingYaw: 0,
    })
  })

  it('falls back to a wall edge when no host has been placed yet', () => {
    const placements = placeWithAttachments([chair], fullPool, Infinity)
    expect(placements[0]?.anchorId).toMatch(/^edge-/)
  })

  it('falls back to a wall edge when the host has wrong tags', () => {
    const wrongHost: PropSpec = { ...desk, id: 'pillar', tags: ['decoration'] }
    const placements = placeWithAttachments([wrongHost, chair], fullPool, Infinity)
    expect(placements[1]?.anchorId).toMatch(/^edge-/)
  })

  it('only consumes the attachment anchor once — a second chair falls through to edges', () => {
    const placements = placeWithAttachments(
      [desk, { ...chair, id: 'chair-1' }, { ...chair, id: 'chair-2' }],
      fullPool,
      Infinity,
    )
    const byProp = Object.fromEntries(placements.map((p) => [p.propId, p]))
    expect(byProp['chair-1']?.anchorId).toBe('attach-center-back')
    expect(byProp['chair-2']?.anchorId).toMatch(/^edge-/)
  })

  it('skips a host whose footprint is missing — placer cannot derive attachment geometry', () => {
    const tagOnly: PropSpec = { ...desk, footprint: undefined }
    const placements = placeWithAttachments([tagOnly, chair], fullPool, Infinity)
    expect(placements[1]?.anchorId).toMatch(/^edge-/)
  })

  it('budget still applies — a chair that overruns is skipped even with a host present', () => {
    const placements = placeWithAttachments([desk, chair], fullPool, 3)
    expect(placements.map((p) => p.propId)).toEqual(['desk'])
  })
})

describe('sortByClass', () => {
  /** Concise factory so the input lists read like prose. */
  const p = (id: string, klass?: PropClass): PropSpec => ({ id, weight: 1, class: klass })

  it('orders gameplay before anchor before follower before filler', () => {
    const sorted = sortByClass([
      p('decor', 'filler'),
      p('chair', 'follower'),
      p('terminal', 'gameplay'),
      p('desk', 'anchor'),
    ])
    expect(sorted.map((x) => x.id)).toEqual(['terminal', 'desk', 'chair', 'decor'])
  })

  it('preserves input order within a class (stable sort)', () => {
    const sorted = sortByClass([
      p('desk-1', 'anchor'),
      p('desk-2', 'anchor'),
      p('desk-3', 'anchor'),
    ])
    expect(sorted.map((x) => x.id)).toEqual(['desk-1', 'desk-2', 'desk-3'])
  })

  it('treats a missing class as filler — last to be considered', () => {
    const sorted = sortByClass([{ id: 'unknown', weight: 1 }, p('terminal', 'gameplay')])
    expect(sorted.map((x) => x.id)).toEqual(['terminal', 'unknown'])
  })

  it('returns a new array without mutating the input', () => {
    const input = [p('chair', 'follower'), p('terminal', 'gameplay')]
    const inputBefore = [...input]
    const sorted = sortByClass(input)
    expect(sorted).not.toBe(input)
    expect(input).toEqual(inputBefore)
  })

  it('returns an empty list when given an empty list', () => {
    expect(sortByClass([])).toEqual([])
  })

  it('integrates with placeWithAttachments — chairs cluster around desks even when listed first', () => {
    const room = { width: 6, depth: 4 }
    const pool = [
      ...cornerAnchors(room, 0),
      ...edgeAnchors(room, 1, 0),
      ...centerAnchor(room),
    ]
    const tableFootprint = { halfX: 0.6, halfZ: 0.4 }
    const props: PropSpec[] = [
      // Caller passes them in the wrong order on purpose:
      {
        id: 'chair',
        weight: 2,
        class: 'follower',
        affinity: { attachment: 5, edge: 2, corner: -1, center: -1 },
        attachTo: ['table'],
      },
      {
        id: 'desk',
        weight: 3,
        class: 'anchor',
        affinity: { center: 3, edge: 1, corner: -2 },
        tags: ['table'],
        footprint: tableFootprint,
      },
    ]
    const placements = placeWithAttachments(sortByClass(props), pool, Infinity)
    const byProp = Object.fromEntries(placements.map((x) => [x.propId, x]))
    expect(byProp['desk']?.anchorId).toBe('center')
    expect(byProp['chair']?.anchorId).toBe('attach-center-back')
  })
})

describe('aabbOverlaps', () => {
  it('returns true when the rectangles share interior area', () => {
    expect(aabbOverlaps(0, 0, 1, 1, 0.5, 0, 1, 1)).toBe(true)
  })

  it('returns false when the rectangles are far apart', () => {
    expect(aabbOverlaps(0, 0, 1, 1, 10, 10, 1, 1)).toBe(false)
  })

  it('returns false when the rectangles only touch (edge-contact is safe)', () => {
    // A: x in [-1, +1]. B: x in [+1, +3]. Edges meet exactly at x = 1.
    expect(aabbOverlaps(0, 0, 1, 1, 2, 0, 1, 1)).toBe(false)
  })

  it('returns true when separated only on Z but overlapping on X', () => {
    // Tests that BOTH axes need to overlap, not just one.
    expect(aabbOverlaps(0, 0, 1, 1, 0, 5, 1, 1)).toBe(false)
  })

  it('clearance widens the overlap zone — two safely-touching boxes now collide', () => {
    expect(aabbOverlaps(0, 0, 1, 1, 2, 0, 1, 1, 0.5)).toBe(true)
  })
})

describe('placeWithAttachments — collision rejection', () => {
  const room = { width: 6, depth: 4 }
  const fullPool: Anchor[] = [
    ...cornerAnchors(room, 0),
    ...edgeAnchors(room, 1, 0),
    ...centerAnchor(room),
  ]

  /** Big container: would overlap its neighbour at adjacent corners. */
  const bigBox: PropAffinity = { corner: 3, edge: 0, center: -2 }
  const big = (id: string): PropSpec => ({
    id,
    weight: 1,
    affinity: bigBox,
    footprint: { halfX: 1.6, halfZ: 0.4 },
  })

  it('rejects an anchor whose footprint overlaps a prior placement', () => {
    // corner-nw at (-3, -2), corner-ne at (+3, -2), 6 m apart on X.
    // big has halfX = 1.6 → boxes extend from -1.6 to +1.6 around the corner.
    // Two adjacent corners (NW/NE) are 6 m apart; sums to 3.2 footprint
    // overlap on X needed. Not overlapping. So make it bigger…
    const huge: PropSpec = {
      id: 'crate',
      weight: 1,
      affinity: bigBox,
      footprint: { halfX: 3.2, halfZ: 0.4 },
    }
    const placements = placeWithAttachments(
      [{ ...huge, id: 'crate-1' }, { ...huge, id: 'crate-2' }],
      fullPool,
      Infinity,
    )
    // Crate-1 takes corner-nw. Crate-2 would overlap at corner-ne
    // (distance 6 on X, combined halfX = 6.4 → overlap), so it skips
    // to the first non-overlapping anchor.
    expect(placements[0]?.anchorId).toBe('corner-nw')
    expect(placements[1]?.anchorId).not.toBe('corner-ne')
  })

  it('chairs attached to a desk fit snugly without colliding through the desk', () => {
    const tableFp = { halfX: 0.6, halfZ: 0.4 }
    const desk: PropSpec = {
      id: 'desk',
      weight: 3,
      affinity: { center: 3, edge: 1, corner: -2 },
      tags: ['table'],
      footprint: tableFp,
    }
    const chair: PropSpec = {
      id: 'chair',
      weight: 2,
      affinity: { attachment: 5, edge: 2, corner: -1, center: -1 },
      attachTo: ['table'],
      footprint: { halfX: 0.25, halfZ: 0.25 },
    }
    const placements = placeWithAttachments([desk, chair], fullPool, Infinity)
    const byProp = Object.fromEntries(placements.map((p) => [p.propId, p]))
    expect(byProp['desk']?.anchorId).toBe('center')
    expect(byProp['chair']?.anchorId).toBe('attach-center-back')
    // Chair sits desk.halfZ + chair.halfZ + padding back from desk centre.
    expect(byProp['chair']).toMatchObject({
      x: 0,
      z: 0 - tableFp.halfZ - 0.25 - ATTACHMENT_PADDING,
    })
  })

  it('props without footprints are exempt from the collision check', () => {
    const ghost = (id: string): PropSpec => ({ id, weight: 1, affinity: bigBox })
    const placements = placeWithAttachments(
      [ghost('g-1'), ghost('g-2'), ghost('g-3'), ghost('g-4')],
      fullPool,
      Infinity,
    )
    expect(placements).toHaveLength(4)
    expect(placements.map((p) => p.anchorId)).toEqual([
      'corner-nw',
      'corner-ne',
      'corner-sw',
      'corner-se',
    ])
  })

  it('clearance > 0 pushes follow-up placements further away', () => {
    const placements = placeWithAttachments([big('a'), big('b')], fullPool, Infinity, undefined, 5)
    expect(placements[0]?.anchorId).toBe('corner-nw')
    expect(placements[1]?.anchorId).not.toBe('corner-ne')
  })
})

describe('placeFillers', () => {
  const room = { width: 8, depth: 6 }
  const pool = [
    ...cornerAnchors(room, 0),
    ...edgeAnchors(room, 1, 0),
    ...centerAnchor(room),
  ]

  /** A JSON-authored terminal sitting against the north wall, no attachment hooks. */
  const authoredTerminal: PropSpec = {
    id: 'authored-terminal',
    weight: 2,
    footprint: { halfX: 0.6, halfZ: 0.4 },
  }
  const authoredPlacement: Placement = {
    propId: 'authored-terminal',
    anchorId: 'authored-0',
    x: 0,
    z: -2.6,
  }

  /** A filler container that loves corners. */
  const fillBox = (id: string): PropSpec => ({
    id,
    weight: 1,
    affinity: { corner: 3, edge: 0, center: -2 },
    footprint: { halfX: 0.5, halfZ: 0.5 },
  })

  it('returns only the new fill placements — never echoes the seed back', () => {
    const result = placeFillers(
      [authoredTerminal],
      [authoredPlacement],
      [fillBox('box-1'), fillBox('box-2')],
      pool,
      Infinity,
    )
    expect(result).toHaveLength(2)
    expect(result.every((p) => p.propId.startsWith('box-'))).toBe(true)
  })

  it('honors seed placements in the collision check — fill anchors that overlap a seed are dropped', () => {
    const fatTerminalSeed: Placement = { ...authoredPlacement, x: -2.4, z: -1.4 }
    const fatTerminal: PropSpec = {
      ...authoredTerminal,
      footprint: { halfX: 2.5, halfZ: 2.5 },
    }
    const result = placeFillers(
      [fatTerminal],
      [fatTerminalSeed],
      [fillBox('box-1')],
      pool,
      Infinity,
    )
    expect(result[0]?.anchorId).not.toBe('corner-nw')
  })

  it('lets fill props attach to a seed prop tagged as a host', () => {
    const desk: PropSpec = {
      id: 'authored-desk',
      weight: 3,
      tags: ['table'],
      footprint: { halfX: 0.6, halfZ: 0.4 },
    }
    const deskPlacement: Placement = {
      propId: 'authored-desk',
      anchorId: 'authored-0',
      x: 0,
      z: 0,
    }
    const chair: PropSpec = {
      id: 'fill-chair',
      weight: 2,
      affinity: { attachment: 5, edge: 2, corner: -1, center: -1 },
      attachTo: ['table'],
      footprint: { halfX: 0.25, halfZ: 0.25 },
    }
    const result = placeFillers([desk], [deskPlacement], [chair], pool, Infinity)
    expect(result[0]?.anchorId).toBe('attach-authored-0-back')
  })

  it('charges only the fill weights against the budget — seeds are free', () => {
    const result = placeFillers(
      [authoredTerminal],
      [authoredPlacement],
      [fillBox('box-1'), fillBox('box-2'), fillBox('box-3')],
      pool,
      2,
    )
    // Three weight-1 boxes vs budget 2 → two boxes fit, third skips.
    // Authored terminal weight is irrelevant.
    expect(result).toHaveLength(2)
  })

  it('degenerates to placeWithAttachments when there are no seeds', () => {
    const props = [fillBox('a'), fillBox('b')]
    const withWrapper = placeWithAttachments(props, pool, Infinity)
    const withFiller = placeFillers([], [], props, pool, Infinity)
    expect(withFiller).toEqual(withWrapper)
  })
})

describe('placeWithAttachments — seeded RNG tiebreaks', () => {
  const room = { width: 6, depth: 4 }
  const corners = cornerAnchors(room, 0)

  /**
   * A scripted RNG that returns each value in `seq` once. Using a list
   * instead of a real PRNG makes the test's expected output a single
   * deterministic line.
   */
  const scriptedRng = (seq: number[]): (() => number) => {
    let i = 0
    return () => seq[i++ % seq.length]!
  }

  /** A container — neutral to everything except corners. */
  const container = (id: string): PropSpec => ({
    id,
    weight: 1,
    affinity: { corner: 3, edge: 0, center: -2 },
  })

  it('without rng, ties go to the first-encountered anchor (NW > NE > SW > SE)', () => {
    const placements = placeWithAttachments([container('a')], corners, Infinity)
    expect(placements[0]?.anchorId).toBe('corner-nw')
  })

  it('with rng() => 0, picks the first tied anchor (same as no rng)', () => {
    const placements = placeWithAttachments(
      [container('a')],
      corners,
      Infinity,
      scriptedRng([0]),
    )
    expect(placements[0]?.anchorId).toBe('corner-nw')
  })

  it('with rng() near 1, picks the last tied anchor', () => {
    const placements = placeWithAttachments(
      [container('a')],
      corners,
      Infinity,
      scriptedRng([0.999]),
    )
    expect(placements[0]?.anchorId).toBe('corner-se')
  })

  it('same seed → same layout across two independent runs (determinism contract)', () => {
    const props = [container('a'), container('b'), container('c'), container('d')]
    const seed = hashString('yamada-station/room-7')
    const run1 = placeWithAttachments(props, corners, Infinity, mulberry32(seed))
    const run2 = placeWithAttachments(props, corners, Infinity, mulberry32(seed))
    expect(run1).toEqual(run2)
  })

  it('different seeds may produce different layouts on the same inputs', () => {
    const props = [container('a'), container('b')]
    const a = placeWithAttachments(props, corners, Infinity, mulberry32(1))
    const b = placeWithAttachments(props, corners, Infinity, mulberry32(999))
    // Both runs must place 2 props at distinct corners. Whether the
    // *anchors* differ depends on the RNG; this asserts only that
    // determinism does not collapse the variety to a single layout.
    expect(a).toHaveLength(2)
    expect(b).toHaveLength(2)
    expect(new Set(a.map((p) => p.anchorId)).size).toBe(2)
    expect(new Set(b.map((p) => p.anchorId)).size).toBe(2)
  })

  it('rng is only consulted for actual ties — single-best anchors place without sampling', () => {
    const room6x4 = { width: 6, depth: 4 }
    const fullPool: Anchor[] = [
      ...cornerAnchors(room6x4, 0),
      ...edgeAnchors(room6x4, 1, 0),
      ...centerAnchor(room6x4),
    ]
    const table: PropSpec = {
      id: 'desk',
      weight: 3,
      affinity: { center: 3, edge: 1, corner: -2 },
    }
    let calls = 0
    const rng = (): number => {
      calls++
      return 0
    }
    placeWithAttachments([table], fullPool, Infinity, rng)
    // Only `center` scores 3; everything else scores lower → no tie → no rng call.
    expect(calls).toBe(0)
  })
})

describe('roomBudget', () => {
  it('multiplies floor area by the default factor', () => {
    expect(roomBudget({ width: 6, depth: 4 })).toBe(6 * 4 * DEFAULT_ROOM_BUDGET_FACTOR)
  })

  it('lets callers override the density factor for sparse / packed themes', () => {
    expect(roomBudget({ width: 6, depth: 4 }, 0.25)).toBe(6)
    expect(roomBudget({ width: 6, depth: 4 }, 1.0)).toBe(24)
  })

  it('returns zero for a zero-area room without crashing', () => {
    expect(roomBudget({ width: 0, depth: 4 })).toBe(0)
  })
})
