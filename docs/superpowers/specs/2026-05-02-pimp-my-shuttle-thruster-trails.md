# Pimp My Shuttle — Thruster Trails

**Date:** 2026-05-02
**Status:** Implemented
**Owner:** guinetik

## Problem

The cosmetic shop already sells **shuttle-thruster-trail** and
**lander-thruster-trail** SKUs. Each row carries a 3-stop hex gradient that
drives a Destiny-style swatch in the shop UI:

| Category                  | Example row    | `gradientStops`                                |
| ------------------------- | -------------- | ---------------------------------------------- |
| `shuttle-thruster-trail`  | Plasma Kiss    | `["#fdf4ff", "#e879f9", "#701a75"]`            |
| `shuttle-thruster-trail`  | Blue Shift     | `["#e0f2fe", "#38bdf8", "#1e3a8a"]`            |
| `lander-thruster-trail`   | Cyan RCS       | `["#ecfeff", "#06b6d4", "#164e63"]`            |
| `lander-thruster-trail`   | Magenta RCS    | `["#ffe4e6", "#ec4899", "#831843"]`            |

In-game, every shuttle and lander particle emitter still drew the legacy
hardcoded colors authored before the shop existed:

| Emitter                           | Legacy color  |
| --------------------------------- | ------------- |
| Shuttle thrust (`thrustEmitter`)  | `#ffcc66` orange |
| Shuttle brake (`brakeEmitter`)    | `#4488ff` blue   |
| Shuttle wingtip RCS (`rcsEmitter`)| `#ddeeff` pale   |
| Shuttle idle nozzle sprite        | `#ff9a1f` orange |
| Lander main flame (`flameEmitter`)| `#ffcc66` orange |
| Lander RCS quads (`rcsEmitters`)  | `#ddeeff` pale   |
| Lander nozzle glow sprite         | `#ff9a1f` orange |

So the shopper bought a beautiful magenta swatch, expected magenta exhaust on
the night side of Mars, and got the same factory orange as the trial player.

## Decision

The active trail catalog row writes its gradient stops into the existing
`ParticleEmitter` `uColor` uniform on every emitter that belongs to the vehicle
in question. Stops collapse to two named slots:

```
gradientStops[1]  → core   (themed mid)  → main thrust, lander flame,
                                            shuttle wingtip RCS, lander RCS
                                            quads, idle / nozzle glow sprites
gradientStops[2]  → wake   (deepest)     → shuttle inertial-dampener brake
```

The previous design also routed wingtip RCS / lander RCS through
`gradientStops[0]` (the lightest stop). That left the named cosmetic color
unread on the small puffs — "Cyan RCS" `#ecfeff` on the puffs is essentially
white, so the player who bought a magenta or amber pack still saw the legacy
white-ish RCS. The fix is to share the `core` slot across thrust *and* RCS:
the SKU names ("Cyan RCS", "Magenta RCS", "Amber RCS") refer to the midtone
anyway, so the shop swatch and the in-game puff finally agree.

The smoky cold-gas quality of RCS is unaffected by this: it's a function of
the soft radial particle texture (`soft: true` on both the shuttle wingtip
and the lander RCS emitters) plus spread / sizeGrowth — color is only a tint
multiplier on top of the radial falloff. Cyan-tinted soft puffs still read
as clean station-ops puffs, just chromatic instead of white.

Why a separate `wake` slot for the brake survives the simplification:

- **The shuttle has two semantically distinct plumes.** Forward thrust is the
  primary signature; the inertial-dampener brake is a counter-thrust beat
  that needs to read visually distinct from forward thrust.
- **Stops carry that hierarchy.** The shop swatches are authored as
  *light → mid → falloff*; mapping the brake to `[2]` keeps the cooler beat.

The lander has no separate brake emitter (descent gravity *is* its retro), so
the `wake` slot is intentionally unused on lander wiring.

Single-color emitters keep the shader cheap — no per-particle gradient
sampling, one `uColor` write per repaint.

## Per-vehicle wiring

```
ThrusterEffectController.applyShuttleThrusterTrail(optionId)
    │
    │   thrustEmitter.setColor(core)           // gradient[1]
    │   brakeEmitter.setColor(wake)            // gradient[2]
    │   rcsEmitter.setColor(core)              // gradient[1] — wingtip RCS
    │                                              shares thrust color so the
    │                                              named color reads on puffs
    │   idleThrusterSprites[*].material.color = core
    ▼

LanderController.applyLanderThrusterTrail(optionId)
    │
    │   flameEmitter.setColor(core)            // gradient[1]
    │   rcsEmitters.values().forEach(e => e.setColor(core))
    │                                          // gradient[1] — every RCS
    │                                              quad picks up the named
    │                                              cosmetic color, smoky
    │                                              quality preserved by the
    │                                              soft texture.
    │   nozzleGlow.material.color = core
    ▼
```

Both methods accept the catalog id directly (no pre-validation needed) and
silently no-op when the id is unknown or the catalog row's category does not
match the expected category. Convenience wrappers
`applyShuttleThrusterTrailFromProfile(profile)` /
`applyLanderThrusterTrailFromProfile(profile)` read the active id out of
`PlayerCosmetics.shuttleThrusterTrailId` / `landerThrusterTrailId` and forward.

## Pipeline

