# Active Missions Tracker — Design

**Author:** guinetik
**Date:** 2026-05-04
**Status:** Draft

## Problem

The player can hold up to four kinds of active missions concurrently —
shuttle delivery, asteroid, EVA visit-relay, and turret mining — but the
only way to see what is currently active is to dock at a planet and open
the shuttle control mission board. From the solar map there is no
at-a-glance view of "what am I working on right now?", which makes it
easy to forget objectives or fly past relevant waypoints.

We already ship a `ContractTrackerPanel` (cyan, expandable) and a
`ObjectiveTracker` (journey, amber) on the right-hand HUD stack. Active
missions deserve a peer in that stack.

## Goals

- Surface every active mission on the solar-map HUD without opening the
  mission board.
- Group entries by mission type; hide empty groups.
- Show enough information per row to identify the mission at a glance:
  mission title plus, for types where it is meaningful, an objective
  type label (e.g. "Photometry", "Satellite Servicing").
- Clicking a row parks the camera on the mission's spatial target.
  Pressing **Esc** returns the camera to the shuttle.

## Non-goals

- No new mission state, no changes to mission acceptance/turn-in flow,
  no new persistence. The tracker is a pure read of `ShuttleMissionBoard`.
- No deep-linking into the mission board UI.
- No tracking-style "active mission" selection — clicking is a transient
  camera action, not a state change.
- No edits to `ContractTrackerPanel` or `ObjectiveTracker`.

## User experience

The right-hand HUD stack reads top → bottom:

1. Journey tracker (amber, existing).
2. **Active Missions tracker (new)**, cyan, grouped sections.
3. Contracts tracker (cyan, existing).

Each group section is rendered only when it has at least one entry.
Group order is fixed: Deliveries → Asteroid → EVA → Mining. Within a
group, rows are listed in acceptance order (the order they appear in the
underlying `activeMissions[]` arrays).

Each row shows:

- **Title** — mission name from the template.
- **Objective type** — short uppercase label, only for Asteroid and EVA
  groups. Deliveries and Mining rows omit the second line.

Clicking a row:

- Parks the map's `VehicleCamera` on the row's focus position via
  `parkAt(cameraPos, lookAt)`.
- Shows a small prompt overlay: **"ESC — return to ship"**, mirroring
  the existing `OrbitPrompt` styling.
- Esc (or clicking the prompt) calls `vehicleCamera.setTarget(shuttle.group)`,
  hides the prompt, and resumes normal vehicle-follow camera behavior.

While the camera is parked, ship controls remain enabled — the player
is just looking elsewhere. The map overlay (M), orbits, and other HUD
toggles continue to function. If the player triggers any flow that
itself reparents the camera (portal cinematic, fast-travel, EVA, death),
that flow takes precedence and clears the parked state.

## Architecture

### New files

- `src/components/MissionTrackerPanel.vue` — presentational component
  that renders grouped sections of mission rows.
- `src/lib/missions/missionHudRows.ts` — pure builder that converts a
  `ShuttleMissionBoard` snapshot into tracker groups.
- `src/lib/missions/__tests__/missionHudRows.spec.ts` — Vitest coverage
  for the builder.

### Modified files

- `src/views/MapView.vue` — import the panel, wire it into the
  `map-hud-tracker-stack`, handle the `focusMission` event.
- `src/views/MapViewController.ts` — expose `focusOnMissionTarget(focus)`
  and `clearMissionFocus()` methods. Add Esc handler that calls
  `clearMissionFocus()` when the camera is currently parked by the
  tracker.

No edits to `ContractTrackerPanel.vue`, `ObjectiveTracker.vue`, or
mission domain types.

### Data shape

```ts
/** Spatial focus for a tracker row. */
export type MissionTrackerFocus =
  | { kind: 'planet'; planetId: string }
  | { kind: 'world'; worldX: number; worldZ: number }

/** A single row inside a tracker group. */
export interface MissionTrackerRow {
  /** Stable id for v-for keying — `${groupKey}:${missionId or accept index}`. */
  id: string
  /** Mission name from template. */
  title: string
  /** Objective type label, only set for asteroid and EVA groups. */
  objectiveType?: string
  /** What clicking the row should focus the camera on. */
  focus: MissionTrackerFocus
}

/** Group key — drives the section header and row palette. */
export type MissionTrackerGroupKey = 'delivery' | 'asteroid' | 'eva' | 'mining'

/** Group rendered as one section; empty groups are not produced. */
export interface MissionTrackerGroup {
  key: MissionTrackerGroupKey
  /** Human label, e.g. "Deliveries", "EVA". */
  title: string
  rows: readonly MissionTrackerRow[]
}

export function buildMissionTrackerGroups(
  board: ShuttleMissionBoard,
): readonly MissionTrackerGroup[]
```

### Per-type row construction

