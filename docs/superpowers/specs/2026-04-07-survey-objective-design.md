# Survey Objective Design

**Date:** 2026-04-07
**Status:** Draft

## Overview

New objective type for lander gameplay: **Gravitometric Survey**. A ground terminal deploys sensor probes into low orbit. The player calibrates each probe by flying through its position, then returns the calibration data to the terminal. This is the first objective type that exercises lander flight skill rather than EVA combat/collection.

## Player Flow

1. **Approach** — Fly lander to objective flat zone (waypoint marker visible on compass/HUD)
2. **Land & EVA** — Exit lander, walk to survey terminal at the flat zone
3. **Activate** — Interact with terminal: "Begin Gravitometric Survey". Lander gets refueled.
4. **Probes spawn** — Holographic diamond shapes appear scattered randomly above the flat zone. Timer starts.
5. **Board lander** — Return to lander, take off
6. **Collect** — Fly through each probe. Instant collect: particle burst, counter increments.
7. **Return** — Land back at the zone, EVA to terminal
8. **Deliver** — Interact with terminal to submit calibration data. Objective complete if all probes collected before timer expires.

## Difficulty Scaling

Both probe count and timer scale with difficulty:

| Parameter | Easy (difficulty 1) | Hard (difficulty 10) | Scaling |
|-----------|---------------------|----------------------|---------|
| `probeCount` | 3 | 10 | Linear interpolation |
| `timeLimit` | 90s | 45s | Inverted (less time at higher difficulty) |

## Data Model

### New ObjectiveType

Add `'survey'` to the `ObjectiveType` union in `src/lib/missions/types.ts`:

```ts
export type ObjectiveType = 'gather' | 'exterminate' | 'rescue' | 'survey'
```

### SurveyScalableParams

```ts
interface SurveyScalableParams {
  type: 'survey'
  probeCount: NumberRange    // number of probes to calibrate (3..10)
  timeLimit: NumberRange     // seconds, INVERTED — high end at low difficulty (90..45)
}
```

Add to `ScalableParams` union.

### ConcreteObjective Fields

Add optional fields to `ConcreteObjective`:

```ts
probeCount?: number   // rolled probe count
timeLimit?: number    // rolled time limit in seconds
```

### Rolling Logic

Add `case 'survey'` to `rollObjective()` in `asteroidMissionGenerator.ts`. `timeLimit` uses inverted interpolation (same pattern as `oxygenTime` in rescue objectives).

## Probe System

### Spawn Pattern

Probes spawn at random positions within a volume above the objective flat zone:

- **Horizontal radius:** 200-400 units from flat zone center (keeps probes reachable but spread out)
- **Altitude range:** 30-150 units above ground (requires vertical flight, but not orbital)
- **Distribution:** Uniform random within the cylindrical volume, seeded from mission seed for determinism

Positions are generated when the player activates the terminal, using the mission seed + objective index for reproducibility.

### Probe Visuals — Holographic Diamond

- **Geometry:** `OctahedronGeometry` (radius ~3 units) — diamond shape
- **Material:** `MeshBasicMaterial` with wireframe enabled, emissive cyan/teal color (`0x00ffcc`)
- **Animation:** Slow Y-axis rotation (~1 rad/s), subtle vertical bob (sine wave, amplitude ~0.5 units)
- **Visibility aid:** Small `PointLight` attached (low intensity, matching color, short range) so probes glow against dark sky

### Collection

- **Trigger:** Lander center within 10 units of probe position (sphere collision)
- **On collect:**
  - Probe mesh removed from scene
  - Particle burst at probe position (short-lived, matching color)
  - Counter increments
  - Audio cue (collect sound)

### New Class: `SurveyProbeController`

Location: `src/three/SurveyProbeController.ts`

Manages all probes for one survey objective:
- `spawn(positions: Vector3[])` — creates probe meshes in scene
- `tick(dt, landerPos)` — animates probes, checks collection distance
- `collected: number` — read-only count
- `total: number` — read-only total
- `allCollected: boolean` — convenience getter
- `onCollect?: (index: number) => void` — callback for HUD/audio
- `dispose()` — cleanup

## Terminal

### New Class: `TerminalModel`

Location: `src/three/TerminalModel.ts`

