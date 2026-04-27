# Dynamic Albedo of Neutrons Mission

**Date:** 2026-04-27
**Author:** guinetik
**Status:** Draft
**Related:**
- `docs/inspo/dan-mission-gdd.md`
- `2026-04-06-asteroid-missions-design.md`
- `2026-04-26-science-rock-prospecting-design.md`
- `2026-04-18-exterminate-vfx-and-marker-design.md`
- `2026-04-18-level-controller-fixes-design.md`

## Problem

The Jovian Society contract chain already references `objectiveType: "dan"` in
`src/data/contracts/jovian-society-prospection.json`, but the asteroid mission
system only models `photometry` as the Society's active survey objective. DAN
needs to become a real asteroid objective type: a 45-second EVA defense scan
where the lander emits a subsurface neutron pulse, neutron-return particles arc
out of the crater floor, and viroids attack the scan source.

Photometry tests lander steadiness. DAN should test mode-switching under
pressure: science mode captures particles, laser mode kills viroids, and the
lander hull is the defended asset.

## Lore And Briefing Rationale

DAN should not read like generic survey jargon in the mission board. The player
needs a plain explanation of why anyone pays for this dangerous work.

Canonical hook: neutron thrusters were not invented; humanity discovered
thruster-bearing crystalline lattice material under Phobos. When energized,
that lattice produced relativistic thrust and made cheap interplanetary travel
possible. The same discovery also woke the first known viroids.

DAN is the field instrument built from that history. Dynamic Albedo of Neutrons
is how prospectors test whether an asteroid has buried hydrogen-rich volatiles,
shielded water, and, more importantly for the Jovian Society, neutron-reactive
lattice signatures similar to the Phobos find. Photometry tells the Society
what the surface reflects. DAN tells them whether the subsurface might contain
the stuff that makes ships move.

The Society's public explanation:

- DAN is a standard subsurface volatile survey.
- The lander emits a low-yield neutron pulse.
- Hydrogen and exotic lattice inclusions scatter a readable return.
- The player captures the return particles with science mode before they decay
  back into local noise.
- Good DAN data helps classify the body for fuel, water, shielding, and
  propulsion-material prospecting.

What the Society avoids saying:

- Viroids react to the neutron pulse because it resembles the energized field
  that woke them on Phobos.
- The pulse may not merely attract nearby viroids; it may be interpreted as a
  territorial intrusion or feeding signal.
- "Sensor cross-talk" is the Society's sanitized phrase for viroid response.
- The player is not just collecting data. They are ringing a dinner bell and
  guarding the bell.

The game text should teach this through faction voice rather than exposition.
The player already has the Phobos origin from the intro; DAN mission board copy
should assume the basics and let each faction's worldview reshape the same
mechanic. Pilots reading both mission boards should feel the same job described
in incompatible languages.

Psychosphere is viroid drop residue: consciousness fragments of an interstellar
alien species. The Cinderline considers psychosphere sacred. The Jovian Society
considers it sensor calibration material.

### Faction Ontology

The same DAN scan must read differently depending on who posts the mission:

| Beat | Jovian Society Reads It As | Cinderline Reads It As |
|------|----------------------------|------------------------|
| The pulse | Subsurface volatile survey | A question put to the rock |
| Return particles | Telemetry data | The rock's reply |
| Viroid attacks | Sensor cross-talk | A wakeful presence answering the call |
| Killing viroids | Hazard mitigation | A regrettable necessity, not a victory |
| Successful scan | Asset classification advanced | The rock has spoken; the line listens |

**Jovian Society:** corporate-banal, late-capitalism cloud-city manufacturers.
Voice is signed by Vance Hoyt, Senior Asset Officer. Vance says asset,
portfolio, instrumentation envelope, longitudinal benefits, stakeholder, line
item, and warm regards. He is courteous, never openly sinister, and absolutely
the villain. The Society is hunting Phobos-family lattice for neutron-thruster
manufacturing. Vance must never honestly name danger; viroid response is
"sensor cross-talk," "elevated ambient disturbance," or "instrumentation
interference." The horror lives in the spreadsheet.