| Group | Source array on `ShuttleMissionBoard` | Title | Objective type | Focus |
|---|---|---|---|---|
| `delivery` | `activeMissions` | `template.name` | — | `planet` = `giverPlanet` if `status === 'active'`, else destination planet from `template` |
| `asteroid` | `activeAsteroidMission` (single, wrapped in array if present) | `template.name` (or generated mission name) | objective field on the generated mission, mapped to display label | `world` = `template.waypoint` |
| `eva` | `activeEvaMissions` | `template.name` | `template.poiType` mapped to label (`satellite` → "Satellite Servicing", `relay_antenna` → "Relay Repair", `telescope` → "Telescope") | `world` = `mission.waypoint` |
| `mining` | `activeMiningMissions` | `template.name` | — | `world` = mining waypoint from the active mission |

`objectiveType` mapping for asteroid missions follows the existing
generator's objective discriminant (`gather`, `photometry`,
`satellite-servicing`, `bug-clear`, ...) — converted to a presentation
string in `missionHudRows.ts`. The mapping table is the single source
of truth so display labels stay aligned across the codebase.

When `delivery` mission `template` already encodes a destination planet
(it does — the existing turn-in code reads it), the builder reads the
same field. If a delivery template has no destination (purely
giver-side), the builder falls back to `giverPlanet` for both states.

### Camera focus resolution

`MapViewController.focusOnMissionTarget(focus: MissionTrackerFocus)`:

- For `planet`: read live world position from the planet catalog
  (`PLANETS[id]`) at call time. Planet positions move with simulation
  time, so resolution must happen at the moment of click — not when the
  rows are built.
- For `world`: use `worldX`/`worldZ` directly with `y = 0`.

The camera offset / look-at math reuses whatever offset is conventional
for `parkAt` cinematic shots (a small tilt above and behind). Exact
offset values land in `MAP_CONFIG` as named constants — no magic
numbers.

### Esc handling and prompt

- `MapView.vue` already owns map-scoped key handlers; add Esc handling
  for the parked-by-tracker state via a reactive `missionFocusActive`
  flag in `MapViewController`.
- When `missionFocusActive` is true, render a small `OrbitPrompt`-style
  component (or reuse `OrbitPrompt` directly with a different label
  prop, if it accepts one — to be confirmed during plan writing).
  Component name TBD at implementation time; styling matches existing
  prompts.
- Esc clears the flag and calls `setTarget(shuttle.group)`. Any other
  camera-reparenting flow (portal, fast-travel, EVA, death) clears the
  flag as a safety reset.

## Component structure

`MissionTrackerPanel.vue` matches `ContractTrackerPanel` visually:

```
┌ MISSIONS ──────────────────┐
│ DELIVERIES                 │   ← group eyebrow
│   Ferrous Hauling          │   ← row title
│   Helium-3 Run             │
│ ASTEROID                   │
│   Belt Survey 4A           │
│   PHOTOMETRY               │   ← objective type, dim
│ EVA                        │
│   TX-4 Reboot              │
│   RELAY REPAIR             │
└────────────────────────────┘
```

Reuse the cyan palette CSS variables already defined in
`ContractTrackerPanel.vue` (do not duplicate; consider lifting them to
a shared `.css` file imported by `main.css` if a second consumer makes
that worthwhile — decision deferred to plan-writing). All `@apply`
usage stays in sibling `.css` files per the project's Tailwind v4
constraint.

Props:

```ts
defineProps<{
  groups: readonly MissionTrackerGroup[]
}>()
```

Events:

```ts
defineEmits<{
  focusMission: [row: MissionTrackerRow]
}>()
```

## Testing

`missionHudRows.spec.ts` covers:

- Empty board → empty groups array.
- Single mission per type → all four groups present, in fixed order.
- Empty group hidden (e.g. only EVA active → only one group returned).
- Delivery focus resolves to `giverPlanet` when status `active`, to
  destination planet when status `ready-to-deliver`.
- Delivery with no destination falls back to giver planet for both
  states.
- EVA `poiType` mapping produces the expected display label for each
  of `satellite`, `relay_antenna`, `telescope`.
- Asteroid objective discriminant mapping covers each known objective
  type (table-driven).
- Stable row ids are unique within a group.

Per project ground rules, no Vue or Three.js layer tests are required.

## Risks

- **Camera-park state leaking.** If Esc handling fails to fire (focus
  stolen, dialog open, etc.), the player gets stuck looking at empty
  space. Mitigation: every other camera-reparenting flow clears the
  flag, and Esc handling lives at the `MapView` level alongside the
  existing map-overlay Esc handler that already works in those
  conditions.
- **Live planet position vs. row build time.** Building rows holds a
  stale planet position. Resolved by computing positions at click time,
  not in the builder.
- **HUD vertical real estate.** Three trackers stacked could overflow on
  small viewports. The existing stack already handles overflow via
  `map-hud-tracker-stack` styles; no new behavior required, but if
  overflow turns ugly during implementation we add `overflow-y: auto`
  to the stack and call it out.

## Open questions for plan-writing phase

- Whether to reuse `OrbitPrompt` for the "ESC — return to ship" message
  or introduce a tiny new `MissionFocusPrompt` component. Decision
  belongs in the implementation plan after looking at `OrbitPrompt`'s
  prop surface.
- Cinematic offset values for `parkAt`. Pick concrete numbers during
  implementation and name them in `MAP_CONFIG`.
