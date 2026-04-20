# Satellite Servicing Minigame — Planning Document

**Project:** Asteroid Lander
**Minigame Type:** `satellite_servicing`
**POI Type:** `satellite`
**Status:** Design complete, ready for prototype implementation
**Parent Doc:** `EvaMinigames.design.md`
**Date:** 2026-04-19

---

## 1. High-Level Concept

The player EVAs to a broken satellite. **1–3 rigged components** on the satellite's 3D model are glowing red with a wireframe overlay, clearly signaling damage. The player uses normal EVA 6-DoF movement to approach a broken component, sees a **"FIX"** prompt, and presses the interact key to enter **repair mode**.

In repair mode:
- Camera snaps to a fixed hero framing of the component
- EVA movement locks
- 3 anchor points appear in a screen-space line over the component
- Player holds left mouse, drags the cursor through the points in sequence
- On successful trace: red wireframe fades, component restored to normal, camera releases, player back in EVA control
- Player finds the next red component and repeats
- All red components fixed → mission complete → float back to shuttle

This is distinct from the other two EVA minigames in that **there is no Vue 2D overlay**. The minigame takes place inside the existing 3D scene. The satellite IS the playing field.

---

## 2. Design Decisions Locked

The following are resolved from discussion and should be treated as requirements:

| Decision | Value |
|---|---|
| Anchor point count | **3 points per component**, connected by a line |
| Input mode | **Drag** (hold left mouse, drag through points, release at end) |
| Failure mode | **Soft** — line resets on miss, try again, no penalty except O2 |
| Camera behavior between repairs | **Releases to EVA** — player navigates to next red part manually |
| Visual damage indicator | **Red wireframe overlay** on the broken component (matches reference screenshot) |
| Per-component shape authoring | **Procedural** — no pre-authored shapes; anchor points generated from component geometry |
| Anchor point space | **Screen-space** — points projected onto 2D plane after camera lock |
| Broken part count by difficulty | See §3 |

---

## 3. Difficulty Distribution

Broken component count scales by distance:

| Difficulty | Planets | Broken parts |
|---|---|---|
| Easy | Earth, Mars | **1** |
| Medium | Jupiter, Saturn | **2** |
| Hard | Mercury, Venus, Uranus, Neptune | **3** |

Note: some of these planets don't have satellite missions in the current `planets.json` (Mercury and Neptune are telescope-only, per the lore pass). The tier table above defines the scaling rule; it applies only to planets that actually have satellite missions.

Mapping against current data:
- Earth → 1 part (`earth_cubesat_cluster_patch`)
- Venus → 3 parts (`venus_dropsonde_carrier_refit`)
- Mars → 1 part (`mars_methane_prospector_recal`)
- Jupiter → 2 parts (`jupiter_io_torus_probe_rebuild`)
- Saturn → 2 parts (`saturn_ring_sampler_inlet`)
- Uranus → 3 parts (`uranus_tilt_probe_wheel_swap`)

Six satellite missions total. 1+3+1+2+2+3 = 12 individual repair interactions across the campaign.

---

## 4. Component Rigging Pipeline

The satellite 3D models have been rigged with named components. Each component is a sub-object (Three.js `Object3D`) with a known name convention — e.g., `reaction_wheel`, `solar_panel_a`, `high_gain_antenna`, `thruster_cluster`, `mass_spectrometer`, `dropsonde_bay`, etc.

Requirements on the rigging side:
1. Each rigged component must have a unique name within its satellite model
2. Components must have bounding geometry accessible via Three.js (`computeBoundingBox()` / `computeBoundingSphere()`)
3. Components should not overlap visually — players must be able to distinguish which one is broken
4. Every satellite in the roster must have at least 4 rigged components (so 3-part hard missions can always find 3 distinct damaged parts)

A registry of rigged components per satellite type exists (or needs to be authored) as:

```ts
interface SatelliteManifest {
  satelliteId: string        // e.g. 'methane_prospector'
  model: string              // path to GLB/GLTF
  components: string[]       // names of rigged sub-objects eligible for damage
}
```

When a satellite servicing mission spawns, the system:
1. Looks up the satellite's manifest
2. Rolls the required number of broken components (without replacement)
3. Stores the list on the mission state
4. On EVA arrival, applies the red wireframe overlay to those specific sub-objects

---

## 5. Game Flow

### 5.1 EVA Approach
Player has docked at the satellite POI and exited the shuttle on EVA. The satellite is in front of them. 1–3 components on its mesh are glowing red (wireframe overlay). No minigame UI is visible — this is just the 3D scene with visual damage cues.

