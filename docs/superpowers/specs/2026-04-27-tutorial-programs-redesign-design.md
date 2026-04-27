# Tutorial Programs Redesign — Issued Manual + Diagnostic Cards

**Date:** 2026-04-27  
**Author:** guinetik  
**Status:** Approved direction, ready for implementation planning

## Problem

The shuttle terminal tutorial programs currently feel like separate UI experiments instead of
programs running inside the same ship computer. `ShuttleControlProgramShuttle.vue` and
`ShuttleControlProgramLander.vue` use a cloned Vale terminal-manual style, while
`ShuttleControlProgramMultitool.vue` uses a different Tailwind-heavy layout and includes
player-facing implementation notes. Several chapters are also out of date with current mechanics.

The launcher/menu itself is not part of this redesign. The work applies only to the opened program
content for Shuttle, Lander, and Multitool.

## Direction

Use the `Issued Manual + Diagnostic Cards` treatment.

Each program should read like a standard-issued equipment manual hosted inside the shuttle terminal
operating system. The copy is official and practical, but the page design is compact and diagnostic:
cards, readouts, controls, warnings, upgrade effects, and field checklists. The primary goal is to
teach current mechanics quickly without losing the worldbuilding value of document provenance.

## Document Issuers

### Shuttle

**Issuer:** Vale Orbital Refurb  
**Tone:** Refurbished owner/operator manual. Practical, warm, slightly blue-collar. Marta's voice is
allowed, but restrained to short notes or footer callouts rather than long conversational passages.

**Reasoning:** The player bought/refurbished the shuttle through Vale Orbital Refurb. Marta is the
right provenance for shuttle ownership, service history, and operational warnings.

### Lander

**Issuer:** Jovian Society / Cloud City Field Engineering  
**Tone:** Institutional industrial manual. Precise, contractor-facing, asset-management language.
More formal than Vale, less military than MMC.

**Reasoning:** The player already had the lander in the lore. It should not read like a Vale-sold
device. The Jovian Society/Cloud City manufacturing and instrumentation context makes the lander
manual feel older, more industrial, and aligned with the Society's later surface-science chain.

### Multitool

**Issuer:** Martian Marine Corps  
**Tone:** Standard-issued field equipment manual. Direct, disciplined, tactical, and practical. It
should feel like a manual for a tool issued through a Martian contract/vendor, not a Vale product.

**Reasoning:** The existing Mars contract/vendor is the Martian Marine Corps. The multitool should
inherit that context and read like standard field kit documentation.

## Shared Program Structure

All three programs use the same visual and interaction grammar:

1. **Program header**
   - Issuing organization.
   - Equipment name.
   - Document/revision code.
   - Context badges such as location, class, fuel/RTG/hull, or active mode.

2. **Chapter rail**
   - Same placement and behavior across programs.
   - Compact chapter names.
   - No separate bespoke nav style per program.

3. **Diagnostic content area**
   - Primary content is structured into reusable sections:
     - `System Summary`
     - `Controls`
     - `Power / Fuel / Charge`
     - `Hazards`
     - `Upgrades`
     - `Field Checklist`
   - Sections use consistent card/readout/warning components.

4. **Footer navigation**
   - Same previous/next controls and progress indicator across programs.
   - Same UI audio behavior.

## Content Requirements

### Shuttle Program

Must teach:

- Shuttle thrust, brake, yaw, and orbit/slingshot controls.
- Shared shuttle fuel and per-group charge model.
- Slingshot: orbit/capture, hold orbit action, aim prograde, release, avoid collision trajectories.
- Temperature risk near the sun and in outer-system cold zones.
- Hull/fuel repair, refuel, cargo, shop, mission board, and upgrade access where relevant.
- Shuttle upgrades affecting thrust, fuel, slingshot coupling, thermal protection, and hull.
- Existing certificate of ownership/provenance for the shuttle. It should remain available as its
  own chapter or equivalent document view inside the redesigned shuttle program.

Use live telemetry where already available: fuel percentage, hull, temperature, docked planet, and
installed upgrades.

### Lander Program

Must teach:

- Lander role: surface extraction, surface combat/rescue support, return-to-orbit vehicle.
- Lander controls: main engine, RCS translation, yaw, ascend/descend, retro-brake.
- Surface landing tolerances: speed, tilt, terrain slope, and hull damage risk.
- Fuel/charge behavior for main engine and RCS.
- Heavy-vehicle handling: momentum persists, flat ground matters, slopes can kill.
- Lander upgrades affecting thrust, fuel capacity, engine response, and hull.

The lander manual should not imply Vale sold the lander. It is a Jovian/Cloud City manual made
available through the terminal.

### Multitool Program

Must teach:

- Multitool modes:
  - `DRL`: drill/mining mode.
  - `LAS`: weapon/precision cutting mode.
  - `SCI`: science scanner/prospecting mode.
- Input model: Digit 1/2/3 for modes, right mouse/ADS required, left mouse firing behavior.
- RTG shared pool with per-mode charge bars.
- RTG burst recharge and the rule that recharge spends the shared pool.
- Drill behavior: hold fire, feathering is efficient, bottoming out creates recovery lockout.
- Weapon behavior: automatic bolt fire.
- Science behavior: click-shot scanner used for prospecting, survey objectives, and contextual
  science interactions.
- Multitool upgrades affecting damage, efficiency, RTG capacity, RTG recharge, and science reward
  multiplier.

The multitool manual should remove implementation-facing text such as references to future
expansions, Prey inspiration, and internal generic names unless they are actual player mechanics.

## Visual Language

The programs should look like screens from the same shuttle terminal OS:

- Dark terminal base, cyan/green/amber diagnostic accents.
- Same typography scale and spacing.
- Same card borders, readout blocks, warning blocks, and chapter rail.
- Issuer flavor is expressed through compact metadata, small accent variations, and note labels,
  not through unique layouts.
- Avoid ASCII art as the primary visual language. Use compact readouts and simple schematics only
  where they teach a mechanic.

## Technical Approach

Implementation should prefer a shared component or local data pattern rather than copy-pasting three
large independent layouts. A good implementation target is:

- A shared tutorial/manual shell component for header, chapter rail, content frame, and footer.
- Per-program data arrays for chapters, cards, warnings, controls, readouts, and issuer metadata.
- Existing props preserved:
  - Shuttle: telemetry, upgrade levels, docked planet, player name if still needed.
  - Lander: upgrade levels and docked planet.
  - Multitool: upgrade levels and docked planet.
- Existing `switch-to-upgrades` event preserved.
- Keep logic light in the Vue components. If shared behavior becomes non-trivial, use the
  ViewController pattern.

## Acceptance Criteria

- The existing shuttle terminal menu/launcher is unchanged.
- Shuttle, Lander, and Multitool opened program screens share the same program grammar.
- Each program has the correct issuer: Vale, Jovian Society/Cloud City Field Engineering, MMC.
- Player-facing copy reflects current mechanics and controls.
- The shuttle certificate of ownership remains available and readable after the redesign.
- Multitool no longer reads like a Vale product or an implementation/design note.
- The implementation avoids hardcoded TypeScript content objects where game data already exists, but
  small UI chapter descriptors in the component layer are acceptable for this terminal manual.
- TSDoc requirements remain satisfied for any new exported TypeScript symbols.
- `bun run type-check`, `bun run lint`, and `bun run test:unit` pass before completion.
