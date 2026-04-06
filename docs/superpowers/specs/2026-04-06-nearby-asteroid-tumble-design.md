# Nearby Asteroid Tumble Design

> Reintroduce some asteroid tumbling near the shuttle without restoring the
> previous large-belt performance bottleneck.

**Date:** 2026-04-06
**Area:** `src/three/controllers/AsteroidBeltController.ts`

---

## 1. Goal

Add a small amount of nearby asteroid tumbling back to the map view so the belt
feels alive close to the player, while preserving the recent performance win
from removing full-belt per-instance matrix updates.

The key constraint is that tumbling must stay **strictly bounded**. The system
must never return to scanning and rewriting matrices for every visible asteroid
in a large belt.

---

## 2. Scope

### In scope

- Shared global tuning constants inside `AsteroidBeltController`
- Probabilistic tumbling only for asteroids near the shuttle
- A bounded sampling pass over visible instances
- A hard cap on the number of active tumbling asteroids
- Resetting far asteroids back to their base transform when they leave the
  nearby tumble radius

### Out of scope

- Per-belt tumble config in `planetarium.json`
- Shader-based fake tumble or material flicker
- Changes to asteroid belt placement, density, or LOD thresholds
- New Vue controls or debug UI for tuning

---

## 3. Proposed Approach

Use a **nearby-only sampled tumble system**:

1. All asteroid instances are still generated once at startup with a fixed base
   matrix.
2. The belt group continues its slow whole-belt orbital drift.
3. Every tumble pass, the controller inspects only a small rotating slice of the
   currently visible instances instead of the entire belt.
4. Sampled asteroids inside the shared nearby radius get a random chance to
   activate or deactivate tumbling.
5. Only asteroids currently marked as active tumblers have their instance
   matrices rewritten.
6. Any active tumbler that leaves the nearby radius is immediately reset to its
   base matrix and deactivated.

This keeps the “alive near me” effect while ensuring the amount of per-tick
instance work stays bounded.

---

## 4. Controller Data Model

Each asteroid instance will store:

- `baseMatrix`: the original composed transform
- `localPosition`: the asteroid position in belt-local space
- `tumbleAxis`: the axis used for local rotation
- `tumbleSpeed`: angular speed multiplier
- `isTumbling`: whether this instance is currently active

The controller will also maintain:

- Shared tuning constants for nearby tumble radius and sampling behavior
- A rotating sample cursor/index so each pass inspects a different slice
- A count of currently active tumblers

This keeps all state local to the controller and avoids coupling the feature to
Vue, scene setup, or planetarium data.

---

## 5. Tick Behavior

### 5.1 Global belt motion

`tick()` continues to apply the belt-wide orbital drift exactly once per frame.

### 5.2 Nearby tumble evaluation

On tumble evaluation passes:

1. Convert the shuttle world position into the belt group's local space.
2. For each instanced mesh, inspect only a fixed-size sample window within the
   currently visible range (`mesh.count`).
3. For each sampled asteroid:
   - Compute distance from shuttle-local position using the cached local
     position.
   - If outside the nearby radius:
     - deactivate it if currently tumbling
     - restore its base matrix if needed
   - If inside the nearby radius:
     - if inactive, give it an activation chance
     - if active, give it a deactivation chance
4. Enforce the maximum active tumbler cap before activating more instances.

### 5.3 Matrix updates

After the sampling pass, only active tumblers get their current transform
recomputed and written via `setMatrixAt()`. Static asteroids are not touched.

This design bounds both:

- how many asteroids are *considered* for state changes each pass
- how many asteroids can *actually animate* at once

---

## 6. Shared Tuning Constants

The initial implementation should use file-local named constants in
`AsteroidBeltController.ts`, for example:

- nearby tumble radius
- tumble evaluation interval
- sampled instances per pass
- activation chance while nearby
- deactivation chance while nearby
- maximum active tumblers per instanced mesh or per belt

These remain code-level tuning knobs for now because the requested behavior is a
shared global rule rather than content authored per belt.

---

## 7. Performance Guardrails

The feature must preserve the recent optimization by following these rules:

- Never scan all visible asteroids every frame
- Never allow the active tumbling set to grow without a hard cap
- Never keep far-away asteroids in the active tumble set
- Never depend on camera zoom alone for cost control; LOD and tumble caps should
  work together

Worst-case runtime should scale with:

- the fixed sampling budget
- the capped active tumble count

It must not scale linearly with total belt population on every tick.

---

## 8. Testing Strategy

Extract the selection/state-transition logic into small pure helpers where
useful so targeted unit tests can verify behavior without trying to test Three.js
rendering directly.

Coverage should focus on:

- nearby radius membership checks
- activation only when under the active cap
- forced deactivation outside the radius
- sample-window progression across successive passes
- active tumblers resetting cleanly to their base transform when they leave the
  nearby zone

Manual verification in the map view should confirm:

- a small number of asteroids near the shuttle visibly tumble
- distant asteroids remain static
- zooming out does not reintroduce the prior hitching behavior

---

## 9. Risks And Mitigations

### Risk: too few nearby tumblers to notice

Mitigation: tune radius, activation chance, and sample budget together rather
than increasing the active cap too aggressively.

### Risk: active tumblers pop too obviously

Mitigation: use low deactivation probability and keep tumble speeds subtle so
the effect reads as ambient motion rather than binary state flips.

### Risk: sampling misses dense local clusters

Mitigation: rotate the sample cursor continuously so all visible asteroids are
eventually reconsidered over time instead of sampling the same prefix.

---

## 10. Implementation Summary

Implement a bounded nearby tumble system inside `AsteroidBeltController` that:

- stores base/local/tumble metadata per asteroid instance
- evaluates only a sampled subset of visible asteroids each tumble pass
- activates tumbling probabilistically near the shuttle
- deactivates and resets asteroids when they leave the nearby radius
- updates matrices only for the capped active subset

This restores local liveliness without giving up the performance gains from the
static-belt optimization.