### 5.2 Proximity Detection
As the player moves close to a red component (distance < threshold, e.g. `1.5m` in world units), a floating prompt appears:

```
[E]  FIX
```

Rendered as a small world-space billboard above the component. Prompt is visible only when:
- The component is in the "broken" state
- Player is within interact range
- Player has line-of-sight (raycast test, optional — maybe skip for MVP)

When the player is near multiple broken components, only the **nearest** shows its prompt to avoid ambiguity.

### 5.3 Entering Repair Mode
Player presses `E`. Transition:
1. Player's EVA input is locked
2. Camera smoothly eases (400ms) from its current position to a fixed hero framing of the component:
   - Camera positioned at a fixed offset from component center
   - Camera looks directly at component center
   - Camera distance is computed from component bounding sphere radius × framing factor (e.g., `3.0 × radius` so the part fills ~60% of screen)
3. Once camera is in position, 3 anchor points fade in as screen-space 2D overlays
4. Line placeholder (dim dashed) appears connecting the points in order
5. A subtle prompt appears: `HOLD LMB · DRAG THROUGH POINTS`

### 5.4 The Drag Interaction
See §6 for details. High level:
- Player holds LMB and drags cursor through points 1 → 2 → 3 in order
- Visual feedback as each point is reached (see §6)
- Success: line completes, 300ms confirmation animation, repair resolves
- Failure (cursor too far from line, or LMB released early): line resets, try again

### 5.5 Repair Resolution
On successful trace:
1. Anchor points and line fade out
2. Red wireframe on the component fades out (500ms)
3. Component's normal material is restored
4. A soft confirmation chime plays
5. Camera smoothly eases back to its pre-repair position (400ms) — OR to a position behind the player's EVA character, whichever matches the existing EVA camera system
6. Player regains EVA control

### 5.6 Mission Completion
When the last red component is fixed:
- A 1-second beat where the satellite is now clean and whole
- A success notification appears (toast, audio cue)
- Mission's `onComplete(missionId)` fires
- Player must EVA back to the shuttle to dock and claim reward (same pattern as other minigames — completion is in-world, not instant)

If the player aborts EVA (presses Esc, or times out on O2) with some components still red, the mission fails. Standard EVA abort flow handles this.

---

## 6. The Drag Interaction

### 6.1 Anchor Point Generation
On entering repair mode, 3 anchor points are generated procedurally. Algorithm:

1. Get the component's **bounding box** in world space
2. Project the 8 corners + center to **screen space** (camera is now fixed, so this is a one-time projection)
3. Compute the 2D bounding rect of the projected points — this is the screen area the component occupies
4. Generate 3 anchor points within this rect using one of these patterns (chosen randomly per repair for variety):
   - **Diagonal**: P1 at top-left region, P2 at center, P3 at bottom-right region
   - **Arc**: three points forming a shallow arc across the component
   - **Zigzag**: P1 top, P2 bottom-center, P3 top-right (V-shape)
5. Apply ±10% jitter to each point so no two repairs are identical
6. Clamp all points to stay within the component's screen bounds with a small inset

Constants (starting values, tune from playtest):
```ts
const ANCHOR_COUNT = 3
const BBOX_INSET_PX = 20
const POINT_RADIUS_PX = 16       // click/hit radius
const JITTER_FACTOR = 0.10
```

### 6.2 Drag Mechanics

**Input state machine:**
```
IDLE → (LMB down near point 1) → TRACING
TRACING → (cursor enters point 2 hit radius while dragging) → reached point 2
TRACING → (cursor enters point 3 hit radius while dragging) → SUCCESS
TRACING → (cursor too far from ideal line) → FAIL → reset to IDLE
TRACING → (LMB released before reaching point 3) → FAIL → reset to IDLE
```

**Key behaviors:**
- The player does NOT have to start exactly on point 1 — they just have to start with LMB held somewhere "near" it (within 2× POINT_RADIUS). This is forgiving.
- While dragging, the cursor must stay within **max deviation distance** from the ideal line between the current target point and the next. A good starting value is `40px`. Exceed this → fail, line resets.
- Must reach points in order. Touching point 3 before point 2 doesn't skip — the input stays "trying to reach point 2."

### 6.3 Visual Feedback

**Idle state (before drag starts):**
- All three points rendered as cyan circles with a subtle pulse animation
- Dashed cyan line connecting them in order, low opacity (hint path)
- Cursor is default EVA cursor