Placeholder rendering:
- **Geometry:** `BoxGeometry` (~2x3x1 units) — standing console shape
- **Material:** `MeshStandardMaterial`, dark metallic color
- **Placement:** At flat zone center, on ground level
- **Interaction range:** Same as `LANDER_INTERACT_RANGE` (15 units) for EVA proximity check

The terminal is placed by `LevelViewController` when a survey objective exists. The player must be in EVA state and within range to interact.

### Terminal States

```
idle        — "Press E to begin Gravitometric Survey"
active      — Survey in progress, probes spawned, timer running
delivering  — "Press E to deliver calibration data" (all probes collected, player returned)
completed   — "Survey complete" (data delivered)
failed      — "Survey failed — time expired"
```

## Survey Runtime State

Managed per survey objective in `LevelViewController`:

```ts
interface SurveyState {
  status: 'idle' | 'active' | 'collecting' | 'delivered' | 'failed'
  probeController: SurveyProbeController | null
  timeRemaining: number        // countdown in seconds
  probesCollected: number
  probesTotal: number
}
```

### State Transitions

- `idle → active`: Player interacts with terminal. Probes spawn, lander refueled, timer starts.
- `active → collecting`: First probe collected (visual state only — timer keeps running).
- `active/collecting → failed`: Timer hits zero before all probes collected OR before delivery.
- `active/collecting → delivered`: All probes collected AND player returns to terminal and interacts.
- No restart — if failed, objective stays failed for the mission.

### Timer

- Counts down from `timeLimit` seconds
- Displayed in lander HUD when survey is active (format: `MM:SS`)
- Visual warning when < 30s remaining (flash/color change)
- Timer runs during both lander flight AND EVA (no pause)

## HUD Integration

### Lander HUD (`LanderHud.vue`)

When a survey is active, display:
- **Timer:** Countdown in top area, format `MM:SS`, warning color when < 30s
- **Probe counter:** `"3/7 PROBES CALIBRATED"` near timer

### Compass/Waypoint

- Survey objectives show as `"SURVEY"` label on compass strip
- Individual probes do NOT appear on compass (too many, would clutter)
- Probes are visually bright enough to spot by flying around

### EVA HUD

- Terminal interaction prompt when in range: `"[E] Begin Gravitometric Survey"` or `"[E] Deliver Calibration Data"`

## Refueling on Activation

When the player activates the terminal:
- Lander's `thrusterSystem` fuel is restored to full capacity
- Brief visual/audio feedback (fuel gauge fills)
- Ensures the player can complete the flight challenge regardless of fuel state on arrival

## Mission Template Integration

### New Template: `gravitometric-survey.json`

```json
{
  "id": "gravitometric-survey",
  "name": "Gravitometric Survey",
  "briefing": "Deploy and calibrate gravitometric sensor probes...",
  "objectiveSlots": [
    {
      "type": "survey",
      "weight": 1.0,
      "params": {
        "type": "survey",
        "probeCount": [3, 10],
        "timeLimit": [90, 45]
      },
      "reward": [200, 800]
    }
  ]
}
```

Survey slots can also be mixed into existing templates (e.g., colony-relief could include a survey slot alongside gather/rescue).

### Giver Assignment

Add `'survey'` to Jay Mercer's `objectiveTypes` array — he already has a mission called "Mineral Survey" which fits the gravitometric theme. Add a new mission entry to his giver JSON with the survey template.

## File Changes Summary

| File | Change |
|------|--------|
| `src/lib/missions/types.ts` | Add `'survey'` to `ObjectiveType`, add `SurveyScalableParams`, add fields to `ConcreteObjective` |
| `src/lib/missions/asteroidMissionGenerator.ts` | Add `case 'survey'` to `rollObjective()` |
| `src/three/SurveyProbeController.ts` | **New** — probe spawning, animation, collection |
| `src/three/TerminalModel.ts` | **New** — placeholder cube terminal |
| `src/views/LevelViewController.ts` | Survey state management, terminal placement, probe spawning, timer, refueling |
| `src/components/LanderHud.vue` | Timer + probe counter display |
| `src/data/missions/gravitometric-survey.json` | **New** — mission template |
| `src/data/missions/givers/jay-mercer.json` | Add `'survey'` to `objectiveTypes`, add gravitometric survey mission entry |