```
JSON catalog (`src/data/cosmetics/pimp-my-shuttle.json`)
        │
        │ gradientStops: ["#hex", "#hex", "#hex"]
        ▼
resolveThrusterTrailColors(optionId, expectedCategory)
        │
        │ → { core: Color, puff: Color, wake: Color }
        ▼
ParticleEmitter.setColor(color)              ← writes ShaderMaterial
                                               uniform `uColor` (vec3),
                                               no recompile.

THREE.SpriteMaterial.color.copy(color)       ← idle nozzle sprites tint via
material.needsUpdate = true                    standard sprite color.
```

The ramp shader pipeline used by the paint system is *not* reused here. Trails
are pure additive points (`THREE.Points` with a screen-space or attenuated
vertex shader), and the shader already has a `uColor` uniform — there is no
gradient sampling along a model axis the way painted hulls have. One uniform
write per stop is enough.

## Save / load wiring

| Vehicle / context              | Apply hook                                                           |
| ------------------------------ | -------------------------------------------------------------------- |
| Map shuttle (`MapShuttleEffects.thrusterController`) | `MapViewController` calls `applyShuttleThrusterTrailFromProfile` after `MapShuttleEffects` is constructed, on `cosmeticPurchaseOption`, and on `cosmeticApplyOption`. |
| Standalone shuttle scene (`ShuttleViewController`)   | After the `ThrusterEffectController` is built, the saved profile is loaded once and the trail is forwarded. |
| In-flight lander (`LanderController`)                | `load()` calls `applySavedLanderThrusterTrail()` immediately after `applySavedLanderPaintjob()`. The level VC creates the lander fresh on each level entry, so re-entry already pulls the latest trail. |

`MapShuttleEffects.applyShuttleThrusterTrailFromProfile(profile)` exists so
the controller does not have to reach into the inner `thrusterController`
field.

## Color theory rationale

Picking `gradient[1]` for every "themed" emitter (and reserving `[2]` for the
brake) keeps the chosen trail readable against bloom + black space:

- **Stop 0 is bright/hot.** On additive blending against bloom, it tends to
  saturate to white — the cyan trail looks "white with a hint of cyan".
  This is exactly the bug that motivated dropping `[0]` from the slot table:
  the wingtip RCS and lander RCS quads stayed near-white regardless of which
  paid pack the player bought.
- **Stop 1 is the headline tone.** The Destiny-style shop swatch puts this
  stop in the dominant ribbon area, so players naturally read it as "the
  color of the trail". SKU names like "Cyan RCS" / "Magenta RCS" / "Amber
  RCS" reinforce that — the headline tone *is* the cosmetic identity.
- **Stop 2 is the falloff.** Used for the shuttle brake wash because the
  inertial-dampener plume already reads cooler than main thrust visually, and
  the deepest stop tends to be the most desaturated of the three.

Two-stop gradients (e.g. flag pennants, never actually used as a trail row)
fall back through `[1] → [0] → [2] → '#ffffff'` so the resolver never hands
back `undefined` slots.

## Files

- `src/three/cosmetics/thrusterTrailColors.ts` — pure resolver
  (`resolveThrusterTrailColors`) returning fresh `THREE.Color` instances per
  call so callers can mutate freely.
- `src/three/ParticleEmitter.ts` — adds `setColor(color)` that writes the
  `uColor` uniform vec3 in place (no shader recompile).
- `src/three/ThrusterEffectController.ts` — `applyShuttleThrusterTrail` /
  `applyShuttleThrusterTrailFromProfile`, repaints all three emitters + idle
  nozzle sprites.
- `src/three/LanderController.ts` — `applyLanderThrusterTrail` /
  `applyLanderThrusterTrailFromProfile`, repaints flame + RCS emitters +
  nozzle glow sprite. `applySavedLanderThrusterTrail()` runs once at
  `load()` after the saved paintjob.
- `src/three/MapShuttleEffects.ts` —
  `applyShuttleThrusterTrailFromProfile(profile)` so the map VC does not have
  to reach into the inner `thrusterController`.
- `src/views/MapViewController.ts` — calls trail apply on
  `cosmeticPurchaseOption`, `cosmeticApplyOption`, and after
  `MapShuttleEffects` is built.
- `src/views/ShuttleViewController.ts` — applies saved trail once after
  building the `ThrusterEffectController` for the standalone scene.
- `src/three/__tests__/thrusterTrailColors.spec.ts` — slot mapping, category
  guard, fresh-instance guarantee, two-stop fallback.

## Notes

- `setColor` writes into the existing `uColor` uniform; no shader recompile
  is needed across paint apply/swap.
- `THREE.SpriteMaterial.color` is a *multiplier* over the texture. The idle
  nozzle sprite and lander nozzle glow textures are pre-baked with cream/orange
  gradients, so the new tint multiplies through the texture — players still
  see the soft falloff shape, just retinted to match the trail.
- The Factory Stock rows render with their grey gradient verbatim, matching
  the shop description ("pale plasma wash with grey falloff" for the shuttle,
  "documented cold-gas puff" for the lander). This is the shop's authored
  intent — buying a paid trail is the upgrade path back to chromatic exhaust.
- Pure paint changes (without trail changes) still recompile only the paint
  ramp shader; trail uniform writes happen in the cosmetic apply path
  regardless and cost ~3 vec3 copies per repaint.