**The Cinderline:** solar-mystic order based at The Anvil on Mercury. Voice is
liturgical, patient, certain, and slightly archaic. Sentences are short.
Silences are intentional. They view DAN as a listening rite: the neutron pulse
asks the asteroid whether something inside is awake. They do not deny viroids;
they acknowledge presences. The pilot is not defending a scanner. The pilot is
holding a vigil. Signoffs may include "A seat will be kept" or "Walk in the
light." The Cinderline's gravity is the silence.

Forbidden voice moves:

- Vance must not acknowledge the Phobos viroid origin or name viroid attacks
  honestly. He calls the response cross-talk or interference.
- The Cinderline must not sound mournful, vague, or generic-spooky. They are
  calm because they are certain.
- Neither faction should explain the whole lore in a briefing. Keep mission
  board copy to 2-4 sentences; the voice does the heavy lifting.

## Goals

- Add a first-class `dan` objective type to asteroid mission generation,
  mission data, active mission objectives, and objective completion flow.
- Run DAN as an EVA terminal objective at a crater landing site: interact with a
  Society terminal, start a fixed scan timer, fill the DAN meter by shooting
  particles with science mode, and defend the parked lander from viroids.
- Keep domain state in `src/lib/` and rendering/input orchestration in
  `LevelViewController` plus Three.js controllers.
- Reuse existing player movement, multi-tool modes, viroid AI, lander hull
  damage, mission failure handling, terminal interaction, and HUD patterns.
- Make the feature data-driven through mission template params and a small
  DAN tuning table, with no hardcoded per-mission numbers in controllers.
- Require player-facing mission copy to define DAN, state the survey target, and
  explain the viroid risk in-universe before the player starts the scan.

## Non-Goals

- No partial-credit data quality in the first implementation. The scan either
  reaches 100% before the timer expires or fails.
- No mid-scan lander repair. Science mode captures DAN particles during the
  scan; it does not repair the defended lander until the objective ends.
- No miner-mode role during DAN.
- No new viroid variants. Difficulty scaling changes spawn rates, counts, and
  particle pressure, not enemy rules.
- No persistent crater deformation system beyond objective-load terrain setup.
  If the selected asteroid lacks a viable bowl, first cut may use the existing
  flat objective site and mark crater synthesis as follow-up.

## Player Flow

1. Player accepts a DAN asteroid mission from the Jovian Society or the Cinderline.
2. Map waypoint and `/level` transition follow the existing asteroid mission
   path.
3. Level generation places the lander in a crater-like objective site and spawns
   a faction terminal near the parked lander.
4. Player EVAs, approaches the terminal, and presses `E`.
5. The DAN scan starts:
   - timer counts down from `scanDurationSeconds` (default 45)
   - lander projects a downward beam into the crater floor
   - DAN HUD meter appears at 0%
   - neutron-return particles begin arcing out of the ground
6. Player shoots particles with science mode to fill the meter.
7. After the grace window, viroids descend from the rim and attack the lander or
   player using existing combat behavior.
8. Objective succeeds when the DAN meter reaches 100% before timeout.
9. Objective fails if the player dies, the lander hull reaches zero, or the
   timer expires before the meter is full.

## Objective Data Model

`ObjectiveType` gains a new member:

```ts
export type ObjectiveType =
  | 'gather'
  | 'exterminate'
  | 'rescue'
  | 'survey'
  | 'photometry'
  | 'dan'
  | 'collect'
```

Add scalable params:

```ts
/** Scalable params for DAN subsurface survey objectives. */
export interface DanScalableParams {
  /** Discriminator for the union type. */
  type: 'dan'
  /** Active scan duration, in seconds. Default target is 45. */
  scanDurationSeconds: NumberRange
  /** Number of particle hits required to fill the scan meter. */
  requiredParticleHits: NumberRange
  /** Seconds before viroids can spawn after the scan starts. */
  enemyGraceSeconds: NumberRange
  /** Particle pressure tier used by the DAN tuning table. */
  particleTier: 'low' | 'medium' | 'high'
  /** Enemy pressure tier used by the DAN tuning table. */
  enemyTier: 'low' | 'medium' | 'high'
}
```