**Tracing state:**
- Active (next) point pulses brighter cyan
- Reached points dim and shrink slightly (like they've been "collected")
- A solid cyan line draws live from point 1 → cursor position
- Cursor is a small crosshair reticle

**Deviation warning:**
- When cursor deviation > 70% of max (e.g. > 28px of 40px), the tracing line shifts amber
- At max deviation → line snaps back, flashes red once, resets to idle

**Success:**
- All three points flash green
- Line goes bright green, pulses outward
- 300ms celebration beat

**Failure:**
- Line flashes red
- All points reset to cyan idle state
- Player can immediately restart (no cooldown)

### 6.4 Line Rendering
All line + point rendering is **2D canvas overlay** on top of the 3D scene. The canvas is full-screen but transparent except for the active minigame elements. Positions are all screen-space so no reprojection is needed per frame — only the damage overlay and the scene itself run in 3D.

---

## 7. Red Wireframe Overlay

The damage visualization. Reference: broken-component screenshot uploaded during planning (red wireframe on the satellite's reaction wheel / RCS cluster).

### Implementation approach
Apply a second render pass to the broken component:
1. Duplicate the component's mesh (or use a second material slot)
2. Render the duplicate with:
   - `wireframe: true`
   - Color: `#f87171` (red, matches theme)
   - Emissive: `#ef4444` with emissiveIntensity ≈ 1.2 (so it glows in dark space)
   - Transparent: true, opacity: 0.9
   - `depthTest: true`, `depthWrite: false` so it draws on top of the normal mesh without z-fighting
3. Optional: a subtle pulse on emissive intensity (0.8 Hz) to sell that it's "alive" damage

The normal mesh below is left visible — both are drawn, red wireframe on top. This gives the clearest "this part is broken" read.

### Transition on repair
When a component is fixed:
1. Tween the wireframe's opacity from 0.9 → 0 over 500ms
2. Remove the wireframe overlay from the scene
3. Normal material stays as-is — no change needed to the base mesh

---

## 8. Technical Architecture

### 8.1 Classes and Interfaces

```ts
// Per-mission state
interface SatelliteServicingState {
  missionId: string
  satelliteId: string
  brokenComponents: string[]     // names of rigged sub-objects
  repairedComponents: string[]
}

// Concrete OrbitalMiniGame implementation
class SatelliteServicingMiniGame implements OrbitalMiniGame {
  readonly missionId: string
  readonly brokenComponents: string[]
  private _repaired: Set<string> = new Set()

  readonly steps = [
    { label: 'Approach Satellite',  complete: true,  active: false },
    { label: 'Fix Damaged Parts',   complete: false, active: true  },
    { label: 'Confirm Repair',      complete: false, active: false },
  ]

  get progressCurrent() { return this._repaired.size }
  get progressTotal()   { return this.brokenComponents.length }

  markRepaired(componentName: string) { /* ... */ }
  // tick() is a no-op; component repairs drive completion
  // complete() called when all components repaired
}
```

### 8.2 Integration Points

**EVA Session hook:**
The existing `EvaSession` needs to know about broken components for the active satellite mission. Damage overlays are attached when EVA begins; removed when the mission completes or aborts.

**Input capture:**
Repair mode needs to capture mouse input for dragging. The existing EVA input handler should yield pointer control when repair mode is active. LMB specifically is reserved for drag tracing.

**Camera controller:**
A camera sub-state for "repair focus" that takes a component's world position + bounding sphere and eases the camera to a good framing. Released on repair complete. The existing EVA camera system must expose a "take temporary control" API.

**Component registry:**
A data file (`satellite_manifests.json` or similar) mapping satellite IDs to component lists. Populated from the rigging pipeline. Read-only at runtime.

**2D drag overlay:**
A Vue component (or equivalent) layered on top of the 3D canvas during repair mode only. Rendered via 2D canvas API — no SVG, no Three.js integration. Position is fully screen-space.

### 8.3 Data Flow

```
Mission spawns
  ↓
Select broken components (difficulty count, satellite manifest)
  ↓
Store on mission state, persist to save
  ↓
Player arrives at satellite POI
  ↓
EVA session begins — damage overlays attached to broken components
  ↓
Player approaches red component → prompt shown → E pressed
  ↓
Repair mode:
  - Camera eased to component framing
  - EVA input locked
  - Anchor points generated + shown
  - Drag overlay active
  ↓
Successful trace →
  - Damage overlay removed for this component
  - Mini-game state: markRepaired(component)
  - Camera released
  - EVA input restored
  ↓
Repeat for each red component
  ↓
Last component repaired → complete() → mission resolves
```

---

## 9. Prototype Plan

Two-step implementation to validate the design cheaply:

### Phase A — 2D drag mechanic prototype (React artifact)
A standalone React prototype running the drag interaction in isolation, on a colored background with dummy "component" shapes. Purpose:
- Nail the feel of drag tracing
- Tune POINT_RADIUS, max deviation, anchor patterns
- Iterate on visual feedback (idle/tracing/success/fail states)
- Handoff-ready drag component that ports to Vue

Assets: none. Pure 2D canvas.

This is analogous to what we did for telescope and relay — a self-contained prototype that proves the mechanic before it touches the main codebase.

### Phase B — 3D scene integration (Vue + Three.js, in main codebase)
With the drag mechanic proven and the design doc approved, integrate:
1. Red wireframe overlay system (add to broken components on EVA enter)
2. Proximity detection + FIX prompt billboard
3. Camera repair-focus sub-state
4. EVA input lock/release around repair mode
5. Vue overlay component wrapping the drag prototype, positioned over the 3D canvas
6. Component registry population from rigged satellite models
7. `SatelliteServicingMiniGame` class wired to the mission system

Phase A is a ~1–2 day artifact. Phase B is bigger and wants the planner agent's judgment on sequencing.

---

## 10. Open Questions for Planner Agent

1. **Damage selection persistence** — should broken components be deterministic per mission (seeded by `missionId`) so a retry sees the same damage, or rerolled on each attempt? I lean **seeded** — mission identity implies the specific failure state. A retry fixing the same parts matches the fiction.

2. **Satellite manifest source of truth** — is the component registry already exported somewhere from the rigging pipeline, or does a manual manifest file need to be authored alongside the models? If manual, we need that list before Phase B.

3. **Camera framing per component** — is `3.0 × bounding_sphere_radius` enough, or do some components (long solar panels, antenna booms) need per-component framing overrides? Start with the formula; override table if needed.

4. **Minimum inter-component distance** — when rolling 3 broken components on a small satellite, can they visually overlap and confuse the player? May need to enforce a minimum 3D separation when sampling the 3 components on hard missions.

5. **Anchor pattern variety** — 3 patterns (diagonal, arc, zigzag) enough, or should the generator have ~6+ to keep hard missions feeling fresh? Hard missions need 3 repair interactions per mission, so repeated patterns could feel stale. Leaning toward **6 patterns**.

6. **Audio hooks** — pair with the audio design pass. Needed hooks: repair mode enter (camera lock whoosh), point-reached tick, successful trace (chime), failed trace (buzz), component restored (sustained confirmation tone), all-components done (mission success sting).

7. **Mouse sensitivity** — EVA already has mouse sensitivity settings. Does the drag mechanic inherit those, or is it independent? I'd argue independent — a good EVA sensitivity is usually low for precision, but the drag mechanic wants a 1:1 screen mapping.

8. **Accessibility / controller support** — the mouse drag assumption is pretty central. Controller users would need a reticle + hold-button-to-trace system. Flagging for post-MVP.

9. **Vue component structure** — does the drag overlay live inside the existing EVA HUD Vue tree, or does it get its own mount point? Suspect the existing tree, just with a conditional `<SatelliteDragOverlay v-if="repairMode" />`.

10. **Early vs late anchor generation** — generate the 3 points at repair-mode entry (one-shot, stable during the drag), or regenerate on each failed attempt so retries aren't muscle-memoryable? I lean **stable per repair mode entry** — the "skill" is in executing the trace, not hunting for fresh points each attempt. Regen only if the player exits and re-enters repair mode.

---

## 11. Acceptance Criteria

The minigame is considered complete when:

1. A mission with `minigameType: 'satellite_servicing'` spawns correctly with the right number of broken components per difficulty tier
2. Broken components render with visible red wireframe overlay on arrival
3. Player can approach a red component and see the FIX prompt
4. Pressing E enters repair mode with camera lock, anchor points, and drag overlay
5. Dragging through 3 points in order completes the repair with visible feedback
6. Missing or deviating cancels the trace cleanly (soft fail)
7. Completing all repairs fires `onComplete(missionId)` and advances mission state
8. Esc / O2 depletion abort works like any other EVA mission
9. Telescope and relay minigames are unaffected — this is additive
10. Camera transitions feel smooth (not jarring) on entry and exit

---

## 12. References

- `EvaMinigames.design.md` — parent design doc covering all three minigames
- `TelescopeMinigame.jsx` — working telescope prototype, same visual language
- `RelayRepairMinigame.jsx` — working relay prototype, same visual language
- `OrbitalMiniGame.ts` — shared interface
- `planets.json` — mission data, filter on `minigameType: 'satellite_servicing'` for affected missions
- Broken satellite reference image — red wireframe on rigged reaction wheel, provided during design discussion
