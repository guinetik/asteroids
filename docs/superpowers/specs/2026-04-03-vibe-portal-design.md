# Vibe Portal — Design Spec

**Date:** 2026-04-03
**Status:** Approved

## Overview

A self-contained, framework-agnostic TypeScript module that handles the Vibe Coding Game Jam 2026 portal system. Manages URL parameter parsing (incoming players), URL building (outgoing players), and navigation. Zero dependencies beyond browser APIs. Shareable as a single-file gist.

The module does NOT handle rendering, collision detection, or proximity checks. The game decides when a player "enters" a portal and calls the module's API.

## File

`src/lib/portal.ts` — single file, single class.

## API

### Construction

```ts
const portal = new VibePortal()
```

Parses `window.location.search` at construction time.

### Properties

- **`arrival: VibeJamParams`** — typed object of all known jam params parsed from the current URL. Numeric fields (`speed`, `hp`, rotations) are parsed as numbers. Missing params are `undefined`.
- **`isArrival: boolean`** — `true` if `?portal=true` is present in the URL.
- **`params: Map<string, string>`** — all query params as raw strings, including unknown/custom ones.

### Methods

- **`depart(state: Partial<VibeJamParams> & Record<string, string | number>): void`** — builds the exit portal URL with the given player state params and navigates to the jam portal endpoint. Always sets `portal=true`. Sets `ref` to the current game's origin.
- **`returnToOrigin(state?: Partial<VibeJamParams> & Record<string, string | number>): boolean`** — redirects back to the `ref` URL from the arrival params, forwarding the given player state. Returns `false` and does NOT navigate if no `ref` was present on arrival. Returns `true` on successful navigation.

## Types

```ts
interface VibeJamParams {
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

## Constants

- `VIBE_JAM_PORTAL_URL = 'https://jam.pieter.com/portal/2026'` — the jam's portal redirect endpoint.
- `NUMERIC_PARAMS` — set of param names that should be parsed as numbers: `speed`, `speed_x`, `speed_y`, `speed_z`, `rotation_x`, `rotation_y`, `rotation_z`, `hp`.

## Behavior Details

### Incoming (arrival parsing)

1. Read `window.location.search` via `URLSearchParams`.
2. `portal` param: `true` if the string value is `'true'`, `false` otherwise.
3. Numeric params: parsed via `Number()`. If `NaN`, the field is `undefined`.
4. String params: taken as-is. Empty string is kept as empty string.
5. All params (known and unknown) stored in the `params` Map as raw strings.

### Outgoing (depart)

1. Start with the jam portal endpoint URL.
2. Set `portal=true`.
3. Set `ref` to `window.location.host` (the current game's domain).
4. Serialize all provided state params as query string values.
5. Navigate by assigning `window.location.href`.

### Return (returnToOrigin)

1. Check if `arrival.ref` exists. If not, return `false`.
2. Prepend `https://` to `ref` if no protocol is present.
3. Set `portal=true`.
4. Forward all provided state params.
5. Navigate by assigning `window.location.href`. Return `true`.

## Testing Plan

All tests in `src/lib/__tests__/portal.spec.ts`.

### URL Parsing Tests
- All known params present — assert each field is correctly typed and valued.
- Partial params — only `portal=true&ref=somegame.com`, rest undefined.
- No params at all — `isArrival` is `false`, all fields undefined.
- Custom/unknown params — appear in `params` Map but not in typed `arrival`.
- Numeric edge cases — `speed=abc` results in `undefined`, `hp=0` is valid `0`.

### URL Building Tests
- `depart()` with full state — URL contains all params, `portal=true`, `ref` is current host.
- `depart()` with minimal state — only `portal` and `ref` in URL.
- Custom params in depart — non-standard keys pass through to URL.
- Special characters — param values with `&`, `=`, spaces are properly encoded.

### Navigation Tests
- `depart()` assigns `window.location.href` to correct URL.
- `returnToOrigin()` with valid `ref` — navigates and returns `true`.
- `returnToOrigin()` with no `ref` — does NOT navigate, returns `false`.
- `returnToOrigin()` with `ref` missing protocol — prepends `https://`.

### Edge Cases
- Empty string params — preserved as empty strings.
- Duplicate param keys — last value wins (URLSearchParams behavior).