Extend `ScalableParams` with `DanScalableParams`.

Extend `ConcreteObjective`:

```ts
/** For DAN: active scan duration, in seconds. */
scanDurationSeconds?: number
/** For DAN: particle hits needed to complete the meter. */
requiredParticleHits?: number
/** For DAN: seconds before viroid spawns begin. */
enemyGraceSeconds?: number
/** For DAN: particle tuning tier. */
particleTier?: 'low' | 'medium' | 'high'
/** For DAN: enemy tuning tier. */
enemyTier?: 'low' | 'medium' | 'high'
```

`MissionRegion` currently only lists `near-earth`, `asteroid-belt`, and
`kuiper-belt`, while existing Jovian Society JSON already uses
`jovian-trojans`. This spec assumes the region union has either already been
broadened or must be broadened in the same implementation pass so Society
photometry and DAN both type-check honestly.

## Mission Template Data

`src/data/missions/givers/jovian-society.json` should advertise both survey
types:

```json
"objectiveTypes": ["photometry", "dan"]
```

Add two Jovian Society DAN templates. The Society copy must keep the corporate
euphemism intact: attacks are cross-talk, interference, disturbance, or a quirk
of the instrumentation envelope.

```json
{
  "id": "jovian_subsurface_pass",
  "name": "Subsurface Verification Pass",
  "briefing": "Per current portfolio review, this asset has cleared preliminary photometric screening. Next step is DAN: Dynamic Albedo of Neutrons, with emphasis on buried volatiles and lattice traces relevant to neutron-thruster production. Kindly capture clean return particles and disregard any sensor cross-talk inside the instrumentation envelope. Warm regards, Vance Hoyt.",
  "objectiveSlots": [
    {
      "type": "dan",
      "weight": 1,
      "params": {
        "type": "dan",
        "scanDurationSeconds": { "min": 45, "max": 45 },
        "requiredParticleHits": { "min": 40, "max": 55 },
        "enemyGraceSeconds": { "min": 10, "max": 8 },
        "particleTier": "medium",
        "enemyTier": "medium"
      },
      "reward": { "min": 3000, "max": 6500 }
    }
  ],
  "completionBonus": { "min": 500, "max": 1500 },
  "regionByDifficulty": { "jovian-trojans": [4, 7] }
}
```

```json
{
  "id": "jovian_extraction_grade_dan",
  "name": "Extraction-Grade DAN Survey",
  "briefing": "Stakeholders require extraction-grade subsurface confidence before this body advances. Run a full Dynamic Albedo of Neutrons pass and classify any lattice-positive bands against the Phobos reference family. Please advise if elevated ambient disturbance compromises telemetry quality; otherwise continue the pass unless the hull is compromised. Warm regards, Vance Hoyt.",
  "objectiveSlots": [
    {
      "type": "dan",
      "weight": 1,
      "params": {
        "type": "dan",
        "scanDurationSeconds": { "min": 45, "max": 45 },
        "requiredParticleHits": { "min": 55, "max": 65 },
        "enemyGraceSeconds": { "min": 9, "max": 6 },
        "particleTier": "high",
        "enemyTier": "high"
      },
      "reward": { "min": 5000, "max": 9000 }
    }
  ],
  "completionBonus": { "min": 1500, "max": 2500 },
  "regionByDifficulty": { "jovian-trojans": [8, 10] }
}
```

Add `src/data/missions/givers/cinderline.json` if it does not already exist,
and import it into `src/lib/missions/giverCatalog.ts`. The Cinderline should be
available in the same broad difficulty range as its DAN templates and can be
host-attributed at Mercury/The Anvil in later board routing work. The first data
slice only needs the giver to generate valid asteroid missions.

