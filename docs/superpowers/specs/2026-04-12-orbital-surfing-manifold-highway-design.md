# Orbital Surfing — Manifold Highway

**Date:** 2026-04-12
**Status:** Draft
**Related:** Gravity Surfing (`src/lib/map/GravitySurfingController.ts`), Orbit Capture (`src/lib/orbitCapture.ts`)

---

## Overview

Orbital Surfing is a dark-sector travel mechanic that lets the player ride ancient viroid-built manifold highways beneath the spacetime grid. The player attaches to a planet's orbital path, dives below the grid surface into a dimly-lit spline tunnel, cruises at high speed along the orbital arc, and emerges at the destination planet — automatically entering orbit.

This is the second movement ability layered on top of the spacetime grid, complementing Gravity Surfing (grid rails on the surface) with a subterranean fast-travel system along orbital ellipses.

---

## Lore

### The Dark Sector

The game's physics are split into two tiers:

- **Standard model** — neutron thruster technology, gravity surfing, the Space Fabric overlay. Known science. The Consortium certifies it, Jay teaches it, Marta sells ships that use it.
- **Dark sector** — viroid-origin physics operating beyond the standard model. Different particles, different interactions. Not known to NPCs.

### The Manifold Highways

Millions of years ago, the Viroids built a network of gravity manifold highways along orbital paths throughout the solar system. These structures exist in the dark sector — invisible from normal space, embedded beneath the spacetime fabric.

The Viroids no longer use them. Their nature today is 100% parasitic: they float through space, colonize asteroids, and consume. The highways are dormant infrastructure from whatever they were before they devolved. It is theorized that the Viroids are the so-called "grabby aliens" — the ultimate expansionist form — and the manifold is the remnant of their peak civilization.

### The Dark Lattice Coupler

A viroid-origin hardware module that generates a dark-sector matter shield (bubble) around the ship and its immediate area of effect. Through a process similar to osmosis, the material properties of this bubble allow matter to phase through the spacetime membrane into the dark sector. Once below, the manifold highways are visible and traversable.

### Acquisition: The Viroid Envoy

The module does not come from the Consortium. After the player completes 3 exterminate missions, they receive an unsolicited message from an entity identifying itself as the **Viroid Envoy**. The Envoy provides coordinates to a collect mission — same mechanical flow as Consortium pickups, but the source is alien.

After installing the Dark Lattice Coupler, a second Envoy message arrives requesting a rendezvous at Ceres. This sets up a future narrative thread (out of scope for this feature).

The implication: the Viroids have been watching. Killing their parasitic kin caught their attention — not with hostility, but with interest. They may have plans for the player.

---

## Unlock Flow

### Gate

- Player has completed >= 3 missions with objective type `exterminate`
- The `orbitalSurfing` upgrade is not yet installed

### Sequence

1. Gate met → Viroid Envoy message fires (new sender in message catalog, alien tone)
2. Message contains coordinates for a collect mission (familiar pickup flow)
3. Player flies to coordinates, collects the Dark Lattice Coupler
4. Module installs → `orbitalSurfing` upgrade set to level 1
5. Second Envoy message fires → Ceres rendezvous hint (narrative hook, no gameplay gate)

### Data

**`src/data/upgrades.json`** — new entry:

```json
{
  "id": "orbitalSurfing",
  "category": "shuttle",
  "label": "Orbital Surfing",
  "description": "A viroid-origin dark lattice coupler lets you phase through the spacetime fabric — revealing ancient manifold highways along orbital paths.",
  "baseCost": 0,
  "maxLevel": 1,
  "valuesByLevel": [0, 1]
}
```

**`src/data/inventory/items.json`** — new item:

```json
{
  "id": "dark-lattice-coupler",
  "category": "consumable",
  "label": "Dark Lattice Coupler",
  "description": "Viroid-origin hardware that generates a dark-sector matter shield around the ship, allowing phase transition through the spacetime membrane into the manifold highway network.",
  "icon": "dark-lattice-coupler.png",
  "weightPerUnit": 12,
  "maxStack": 1,
  "sellable": false
}
```

---

## Mechanics

### Attachment Conditions

All must be true:

