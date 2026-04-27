# Shuttle Control Program — Shuttle Tab (Vale Orbital Refurb Owner's Manual)

**Version:** 0.1 — April 2026  
**Author:** guinetik  
**Spec:** This document  
**Status:** Draft for implementation

## Purpose

The "Shuttle" tab in the `ShuttleControlOverlay` (accessed from the map/ship hub) serves as the **in-game owner's manual** for the player's refurbished shuttle. 

It is framed as documentation provided by **Marta Vale of Vale Orbital Refurb** — the dealer who sold the player the ship in the opening sequence. The tone is practical, slightly sassy, caring, and blue-collar. It explains systems the player encounters but that are never explicitly tutorialized elsewhere (especially the complex `ThrusterSystem` power model, slingshot mechanics, upgrades, temperature, etc.).

This turns a placeholder tab into a valuable onboarding and reference tool that fits the lore perfectly.

## Lore Framing

> "Property of Vale Orbital Refurb — Unit sold to independent operator on 2306-04-05.  
> This is not your grandfather's NASA lander. It's a 3D-printed, neutron-retrofitted, aftermarket bastard that has passed through 17 owners. The frame is original. Everything else has been upgraded, patched, or replaced by people who needed it to keep flying. Treat her right and she'll get you home. — Marta Vale"

The manual acknowledges:
- The shuttle is a **refurbished NASA-era lunar lander chassis** from the boom years.
- Major aftermarket upgrades include the **neutron thruster system** (Phobos-derived) and **slingshot/gravity-assist coupling**.
- It is held together with stubbornness, aftermarket parts, and Marta's people.

## Content Sections

### 1. Welcome / Provenance (top)
- Short intro with Marta's voice.
- "The Machine Works. It's paid off. That's all that matters." (echoing GDD).
- Current shuttle status summary (live data: fuel level, hull %, active upgrades).

### 2. The Power Plant — Neutron Thruster System (primary focus)
- Explain the shared fuel pool + per-thruster-group charge model (`ThrusterSystem<T>`).
- Core rules (recharge costs fuel from the shared tank, full charge = zero fuel drain, no fuel = spend-only mode).
- Visual demo of the three groups: **Main Thrust**, **Brake (Inertia Dampeners)**, **RCS (lateral/yaw)**.
- Burn rate vs recharge rate, alignment multipliers, why "the red bar is the lesson" (Jay's message tie-in).
- Marta marginalia: "Don't run the red unless you mean it, baby."

### 3. Slingshot & Gravity Navigation
- How planetary gravity wells work (charge, aim with green/red indicator, release).
- "The planet does the work. You just point it." (direct Jay quote adaptation).
- Spacetime ripples / gravitational anomalies.
- Orbital capture mechanics.

### 4. Flight Physics & Hazards
- Newtonian momentum in microgravity (no auto-stabilization).
- Temperature management (hot near sun, cold in outer system).
- Hull stress from high-velocity contact.
- Adrift countdown and emergency procedures.

### 5. Refits & Upgrades (Vale Engineering Bay)
- Explanation of the Upgrades tab.
- Focus on **shuttle-category** upgrades (thruster efficiency, fuel capacity, slingshot coupling strength, etc.).
- "Level 0 is what the yard shipped. Everything after is us bolting better coefficients on your frame."
- Button/link to switch to the Upgrades program.

### 6. Operational Reference
- Controls quick-reference (pulled from `DEFAULT_BINDINGS`).
- Shop usage (refuel, repair, trade).
- Mission types (shuttle jobs vs lander jobs — "use the right machine for the rock").
- The cat (flavor).

### 7. Final Note from Marta
- Personal sign-off.
- Hint toward achievements or future story beats.

## Technical Implementation

**File:** `src/components/shuttle-control/ShuttleControlProgramShuttle.vue`

- Follow **ViewController pattern** if interactivity grows complex (for now, keep logic light in `<script setup>` with `computed` values).
- Props: `telemetry?: ShuttleTelemetry`, `upgradeLevels?: Partial<Record<UpgradeId, number>>`, `dockedPlanet?`.
- Use existing `shuttle-control-screen` + `shuttle-control-*` CSS classes.
- Add new Tailwind `@apply` styles in `src/assets/css/main.css` for:
  - `.orientation-section`, `.system-card`, `.marta-note`, `.thruster-demo`, `.live-readout`.
- Interactive elements:
  - Hoverable system cards that highlight related telemetry.
  - Simple CSS/SVG thruster charge demo (animates on click).
  - "Mark as Read" progress that could integrate with the new achievements system.
- **Data-driven**: Pull real upgrade names, thruster group labels, current values where possible. No magic numbers.
- **Tone**: Mix formal NASA-style callouts with Marta's handwritten-style asides (use different colors/fonts).

**TSDoc** on all exports. File header with `@spec docs/shuttle-control-program-shuttle.md`.

**Dependencies to import:**
- `@/lib/physics/thrusterSystem` (for group names/config)
- `@/lib/upgrades` (shuttle category upgrades)
- `@/lib/ShuttleTelemetry`
- Existing message catalog tone for consistency with Marta/Jay voice.

## Success Criteria

- Player understands the ThrusterSystem power model after reading.
- Feels like a real artifact from Marta's shop.
- Consistent visual style with other ShuttleControlProgram* components.
- Live data updates (fuel, upgrades) make it feel current.
- No inline styles, no magic numbers, fully typed, passes lint/type-check.

## Future Enhancements (post-jam)
- Achievement unlocks for reading all sections.
- Video/audio clips from Marta.
- Dynamic updates based on player's current progress (e.g. "You've now experienced the red bar...").

---

**Implementation note:** Start with the static structure + Marta voice, then layer in live data pulls and simple interactivity. The Thruster System section should be the most detailed and visually rich.

This document will be kept up-to-date as the component evolves.

**@author** guinetik  
**@date** 2026-04-12