The Cinderline giver should advertise DAN:

```json
"objectiveTypes": ["dan"]
```

Add two Cinderline DAN templates. Their copy must frame the same mechanic as a
listening rite. Do not use asset, data, portfolio, or telemetry language.

```json
{
  "id": "cinderline_first_listening",
  "name": "The First Listening",
  "briefing": "Pilot, the body has been listened to before from a distance. It is time to listen again. Set the pulse into the regolith and gather what reply the stone chooses to give. Hold your vigil until the answer is complete. A seat will be kept.",
  "objectiveSlots": [
    {
      "type": "dan",
      "weight": 1,
      "params": {
        "type": "dan",
        "scanDurationSeconds": { "min": 45, "max": 45 },
        "requiredParticleHits": { "min": 40, "max": 55 },
        "enemyGraceSeconds": { "min": 10, "max": 8 },
        "particleTier": "medium",
        "enemyTier": "medium"
      },
      "reward": { "min": 3000, "max": 6500 }
    }
  ],
  "completionBonus": { "min": 500, "max": 1500 },
  "regionByDifficulty": { "jovian-trojans": [4, 7] }
}
```

```json
{
  "id": "cinderline_vigil_threshold",
  "name": "Vigil at the Threshold",
  "briefing": "Pilot, this body is close to waking without our call. We do not require speed. We require attention. What replies will reply; meet it with restraint, and withdraw cleanly when the listening is done. Walk in the light.",
  "objectiveSlots": [
    {
      "type": "dan",
      "weight": 1,
      "params": {
        "type": "dan",
        "scanDurationSeconds": { "min": 45, "max": 45 },
        "requiredParticleHits": { "min": 55, "max": 65 },
        "enemyGraceSeconds": { "min": 9, "max": 6 },
        "particleTier": "high",
        "enemyTier": "high"
      },
      "reward": { "min": 5000, "max": 9000 }
    }
  ],
  "completionBonus": { "min": 1500, "max": 2500 },
  "regionByDifficulty": { "jovian-trojans": [8, 10] }
}
```

Contract steps using `objectiveType: "dan"` continue to match against generated
asteroid missions whose concrete objective contains `type: "dan"`.

## Player-Facing Copy Requirements

DAN missions need more briefing support than gather or exterminate missions
because the mechanic depends on a fictional instrument. The player should not
have to infer the acronym from HUD text.

Minimum required copy surfaces:

- Mission board title or briefing expands the acronym once: "Dynamic Albedo of
  Neutrons (DAN)."
- Mission board briefing states the job in plain verbs: pulse the ground, shoot
  return particles with science mode, defend the lander.
- Mission board briefing states the prize: buried volatiles and
  neutron-reactive lattice traces relevant to neutron-thruster production.
- Terminal pre-scan prompt gives the controls, not lore: `E START DAN SCAN`,
  `SCI captures returns`, `LASER defends lander`.
- First active-scan HUD hint says: `Capture neutron returns. Defend the lander.`
- Failure copy names the actual failure: timer expired, scanner hull lost, or
  suit integrity lost.

Tone rules:

- Corporate Society text says "asset," "return scatter," "lattice-positive,"
  "classification," and "sensor cross-talk."
- More honest helper text can say "viroids are attracted by the pulse."
- Vance never admits the pulse summons viroids. He frames it as a known
  instrumentation disturbance and lets the player's experience contradict him.

Example terminal copy:

```text
DAN SCAN READY
Dynamic Albedo of Neutrons pass armed.
Science mode captures neutron returns.
Laser mode clears pulse response fauna.
Protect scanner hull until telemetry locks.
```

## Runtime State

Add a pure domain module:

`src/lib/dan/danScanState.ts`