- Player has `orbitalSurfing` unlock (`hasOrbitalSurfingUnlock()` returns true)
- Ship is within snap distance of a planet's rendered orbit ellipse
- Orbit state is `free` (not approaching, orbiting, or slingshotting)
- Gravity surfing is not active
- Ship speed >= `GRAVITY_SURF_MIN_ATTACH_SPEED` (0.15)

### Input

The **C key** (`gravitySurfingToggle` action) is shared with gravity surfing. Context determines which system responds:

- Near an orbit path → orbital surfing (takes priority)
- Near a grid rail → gravity surfing
- Near both → orbital surfing wins (rarer, more intentional action)

### State Machine

Four states, mirroring `GravitySurfingController`:

#### 1. `free`

Normal flight. C key checks for nearby orbit paths via proximity test against rendered ellipse points.

#### 2. `coupling`

- Ship snaps to nearest point on the orbital ellipse (easeInOut lerp, same duration as gravity surfing's `COUPLE_DURATION_SEC`)
- Input disabled, velocity zeroed, ship frozen
- **Cancellable** — press C again to abort and return to free flight
- On completion → transition to `diving`

#### 3. `diving`

- **Entry ramp:** Ship tilts nose-down and sinks below the grid plane over a short duration (tunable). Y interpolates from surface to fixed tunnel depth (e.g. -40 world units). Grid ripple VFX at the pierce point.
- **Cruise:** Ship moves along the manifold spline at fixed fast cruise speed, following the orbital arc beneath the grid. Position each frame from `curve.getPointAt(t)` where `t` advances based on speed.
- **Fuel drain:** Same 3x passive multiplier as gravity surfing (`GRAVITY_SURF_PASSIVE_FUEL_MULTIPLIER`). Checked every frame.
- **Fuel-out = game over.** No ejection, no rescue. If the fuel tank empties during diving, trigger death through the existing hull/death system.
- **No cancel.** Once diving, the player is committed.
- **S key** reverses direction along the spline (go the long way around).
- On approach to destination planet → transition to `emerging`

#### 4. `emerging`

- **Exit ramp:** Ship rises from tunnel depth back to surface Y over a short duration. Grid ripple VFX at the exit pierce point.
- Manifold spline fades out
- On completion → hand off to `OrbitCaptureSystem`, placing the player directly into `orbiting` state at the destination planet. Skips the normal E-key approach flow.

### Speed

Fixed fast cruise speed, significantly faster than normal flight or the planet's orbital velocity. The player is catching the planet, not matching it. Tunable constant in `mapViewControllerConfig.ts`.

---

## Visual Design

### The Manifold Spline

**Geometry:**

- Constructed from the target planet's orbital ellipse (Kepler `orbitPathPoints()` data)
- Only the arc from the player's attach point to the planet's current position — not the full ellipse
- Offset to fixed tunnel depth below the grid plane (Y = tunnel depth constant)
- Entry ramp: short curved section from surface Y down to tunnel depth at the attach point
- Exit ramp: short curved section from tunnel depth up to surface Y at the planet
- Built as a `THREE.CatmullRomCurve3` from the arc points

**Shader — ancient dormant Tron:**

- Dark tube/channel with dim glowing edge lines
- Wireframe aesthetic, similar family as the spacetime grid but darker, more alien
- Thin lines, low opacity — cold blue-violet or deep indigo palette
- Subtle pulse/flicker — old infrastructure with barely enough power to function
- The manifold is *revealed* as the ship dips below, not spawned. It was always there — you just couldn't see it from above the grid.

### Camera

- Follows behind the ship during diving, looking forward along the spline
- The spacetime grid wireframe is visible *above* as a translucent ceiling — the underside of the membrane
- Minimal lighting — ship's running lights illuminate nearby manifold walls

### Entry/Exit Moments

- **Entry:** Ship tilts nose-down, punches through the grid surface. Brief ripple/distortion radiates outward on the grid at the pierce point.
- **Exit:** Ship rises through the grid near the planet. Same ripple effect at the exit point. Transition into orbit ring.

---

## Architecture

### New Files

**`src/lib/map/OrbitalSurfingController.ts`**

State machine and movement logic. Same pattern as `GravitySurfingController.ts`:

- Discriminated union state type (`free | coupling | diving | emerging`)
- `tick(dt, deps)` drives state transitions and position updates
- `requestToggle(deps)` handles C key input
- `isActive()`, `canShowAttachPrompt()` for HUD integration
- Deps interface includes: `shuttleController`, `spaceTimeGrid`, `inputManager`, `orbitCaptureSystem`, planet orbit data, fuel state

**`src/three/ManifoldSpline.ts`**

Spline geometry and Tron shader rendering:

- Constructs `CatmullRomCurve3` from orbital arc + depth offset + entry/exit ramps
- Renders as `LineSegments` with custom `ShaderMaterial` (dim glow, pulse/flicker)
- `show(arcPoints, tunnelDepth)` — builds and adds to scene
- `hide()` — fades and disposes
- `getPositionAt(t)` — returns world position for ship placement
- Implements `Tickable` for shader time uniform

### Modified Files

| File | Change |
|------|--------|
| `src/data/upgrades.json` | Add `orbitalSurfing` upgrade entry |
| `src/data/inventory/items.json` | Add Dark Lattice Coupler item |
| `src/lib/upgrades.ts` | Add `hasOrbitalSurfingUnlock()` function |
| `src/lib/map/mapViewControllerConfig.ts` | Tunnel depth, cruise speed, ramp duration, snap distance constants |
| `src/views/MapViewController.ts` | Tick `OrbitalSurfingController`, pass deps, mutual exclusion with gravity surfing |
| `src/lib/map/orbit/MapOrbitFacade.ts` | Accept orbital surfing completion → place player in `orbiting` state |
| `src/lib/messages/messageCatalog.ts` | Viroid Envoy messages (initial contact + Ceres rendezvous) |

### Integration Points

- **Mutual exclusion:** `GravitySurfingController` and `OrbitalSurfingController` check each other's `isActive()` before allowing attachment.
- **Orbit handoff:** When `emerging` completes, `OrbitalSurfingController` calls into `MapOrbitFacade` / `OrbitCaptureSystem` to place the player directly into the `orbiting` state, bypassing normal approach.
- **Fuel death:** During `diving`, each tick checks fuel level. On empty → game over via existing death mechanics.
- **C key arbitration:** `MapViewController` checks orbit path proximity first, then grid rail proximity. First match wins.

---

## Constants (initial tuning values)

| Constant | Value | Purpose |
|----------|-------|---------|
| `ORBITAL_SURF_TUNNEL_DEPTH` | 40 | World units below grid plane |
| `ORBITAL_SURF_CRUISE_SPEED_MULTIPLIER` | 5 | Multiplier on `maxThrustSpeed` for spline travel (tuning start) |
| `ORBITAL_SURF_RAMP_DURATION_SEC` | 1.2 | Time to dive down / emerge up |
| `ORBITAL_SURF_SNAP_DISTANCE` | 15 | Max world units from orbit ellipse to allow attach (tuning start) |
| `ORBITAL_SURF_FUEL_MULTIPLIER` | 3 | Same as gravity surfing passive drain |
| `ORBITAL_SURF_SPLINE_COLOR` | 0x2a1a4e | Deep indigo base for manifold lines |
| `ORBITAL_SURF_SPLINE_GLOW_COLOR` | 0x4433aa | Dim blue-violet edge glow |
| `ORBITAL_SURF_SPLINE_OPACITY` | 0.25 | Low opacity — ancient, dormant |
| `ORBITAL_SURF_PULSE_SPEED` | 0.4 | Slow flicker — barely alive |

Cruise speed starts at 5x `maxThrustSpeed` — needs playtesting. Should feel fast enough to be worth the fuel risk but not instant. A full orbit arc should take ~5-10 seconds of real time. Snap distance of 15 world units is a starting point — may need per-planet scaling if inner orbits are too tight.

---

## Out of Scope

- Ceres rendezvous mission content (narrative hook only — message fires, no gameplay)
- Viroid Envoy character development beyond two initial messages
- Multiple manifold paths / branching highways
- Manifold encounters (enemies or events inside the tunnel)
- Visual upgrades to the manifold (brighter, faster with upgrades)