```ts
export type DanScanPhase = 'idle' | 'active' | 'complete' | 'failed'

export type DanScanFailureReason = 'timer-expired' | 'lander-destroyed' | 'player-died'

export interface DanScanConfig {
  readonly scanDurationSeconds: number
  readonly requiredParticleHits: number
  readonly enemyGraceSeconds: number
}

export interface DanScanState {
  readonly phase: DanScanPhase
  readonly elapsedSeconds: number
  readonly remainingSeconds: number
  readonly particleHits: number
  readonly requiredParticleHits: number
  readonly progressRatio: number
  readonly failureReason: DanScanFailureReason | null
}
```

Public functions:

```ts
createDanScanState(config: DanScanConfig): DanScanState
startDanScan(state: DanScanState): DanScanState
tickDanScan(state: DanScanState, dtSeconds: number): DanScanState
recordDanParticleHit(state: DanScanState): DanScanState
failDanScan(state: DanScanState, reason: DanScanFailureReason): DanScanState
```

Rules:

- `recordDanParticleHit` is a no-op outside `active`.
- Completion happens exactly once when `particleHits >= requiredParticleHits`.
- Timer failure happens when `elapsedSeconds >= scanDurationSeconds` and the
  scan is still below the hit target.
- All progress values clamp to `[0, 1]`.

## Particle System

Add pure spawn/motion logic under `src/lib/dan/danParticleSystem.ts`.
Rendering uses this state but does not own the rules.

```ts
export interface DanParticle {
  readonly id: number
  readonly ageSeconds: number
  readonly lifetimeSeconds: number
  readonly origin: { readonly x: number; readonly y: number; readonly z: number }
  readonly velocity: { readonly x: number; readonly y: number; readonly z: number }
  readonly radius: number
  readonly status: 'active' | 'hit' | 'expired'
}

export interface DanParticleSpawnConfig {
  readonly tickSeconds: number
  readonly spawnProbability: number
  readonly burstChance: number
  readonly maxBurstCount: number
  readonly speedMin: number
  readonly speedMax: number
  readonly lifetimeMin: number
  readonly lifetimeMax: number
  readonly originRadius: number
  readonly centerWeight: number
}
```

The Level controller supplies the crater center and deterministic seed. The
library returns new particles and updated particles each tick. It should not
import Three.js.

Hit detection can live in `ProjectileSystem` or a small FPS adapter:

- science projectiles test segment-vs-particle sphere for active DAN particles
- first hit marks the particle as `hit`
- `LevelViewController` calls `recordDanParticleHit`
- laser and drill projectiles ignore particles

Particle expiration is silent. Expired particles are removed without affecting
the scan state.

## Enemy Pressure

Use the existing enemy director and viroid behavior. Add a DAN-specific spawn
adapter in `LevelViewController` or `src/lib/fps/enemyDirector.ts` config:

- no spawn attempts before `enemyGraceSeconds`
- after grace, roll at `DAN_ENEMY_ROLL_INTERVAL_SECONDS`
- spawn points are on or above the crater rim
- spawned enemies prefer the lander if the player is outside the lander-defense
  radius; existing aggro/chase targeting should handle the rest if given the
  lander as an allowed target

First-cut target behavior:

- player closer than `DAN_PLAYER_AGGRO_RADIUS`: target player
- otherwise target lander

This keeps the tactical choice from the GDD without introducing a new AI model.

## Tuning

New file: `src/lib/dan/danTuning.ts`.

```ts
export const DAN_DEFAULT_SCAN_DURATION_SECONDS = 45
export const DAN_SCAN_TARGET_PROGRESS = 1
export const DAN_ENEMY_ROLL_INTERVAL_SECONDS = 0.5
export const DAN_PARTICLE_TICK_SECONDS = 0.25
export const DAN_START_GRACE_SECONDS = 10
export const DAN_PARTICLE_HIT_RADIUS = 0.35
export const DAN_LANDER_DEFENSE_RADIUS = 6
export const DAN_PLAYER_AGGRO_RADIUS = 8
```

Difficulty table:

```ts
export const DAN_DIFFICULTY_PRESETS = {
  low: {
    requiredParticleHits: 40,
    particleSpawnProbability: 0.7,
    particleBurstChance: 0.08,
    particleLifetimeSeconds: [2.4, 3.4],
    particleSpeed: [4, 6],
    enemySpawnProbability: 0.16,
    enemyGraceSeconds: 10,
    craterRadius: 14,
  },
  medium: {
    requiredParticleHits: 50,
    particleSpawnProbability: 0.82,
    particleBurstChance: 0.16,
    particleLifetimeSeconds: [2.0, 3.0],
    particleSpeed: [5, 8],
    enemySpawnProbability: 0.24,
    enemyGraceSeconds: 9,
    craterRadius: 11,
  },
  high: {
    requiredParticleHits: 65,
    particleSpawnProbability: 0.92,
    particleBurstChance: 0.28,
    particleLifetimeSeconds: [1.6, 2.5],
    particleSpeed: [7, 10],
    enemySpawnProbability: 0.34,
    enemyGraceSeconds: 7,
    craterRadius: 9,
  },
} as const
```

Exact values are first-cut tunables. The important invariant is that a perfect
run can complete near 30 seconds, a competent run near 40 seconds, and a sloppy
run times out close to completion.

## Controllers And Rendering

Add Three.js controller:

`src/three/DanScanController.ts`

Responsibilities:

- own particle meshes and hit/expire VFX
- render the lander's downward beam while active
- render a short data-stream line from hit particle to lander
- emit completion pulse when the domain scan reaches `complete`
- dispose all DAN meshes on level teardown or objective reset

Suggested visuals:

- particles: small cyan/green emissive spheres with short trails
- hit: small flash plus audio click
- beam: translucent cone or cylinder from lander underside to crater floor
- completion: wireframe pulse expanding from the lander, matching photometry's
  completion language

The controller receives state snapshots and events from `LevelViewController`.
It should not decide completion, timer failure, or mission rewards.

## HUD

Extend the existing level HUD data model with an optional DAN block:

```ts
export interface DanHudState {
  readonly visible: boolean
  readonly progressRatio: number
  readonly particleHits: number
  readonly requiredParticleHits: number
  readonly remainingSeconds: number
  readonly phase: DanScanPhase
  readonly failureReason: DanScanFailureReason | null
}
```

HUD requirements:

- top-center `DAN SCAN` meter with percentage or `hits / required` readout
- countdown timer from `0:45`
- lander hull visible and more prominent than normal EVA HUD
- one-frame or short-lived hit blip on successful particle capture
- optional telemetry text feed for Society flavor

The `.vue` surface stays markup-only. Formatting and layout go in
`src/assets/css/main.css`; state assembly belongs in the corresponding view
controller.

## Level Integration

`LevelViewController` owns orchestration:

1. Detect active asteroid mission objective with `type === 'dan'`.
2. Build `DanScanConfig` from concrete objective fields and tuning presets.
3. Place objective site:
   - prefer a crater-like site on the upright face
   - use existing objective placement as fallback
4. Spawn lander, terminal, and DAN controller at that site.
5. On terminal interaction, call `startDanScan`.
6. On each tick while active:
   - tick scan timer
   - tick particle spawner and particle motion
   - tick DAN enemy spawn roll after grace
   - publish HUD state
7. On science projectile hit against a particle:
   - mark particle hit
   - call `recordDanParticleHit`
   - trigger particle hit VFX/audio
8. On completion:
   - stop particle/enemy spawning
   - complete the DAN objective through the existing mission objective path
   - fire completion pulse and mission-complete audio
9. On failure:
   - route through existing mission failure UX
   - allow restart from the beginning of the scan

The implementation should use the existing level state machine where possible.
If that state machine needs a new objective phase, prefer `objective-active`
metadata over a separate DAN-only scene state.

## RTG And Tool Rules

- Science mode captures particles.
- Laser mode damages viroids.
- Drill/miner mode has no DAN interaction.
- During active DAN scans, science particle hits should have zero or negligible
  RTG drain. The player's pressure budget is already timer + hull + enemies +
  mode swapping. Normal science RTG behavior can continue outside active DAN.
- Science mode does not repair the lander during active DAN. If a science bolt
  intersects both a particle and the lander, particle capture wins.

## Failure And Restart

Failure reasons:

- `timer-expired`: timer reaches zero with incomplete meter
- `lander-destroyed`: hull reaches zero during active scan
- `player-died`: EVA suit death during active scan

Restart resets:

- `DanScanState`
- active particles
- active DAN-spawned enemies
- terminal state back to interactable

Restart should not silently repair global persistent lander hull unless the
existing mission retry system already does so. If the current level retry path
restores mission-start hull, DAN follows that behavior for consistency.

## File Inventory

New files:

- `src/lib/dan/danScanState.ts`
- `src/lib/dan/danParticleSystem.ts`
- `src/lib/dan/danTuning.ts`
- `src/lib/dan/__tests__/danScanState.spec.ts`
- `src/lib/dan/__tests__/danParticleSystem.spec.ts`
- `src/three/DanScanController.ts`

Modified files:

- `src/lib/missions/types.ts` - add `dan` objective type and params
- `src/lib/missions/asteroidMissionGenerator.ts` - roll DAN concrete fields
- `src/data/missions/givers/jovian-society.json` - add Society DAN mission templates
- `src/data/missions/givers/cinderline.json` - add Cinderline DAN mission templates
- `src/lib/missions/giverCatalog.ts` - register Cinderline giver data
- `src/data/contracts/jovian-society-prospection.json` - no structural change
  expected; existing `objectiveType: "dan"` should begin matching
- `src/lib/fps/projectileSystem.ts` - science projectile hit tests for active
  DAN particles
- `src/views/LevelViewController.ts` - objective orchestration
- `src/views/LevelView.vue` or level HUD component - render `DanHudState`
- `src/lib/ui/landerHudTypes.ts` - optional DAN HUD state field
- `src/assets/css/main.css` - DAN HUD styling
- audio catalog/director files - add scan hum, particle hit, and completion cues

## Testing

Unit tests in `src/lib/dan/`:

- `createDanScanState` initializes idle state with full remaining time and zero
  progress.
- `startDanScan` moves idle to active and does not reset an already active scan.
- `tickDanScan` decrements remaining time and fails exactly once on timeout.
- `recordDanParticleHit` increments hits only while active.
- `recordDanParticleHit` completes exactly when required hits are reached.
- `failDanScan` preserves the first failure reason.
- particle spawning is deterministic for a fixed seed and config.
- particle bursts respect `maxBurstCount`.
- particles expire after lifetime and never report active after expiration.

Mission tests in `src/lib/missions/__tests__/`:

- giver catalog accepts `dan` in `objectiveTypes`.
- asteroid mission generator can roll a DAN objective with concrete
  `scanDurationSeconds`, `requiredParticleHits`, `enemyGraceSeconds`,
  `particleTier`, and `enemyTier`.
- contract filtering by `objectiveType: "dan"` matches DAN asteroid missions.

Integration-style tests where practical:

- a science projectile fired through an active particle reports one particle
  hit and completes the particle only once.
- laser and drill projectiles do not hit DAN particles.
- DAN completion calls the same objective completion callback path as other
  asteroid objectives.

Rendering controllers are not unit-tested per project convention. Keep their
logic thin enough that the domain tests cover the rules.

## Open Questions

- Crater selection can be first-class terrain analysis or a simpler authored
  objective bowl. The gameplay needs a defensible bowl; the first implementation
  can fake the crater if terrain analysis is expensive.
- The Jovian Prospectus finale may eventually read DAN data quality. This spec
  keeps DAN binary. A later pass can store `quality: "clean" | "noisy"` if the
  narrative choice needs it.
- If existing mission retry restores hull to mission-start values, DAN inherits
  that. If not, decide whether repeated DAN attempts can grind down persistent
  lander hull before implementation.
