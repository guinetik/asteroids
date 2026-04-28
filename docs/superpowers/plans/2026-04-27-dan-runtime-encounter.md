# DAN Runtime Encounter Implementation Plan (B2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make DAN missions playable end-to-end. Land in a real crater, interact with a faction terminal, run the 45-second neutron scan while shooting particles with SCI mode and defending the parked lander from viroids with LASER mode. Succeed at meter-fill or fail on timer/lander/death. Reward scales with completion quality.

**Spec:** `docs/superpowers/specs/2026-04-27-dan-mission-design.md`

**Depends on:**
- Plan A (DAN data model — types, generator, templates, region union)
- Plan B1 (`chooseDanCraterPlacement`, `findCratersInHeightmap`, `applyCraterToHeightmap`)

This is the largest of the three slices. Where the implementing agent finds a sub-task gets too big to land cleanly, prefer to ship intermediate state in a working commit (data + tests pass) rather than holding a sprawling diff. The task ordering below is structured so each task ends in a green tree.

---

## Architecture Summary

The encounter mirrors **photometry** end-to-end. PhotometryMinigame (`src/lib/minigame/PhotometryMinigame.ts`) is the structural template. Where DAN diverges:

| Aspect | Photometry | DAN |
|--------|-----------|-----|
| Player vehicle | Lander pilots a steady scan | Lander parks; player EVAs |
| Tool used | Lander beam (auto) | Player SCI mode for capture, LASER for defense |
| Defended asset | None (just hold steady) | Parked lander (viroids attack it) |
| Failure modes | Timer expires | Timer + lander hull + player death |
| Particles | None | Neutron returns spawned from crater floor |
| Enemies | None | Viroids spawn from crater rim after grace |
| Reward | Binary | Partial credit by capture quality |
| Crater | Not needed | Required (uses B1's `chooseDanCraterPlacement`) |

**Module layout (locked, do not deviate):**
- `src/lib/minigame/DanMinigame.ts` — state machine + tuning constants + step list (mirrors `PhotometryMinigame.ts`)
- `src/three/DanScanController.ts` — particle meshes, lander beam visual, completion pulse, scan target marker
- `src/three/DanParticleEmitter.ts` (optional, if controller gets too large) — particle pool + lifetime
- No `src/lib/dan/` directory.

---

## Acceptance Criteria

- A DAN mission accepted from the map plays through to completion in `/level`: arrival, crater landing, terminal interact (start scan), scan window, terminal interact (deliver telemetry), success.
- The lander spawns at the crater center returned by `chooseDanCraterPlacement`. The terminal is placed nearby.
- Active scan: timer counts down, neutron particles spawn from crater floor, SCI bolts capture them and tick the meter, LASER bolts kill viroids, viroids prefer the lander when player is far from it.
- Timer expiring is **not** a failure — it transitions to an `awaitingDelivery` phase. Particles stop spawning, beam fades, the HUD prompts the player to walk back to the terminal and deliver.
- On delivery: capture quality (`hits / requiredHits`, clamped) interpolates the reward between `rewardMin` and `reward`. Quality at 100% pays full template max. Quality below `DAN_MIN_QUALITY_FOR_COMPLETION` fails with `'no-data-captured'` and pays nothing.
- Two hard failure paths trigger the existing mission-fail UX: lander hull reaching zero, player suit death (during scan or delivery walk-back).
- Failure permits retry from the terminal (mirrors photometry's `[E] RETRY` flow).
- All non-DAN missions still play exactly as before. Tests for other minigames are unchanged. Reward path stays backward-compatible (objectives without `rewardMin` get full reward as today).
- `bun run type-check`, `bun run lint`, `bun test:unit` all pass.

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `src/lib/missions/types.ts` | Modify | Add `rewardMin?` and `actualReward?` to `ConcreteObjective` |
| `src/lib/missions/asteroidMissionRewards.ts` | Modify | Sum `actualReward ?? reward` per objective at persist |
| `src/lib/missions/__tests__/asteroidMissionRewards.spec.ts` | NEW or extend | Partial-credit interpolation tests |
| `src/lib/minigame/DanMinigame.ts` | NEW | State machine, tuning, step list |
| `src/lib/minigame/__tests__/DanMinigame.spec.ts` | NEW | State machine unit tests |
| `src/three/DanScanController.ts` | NEW | Particle visuals, beam, completion pulse |
| `src/lib/fps/projectileSystem.ts` | Modify | DAN particle registry + SCI cascade hook |
| `src/lib/fps/__tests__/projectileSystem.spec.ts` | NEW or extend | Particle hit-test test |
| `src/lib/level/LevelMinigameFacade.ts` | Modify | Add `dan` factory branch + new bindings fields |
| `src/views/LevelViewController.ts` | Modify | DAN integration: call B1 chooser, place lander/terminal, wire bindings |
| `src/lib/ui/landerHudTypes.ts` | Reference / minor | Reuse existing `survey*` fields for DAN |
| `src/lib/level/LevelTelemetryFacade.ts` | Modify | Source DAN HUD state from active minigame |
| `src/components/LanderHud.vue` | Reference / minor | Existing survey HUD block already renders timer + progress |
| `src/audio/DanScanSound.ts` | NEW | Mirror `PhotometryScanSound` |
| `src/audio/audioDirector.ts` (or equivalent) | Modify | Hook DanScanSound into the level audio director |

---

## Task 1: Discovery + Confirm Assumptions

- [ ] **Step 1: Read structural references**

Before writing any code, read in full:
- `src/lib/minigame/PhotometryMinigame.ts` — the template DAN mirrors.
- `src/lib/minigame/MiniGame.ts` — the base interface contract.
- `src/lib/level/LevelMinigameFacade.ts` — factory pattern + bindings shape.
- `src/lib/fps/projectileSystem.ts` — focus on the SCI cascade (hostage → satellite → shuttle → lander → rocket → rocks). Locate where to insert the DAN particle branch.
- `src/three/PhotometryProbeController.ts` — visual controller pattern.
- `src/lib/level/LevelTelemetryFacade.ts` and `src/components/LanderHud.vue` — how `surveyTimeRemaining` / `surveyProbesCollected` already power photometry's HUD.
- `src/audio/PhotometryScanSound.ts` (or whichever file owns photometry audio) — DAN scan audio mirrors this.

- [ ] **Step 2: Note any deltas**

If any of the following assumptions in this plan turn out to be wrong, update the plan checklist and proceed:
- Photometry's HUD reuses `surveyTimeRemaining` / `surveyProbesCollected` / `surveyProbesTotal` plus `minigameProgressLabel` to render the scan readout. DAN reuses the same fields.
- `MiniGameEvents` exposes `onPrompt`, `onComplete`, `onStepChange`. DAN uses `onComplete(objectiveIndex)` for success.
- `ProjectileSystem.spawn(origin, direction, color, boltKind)` already routes by `boltKind`, and `'science'` already cascades through optional callbacks before falling through to combat targets.

If any of these are stale, prefer matching the codebase over matching this plan.

---

## Task 2: Partial-Credit Reward Infrastructure

This must land before DAN can use it; a binary objective with no quality data still works exactly as today.

- [ ] **Step 1: Extend `ConcreteObjective`**

In `src/lib/missions/types.ts`, add two optional fields:

```ts
/** Lower bound of reward when the objective supports partial credit (DAN). Omitted = binary objective; full `reward` always granted on completion. */
rewardMin?: number
/** Reward actually granted at completion time. Set by the level controller when partial-credit objectives finish. Falls back to `reward` for binary objectives at persist time. */
actualReward?: number
```

- [ ] **Step 2: Update DAN slot rolling to populate `rewardMin`**

In `src/lib/missions/asteroidMissionGenerator.ts`, the `case 'dan':` branch from Plan A returns `reward: interpolateRange(slot.reward, difficulty)`. Extend it to also set `rewardMin`:

```ts
case 'dan': {
  const rewardMax = interpolateRange(slot.reward, difficulty)
  return {
    type: 'dan',
    x: 0,
    z: 0,
    scanDurationSeconds: interpolateRange(slot.params.scanDurationSeconds, difficulty),
    requiredParticleHits: interpolateRange(slot.params.requiredParticleHits, difficulty),
    enemyGraceSeconds: interpolateRange(slot.params.enemyGraceSeconds, difficulty),
    particleTier: slot.params.particleTier,
    enemyTier: slot.params.enemyTier,
    reward: rewardMax,
    rewardMin: Math.round(rewardMax * DAN_REWARD_FLOOR_RATIO),
  }
}
```

Add `DAN_REWARD_FLOOR_RATIO` as a named constant (e.g., `0.25` — a 25% floor for any DAN that completes the terminal interact even with poor capture). Document the rationale: the player committed time; full no-show is the only zero.

The minimum-quality-to-count threshold (does a 5%-capture DAN even count as "completed"?) is a design call. Suggested: any completion above the floor pays out at least `rewardMin`, and a quality of 0 fails the objective rather than completing. This is documented in the DanMinigame state machine in Task 3.

- [ ] **Step 3: Update persist to use `actualReward`**

In `src/lib/missions/asteroidMissionRewards.ts`, change the credit calculation. Today:

```ts
const credits = Math.round(mission.totalReward * rewardMultiplier)
```

After:

```ts
const completionBonus = mission.totalReward - mission.objectives.reduce((sum, o) => sum + o.reward, 0)
const earnedObjectiveTotal = mission.objectives.reduce(
  (sum, o) => sum + (o.actualReward ?? o.reward),
  0,
)
const credits = Math.round((earnedObjectiveTotal + completionBonus) * rewardMultiplier)
```

Rationale: `mission.totalReward` was baked at generation as `sum(reward) + completionBonus`. We want to substitute per-objective `actualReward` while preserving the completion bonus. Backing out the bonus from the difference is correct because no objective is allowed to overpay above its `reward`.

- [ ] **Step 4: Tests**

Add to `src/lib/missions/__tests__/asteroidMissionRewards.spec.ts` (create if missing):

- An objective with no `actualReward` and no `rewardMin` pays out exactly its `reward` (backward compatibility for all current objective types).
- An objective with `actualReward = 1500`, `reward = 6000`, `rewardMin = 1500` pays out `1500` plus its share of completion bonus.
- An objective with `actualReward = 6000` (full quality) pays the same as binary (`reward`).
- Multiple objectives with mixed quality sum correctly.

Mock or stub `loadProfile`, `addCredits`, `saveProfile` etc. as needed — the test focuses on the credit arithmetic, not persistence side effects.

---

## Task 3: DanMinigame State Machine

This is the largest single file. Mirror `PhotometryMinigame.ts` structurally.

- [ ] **Step 1: Constants block at top**

```ts
/** Default DAN scan duration when objective omits it. Seconds. */
const DEFAULT_DAN_SCAN_DURATION_SECONDS = 45
/** Default required particle hits when objective omits it. */
const DEFAULT_DAN_REQUIRED_PARTICLE_HITS = 50
/** Default grace seconds before viroids spawn after scan starts. */
const DEFAULT_DAN_ENEMY_GRACE_SECONDS = 9
/** Spawn poll interval for DAN viroid director, after grace. Seconds. */
const DAN_ENEMY_ROLL_INTERVAL_SECONDS = 0.5
/** Particle spawner tick interval. Seconds. */
const DAN_PARTICLE_TICK_SECONDS = 0.25
/** Hit-sphere radius for SCI projectile vs particle test. World units. */
const DAN_PARTICLE_HIT_RADIUS = 0.7
/** Distance from lander where the player is considered "defending the lander". */
const DAN_LANDER_DEFENSE_RADIUS = 8
/** Distance from player where viroids prefer the player target over the lander. */
const DAN_PLAYER_AGGRO_RADIUS = 8
/** Terminal interact range (matches photometry's TERMINAL_INTERACT_RANGE). */
const DAN_TERMINAL_INTERACT_RANGE = 30
/** Minimum capture ratio (0-1) for a DAN scan to count as completed. Below this, scan fails. */
const DAN_MIN_QUALITY_FOR_COMPLETION = 0.05
/** HUD instruction strings (no magic strings inline). */
const DAN_INSTRUCTION_PRESCAN = '[E] START DAN SCAN'
const DAN_INSTRUCTION_SCAN_RUNNING = 'CAPTURE NEUTRON RETURNS'
const DAN_INSTRUCTION_RETURN_TELEMETRY = 'RETURN DAN TELEMETRY TO TERMINAL'
const DAN_INSTRUCTION_DELIVER = '[E] DELIVER DAN TELEMETRY'
const DAN_INSTRUCTION_RETRY = '[E] RETRY DAN SCAN'
const DAN_INSTRUCTION_NO_DATA = 'NO USABLE DATA — RETRY SCAN'
const DAN_INSTRUCTION_LANDER_LOST = 'SCANNER HULL LOST'
const DAN_INSTRUCTION_PLAYER_LOST = 'SUIT INTEGRITY LOST'
```

Tier-based particle/enemy tuning lookup (consumed by DanScanController + enemy director) lives in this same file as a const map keyed on `DanPressureTier`:

```ts
interface DanTierTuning {
  particleSpawnProbability: number
  particleBurstChance: number
  particleSpeedMin: number
  particleSpeedMax: number
  particleLifetimeMin: number
  particleLifetimeMax: number
  enemySpawnProbability: number
}
const DAN_TIER_TUNING: Record<DanPressureTier, DanTierTuning> = { low: {...}, medium: {...}, high: {...} }
```

First-cut numbers may follow the spec's tuning table; expect tweaks during playtest.

- [ ] **Step 2: Class skeleton**

```ts
export class DanMinigame implements MiniGame, MiniGameEvents {
  readonly objectiveIndex: number

  private _status: MiniGameStatus = 'idle'
  private _timeRemaining: number
  private _isPlayerNear = false
  private particleHits = 0
  private requiredHits: number
  private scanDuration: number
  private graceRemaining: number
  private failureReason: DanFailureReason | null = null
  private readonly _steps: MiniGameStep[] = [
    { label: 'Locate the terminal', complete: false, active: true },
    { label: 'Start the DAN scan', complete: false, active: false },
    { label: 'Capture neutron returns', complete: false, active: false },
    { label: 'Return DAN telemetry', complete: false, active: false },
  ]

  // visual handles
  private readonly terminal: TerminalModel
  private scanController: DanScanController | null = null

  // crater context (passed in at construct)
  private readonly craterX: number
  private readonly craterZ: number
  private readonly craterRadius: number
  private readonly craterDepth: number

  // event sinks
  onPrompt: ((text: string | null) => void) | null = null
  onComplete: ((objectiveIndex: number) => void) | null = null
  onStepChange: ((objectiveIndex: number, steps: readonly MiniGameStep[]) => void) | null = null
  onRegisterTickable: ((tickable: Tickable) => void) | null = null
  onUnregisterTickable: ((tickable: Tickable) => void) | null = null
  onScanAudioState: ((state: DanScanAudioState) => void) | null = null
  onParticleHit: (() => void) | null = null
  onCompletionPulse: (() => void) | null = null

  // ... constructor takes objective + scene + heightmap + crater placement + asteroidRoot
  // ... tick(dt, ctx), start(), recordParticleHit(), notifyLanderDestroyed(), notifyPlayerDied()
}
```

- [ ] **Step 3: State transitions**

DAN follows the survey / photometry "deliver to terminal" pattern. The scan window opens at the terminal, runs for `scanDurationSeconds`, then closes — at which point the player walks back to the terminal and hands in the data. Any nonzero capture pays out at least `rewardMin`; a successful delivery with zero hits below the quality floor refuses to pay (counts as fail).

Phases:

```
idle → active → awaitingDelivery → complete
              ↘                  ↘
                failed             failed
```

Public methods:

```ts
start(): void                          // idle → active via terminal interact. Refuels lander (per spec).
recordParticleHit(): void              // active only. Increments hit count.
deliver(): void                        // awaitingDelivery → complete via terminal interact at the end.
notifyLanderDestroyed(): void          // active or awaitingDelivery → failed with 'lander-destroyed'.
notifyPlayerDied(): void               // active or awaitingDelivery → failed with 'player-died'.
tick(dt: number, ctx: MiniGameContext): void
```

`tick()` responsibilities by phase:

- **idle:** check player proximity to terminal; emit `onPrompt(DAN_INSTRUCTION_PRESCAN)` when near, `null` when far. Press E → `start()`.
- **active:**
  - Decrement `_timeRemaining`. When it reaches 0 → transition to `awaitingDelivery` (this is **not** a failure — the player still has to walk back).
  - Decrement `graceRemaining`. After grace expires, set a flag the level controller reads (`shouldSpawnEnemies: boolean`). The minigame does not own enemy spawning — see Task 7.
  - Update `scanController?.tick(dt, particleHits, requiredHits)` to drive visuals.
  - Emit `onScanAudioState({ visible: true, intensity: progress, particleSpawnRate })` so audio scales with phase.
  - **Optional early-out:** if `particleHits >= requiredHits` (player capped the meter), still let the timer run — there's no design value in ending the scan early, and viroid pressure should remain a threat for the full window. Document this choice in code: "no auto-complete on meter cap; window always runs full duration."
- **awaitingDelivery:**
  - Stop spawning particles, fade beam, stop viroid spawn rolls. Existing live viroids and particles complete naturally.
  - Emit `onPrompt(DAN_INSTRUCTION_DELIVER)` when player is near the terminal.
  - Emit `missionInstruction = DAN_INSTRUCTION_RETURN_TELEMETRY` for the lander HUD.
  - Press E at terminal → `deliver()`.
- **complete / failed:** terminal prompts for retry or extract per existing photometry pattern.

`deliver()` logic:
- Compute `quality = clamp01(particleHits / requiredHits)`.
- If `quality < DAN_MIN_QUALITY_FOR_COMPLETION`: route through fail path with `failureReason = 'no-data-captured'` — the player can retry the scan from the terminal. (No reward; the quality floor exists so a player who never fired SCI doesn't get paid for walking to the terminal twice.)
- Else: set `objective.actualReward = Math.round(lerp(objective.rewardMin ?? objective.reward, objective.reward, quality))`, fire `onCompletionPulse()`, then `onComplete(objectiveIndex)`.

Failure logic (for `notifyLanderDestroyed` / `notifyPlayerDied` / sub-floor delivery):
- Set `_status = 'failed'`, store `failureReason`.
- Set `objective.actualReward = 0`.
- Player can retry from the terminal (start a fresh scan). Lander/player death routes through the level's existing fail UX, not the minigame's retry.

Failure reasons the minigame tracks:

```ts
type DanFailureReason = 'lander-destroyed' | 'player-died' | 'no-data-captured'
```

Note: `'timer-expired'` is intentionally absent — running out the clock is normal play, not failure. The window closing transitions to `awaitingDelivery`, not `failed`.

- [ ] **Step 4: HUD getters**

Reuse the photometry pattern: expose `timeRemaining`, `progressCurrent` (= particleHits), `progressTotal` (= requiredHits), `missionInstruction`, `steps`. The HUD layer keeps using `surveyTimeRemaining` / `surveyProbesCollected` / `surveyProbesTotal` and Level controller already routes those (see Task 8).

- [ ] **Step 5: Tests**

`src/lib/minigame/__tests__/DanMinigame.spec.ts`. Mock or stub the `TerminalModel` and `DanScanController` constructors (or design the class so they can be injected; PhotometryMinigame's pattern is a good reference). Test the pure state machine:

- `start()` from `idle` transitions to `active` and refuels.
- `start()` from `active` is a no-op.
- `tick` decrements time correctly; transitions `active → awaitingDelivery` when timer reaches 0 (NOT failure).
- `recordParticleHit()` while not `active` is a no-op (no hits during awaitingDelivery / complete / failed).
- `recordParticleHit()` increments hit counter; does **not** auto-complete on cap (window runs full duration).
- `deliver()` from `awaitingDelivery` with sufficient quality transitions to `complete` and sets `actualReward` to interpolated value. Test against known case: `reward = 6000, rewardMin = 1500, hits = 25, required = 50` → expect `actualReward = 3750`.
- `deliver()` from `awaitingDelivery` with quality below `DAN_MIN_QUALITY_FOR_COMPLETION` transitions to `failed` with reason `'no-data-captured'` and `actualReward = 0`.
- `deliver()` from any state other than `awaitingDelivery` is a no-op.
- `notifyLanderDestroyed` from `active` or `awaitingDelivery` fails with `'lander-destroyed'`.
- `notifyPlayerDied` from `active` or `awaitingDelivery` fails with `'player-died'`.
- Failure preserves the first failure reason (subsequent notify calls don't overwrite).
- Quality at exact threshold (`DAN_MIN_QUALITY_FOR_COMPLETION`) is treated as success, not fail (closed lower bound).

---

## Task 4: DanScanController (Three.js)

- [ ] **Step 1: Public API**

`src/three/DanScanController.ts`:

```ts
export interface DanScanControllerOptions {
  scene: THREE.Scene
  asteroidRoot: THREE.Object3D | null
  craterX: number
  craterZ: number
  craterY: number       // surface Y at crater center
  craterRadius: number
  craterDepth: number
  particleTuning: DanTierTuning
  projectileSystem: ProjectileSystem
  onParticleHit: () => void   // called when a SCI projectile registers a hit (Task 5 routes to this)
}

export class DanScanController implements Tickable {
  constructor(options: DanScanControllerOptions)
  setLanderAnchor(anchor: THREE.Object3D | null): void   // for the downward beam visual
  beginScan(): void                                       // start spawning particles + show beam
  tick(dt: number): void
  triggerCompletionPulse(): void
  endScan(): void                                         // stop spawning, fade visuals
  dispose(): void
}
```

- [ ] **Step 2: Particle pool**

Pre-allocate `MAX_DAN_PARTICLES` (suggested 64) particle meshes (small emissive spheres, cyan/green) plus short trail or sprite. Each particle has lifetime, velocity, hit/expire status. Spawn from random points inside the crater bowl (uniform in `[0, craterRadius]` with center bias) with upward + outward velocity. Update positions each tick.

When a particle is created, register it with `projectileSystem.addDanParticle({ spawnIndex, x, y, z, radius: DAN_PARTICLE_HIT_RADIUS })`. When it expires or is captured, call `removeDanParticle(spawnIndex)`. The registry shape mirrors `MineableRockEntry` from existing rock registration.

- [ ] **Step 3: Beam + completion pulse**

Render a translucent cone or cylinder from the lander's underside down to the crater floor while scanning. On `triggerCompletionPulse()`, expand a wireframe ring outward from the lander matching the photometry completion language.

- [ ] **Step 4: No tests**

Per project convention, three.js controllers are not unit-tested. Keep the controller thin and push state rules into `DanMinigame`.

---

## Task 5: ProjectileSystem — DAN Particle Hit Cascade

- [ ] **Step 1: Add the registry**

In `src/lib/fps/projectileSystem.ts`, add a registry analogous to mineable rocks:

```ts
interface DanParticleEntry {
  spawnIndex: number
  cx: number
  cy: number
  cz: number
  radius: number
}
private readonly danParticles: DanParticleEntry[] = []

addDanParticle(entry: DanParticleEntry): void
removeDanParticle(spawnIndex: number): void
```

- [ ] **Step 2: Cascade hook**

In the SCI bolt hit cascade (look for the science branch around lines 440–546 per the earlier exploration), insert a particle hit-test before falling through to rocks. Order:

1. Existing hostage / satellite / shuttle / lander / rocket / rocks cascade up through rocket.
2. **NEW: closest DAN particle along the bolt segment.** Use the same swept-sphere helper as rocks (`segmentEnterSphereT`).
3. If a particle is hit before any rock: fire `onScienceDanParticleHit(spawnIndex, hitPos)`, remove the particle from the registry, return.
4. Otherwise fall through to the existing rock check.

Add the callback type:

```ts
onScienceDanParticleHit: ((spawnIndex: number, pos: { x: number; y: number; z: number }) => void) | null
```

- [ ] **Step 3: Wire from DanScanController**

Pass `onScienceDanParticleHit = (idx, pos) => { this.options.onParticleHit() }` from controller construction site. The `onParticleHit` callback the level layer supplies routes to `DanMinigame.recordParticleHit()` and triggers the local hit VFX/audio.

- [ ] **Step 4: Tests**

In `src/lib/fps/__tests__/projectileSystem.spec.ts` (extend or create):

- A SCI projectile fired through a registered DAN particle calls `onScienceDanParticleHit` exactly once and removes the particle.
- A LASER (`'weapon'`) projectile fired through the same particle does **not** call the DAN hit callback.
- A DRILL (`'drill'`) projectile fired through the same particle does **not** call the DAN hit callback.
- When both a particle and a rock are along the bolt path, the particle is hit (closer-first), the rock is untouched.
- Removing a particle by `spawnIndex` makes subsequent bolts pass through that location.

---

## Task 6: LevelMinigameFacade — DAN Branch

- [ ] **Step 1: Extend `LevelMinigameBindings`**

In `src/lib/level/LevelMinigameFacade.ts`, add fields (mirroring the photometry ones where applicable):

```ts
/** DAN scan audio state sink — drives scan hum + intensity. */
onDanScanAudioState: ((state: DanScanAudioState) => void) | null
/** DAN particle hit cue — short click + spark when SCI bolt captures a particle. */
onDanParticleHit: (() => void) | null
/** DAN completion pulse cue. */
onDanCompletionPulse: (() => void) | null
/** Crater placement chosen at level boot, required to construct DanMinigame. */
danCraterPlacement: DanCraterPlacement | null
```

(Or pass `danCraterPlacement` through `LevelMinigameInitParams` instead of bindings — the implementing agent decides which fits the existing shape better. The crater placement is per-mission, computed at boot, immutable for the run.)

- [ ] **Step 2: Add the DAN factory branch**

In `initializeObjectives`, after the `photometry` branch:

```ts
} else if (objective.type === 'dan') {
  const placement = bindings.danCraterPlacement
  if (!placement) {
    throw new Error('[LevelMinigameFacade] dan objective requires danCraterPlacement on bindings')
  }
  const minigame = new DanMinigame({
    objectiveIndex: i,
    objective,
    scene,
    heightmap,
    asteroidRoot,
    craterPlacement: placement,
    projectileSystem,
    seed: missionSeed,
  })
  this.applySharedBindings(minigame, bindings)
  minigame.onRegisterTickable = bindings.onRegisterTickable
  minigame.onUnregisterTickable = bindings.onUnregisterTickable
  minigame.onScanAudioState = bindings.onDanScanAudioState
  minigame.onParticleHit = bindings.onDanParticleHit
  minigame.onCompletionPulse = bindings.onDanCompletionPulse
  objectiveColliders.push(...(minigame.worldColliders ?? []))
  this.add(minigame)
}
```

`applySharedBindings` already wires `onPrompt`, `onComplete`, `onStepChange`. No change needed there.

---

## Task 7: LevelViewController Integration

The biggest single change. Touch this carefully — `LevelViewController.ts` is ~2900 lines and most missions flow through it.

- [ ] **Step 1: Detect DAN at boot**

In `LevelViewController.start()`, after `resolveLevelContext(...)`:

```ts
const danObjective = mission.objectives.find((o) => o.type === 'dan')
const danPlacement: DanCraterPlacement | null = danObjective
  ? await chooseDanCraterPlacement(asteroid, seed, danSpecFromObjective(danObjective), bakeOptionsFromAsteroid(asteroid))
  : null
```

- `danSpecFromObjective(obj)` extracts target radius + min depth from tuning constants in `DanMinigame` (or from `DAN_TIER_TUNING[obj.particleTier]`).
- `bakeOptionsFromAsteroid(asteroid)` produces the same `BakeHeightmapFromMeshOptions` already used by `createAsteroidSurface`. Extract into a helper if it isn't already one.

- [ ] **Step 2: Apply rotation override**

When calling `createAsteroidSurface`, replace `rotation: rotationFromSeed(seed, asteroid.shape.rotationLottery)` with:

```ts
rotation: danPlacement?.rotation ?? rotationFromSeed(seed, asteroid.shape.rotationLottery)
```

So DAN missions use the chosen rotation; everything else is unchanged.

- [ ] **Step 3: Apply synthesis fallback**

After `this.heightmap = this.asteroidSurface.heightmap`, if DAN and `danPlacement.source === 'synthesized'`:

```ts
if (danPlacement && danPlacement.source === 'synthesized') {
  applyCraterToHeightmap(this.heightmap, {
    x: danPlacement.crater.x,
    z: danPlacement.crater.z,
    radius: danPlacement.crater.radius,
    depth: danPlacement.crater.depth,
  })
}
```

This deforms the baked heightmap *in place*. Note: it does not deform the visible GLB mesh — the player will see a flat surface where the heightmap reports a crater. **That visual mismatch is acceptable for the first cut**; the synthesis path is the fallback when no natural crater exists, and the encounter remains playable. A later polish slice can deform mesh vertices to match.

- [ ] **Step 4: Override lander spawn for DAN**

The current spawn uses `sampleSpawnOnSurface(heightmap, ...)`. For DAN, override:

```ts
const spawn = danPlacement
  ? { x: danPlacement.crater.x, z: danPlacement.crater.z }
  : sampleSpawnOnSurface(this.heightmap, { ... })
```

The lander's Y is sampled from `heightmap.heightAt(spawn.x, spawn.z)` per the existing pattern.

- [ ] **Step 5: Pass placement into the facade**

In the `LevelMinigameInitParams` (or bindings) construction, include `danCraterPlacement: danPlacement`. The facade's DAN branch uses it.

- [ ] **Step 6: DAN enemy spawn integration**

DAN viroid pressure does **not** create a new enemy AI. Reuse the existing enemy director (`src/lib/fps/enemyDirector.ts`). The implementing agent must:

- After `DanMinigame.start()` and after `graceRemaining` expires, begin an enemy spawn poll (every `DAN_ENEMY_ROLL_INTERVAL_SECONDS`) that picks a spawn point on the crater rim (use `danPlacement.crater.x/z + radius` with random angle) and requests a viroid spawn from the director.
- Spawned enemies should target the player when `playerDistance < DAN_PLAYER_AGGRO_RADIUS`, otherwise the lander. If the existing director already supports allowed-targets configuration, use it; if not, the simplest first cut is to have DAN-spawned enemies use the same chase behavior as exterminate viroids and let the level controller manage damage routing.
- When the lander hull reaches zero from these viroids, route the existing `onDestroyLander('exterminate')` (or add `'dan'` cause if it improves logging) and call `DanMinigame.notifyLanderDestroyed()`.

This step is the most likely to need adaptation. The implementing agent should read `enemyDirector.ts` and `ExterminateMinigame.ts` first, then decide whether to add a small `DanEnemyDirector` wrapper or extend the existing director with a DAN config. Prefer the wrapper if it keeps existing enemy code untouched.

- [ ] **Step 7: Player death routing**

When `onKillPlayer` fires during an active DAN scan, also call `DanMinigame.notifyPlayerDied()`. The level controller's existing damage path can branch on `activeMinigame instanceof DanMinigame` (or duck-type check `'notifyPlayerDied' in activeMinigame`).

---

## Task 8: HUD Wiring

- [ ] **Step 1: Reuse the survey/photometry HUD fields**

Photometry already populates `surveyTimeRemaining` / `surveyProbesCollected` / `surveyProbesTotal` + `minigameProgressLabel = 'SCAN'` for its phase. DAN does the same:

In `LevelTelemetryFacade.ts` (or wherever `LanderTelemetry` is assembled — see `LevelViewController.ts` lines 2101–2137 from the earlier exploration):

```ts
const activeMinigame = this.minigames.getActive()
if (activeMinigame instanceof DanMinigame) {
  telemetry.surveyTimeRemaining = activeMinigame.timeRemaining
  telemetry.surveyProbesCollected = activeMinigame.progressCurrent
  telemetry.surveyProbesTotal = activeMinigame.progressTotal
  telemetry.minigameProgressLabel = 'PARTICLES'
  telemetry.missionInstruction = activeMinigame.missionInstruction
}
```

The Vue HUD component already renders this block as the "survey HUD." No `.vue` change required for the first cut. (A later visual pass may want a dedicated DAN ring — that is polish, not blocking.)

- [ ] **Step 2: Field naming note for follow-up**

The fields are misnamed (`surveyTimeRemaining` is now used by survey, photometry, and DAN). A future refactor should rename them to `minigameTimeRemaining` / `minigameProgressCurrent` / `minigameProgressTotal`. Out of scope for this slice — flag it in the plan's follow-up section.

---

## Task 9: Audio

- [ ] **Step 1: Mirror PhotometryScanSound**

Locate `PhotometryScanSound.ts` (or whichever module wires the photometry beam audio to `onScanAudioState`). Create `src/audio/DanScanSound.ts` with the same shape: a procedural hum whose intensity scales with scan progress, plus a separate one-shot for particle hits and another for completion.

- [ ] **Step 2: Hook into the level audio director**

Where the level wires `onPhotometryScanAudioState`, also wire `onDanScanAudioState`, `onDanParticleHit`, `onDanCompletionPulse` to the new sounds.

This task is polish — the encounter is playable without it. If time pressure exists, ship Tasks 1–8 first, then audio.

---

## Task 10: Verification

- [ ] **Step 1: Targeted tests**

```bash
bun test:unit src/lib/missions/__tests__/asteroidMissionRewards.spec.ts
bun test:unit src/lib/minigame/__tests__/DanMinigame.spec.ts
bun test:unit src/lib/fps/__tests__/projectileSystem.spec.ts
bun test:unit src/lib/level/__tests__/danCraterPlacement.spec.ts
```

All pass.

- [ ] **Step 2: Full sweep**

```bash
bun test:unit
```

No regressions in any other suite.

- [ ] **Step 3: Type-check + lint**

```bash
bun run type-check
bun run lint
```

Zero errors. Zero ESLint warnings. Every new export documented.

- [ ] **Step 4: Manual playthrough**

Boot a DAN mission via URL: `/level?mission=dan&difficulty=5&asteroidId=<an asteroid known to have natural craters>`.

Verify in the running browser:

1. Lander arrives and parks at the crater center, not somewhere on a slope.
2. Terminal is visible and interactable on EVA. Tracker shows step 1 ("Locate the terminal") active.
3. Pressing E starts the scan: timer counts from `scanDurationSeconds`, particles begin spawning from the crater floor, downward beam from the lander is visible. Tracker advances to step 3 ("Capture neutron returns").
4. SCI bolts capture particles (visual hit, meter ticks). LASER bolts pass through particles.
5. After grace, viroids descend from the rim and target either player or lander based on distance.
6. When the timer hits 0, particles stop spawning, beam fades, viroid spawn rolls stop, the lander HUD instruction switches to `RETURN DAN TELEMETRY TO TERMINAL`. Tracker advances to step 4.
7. Walking back to the terminal shows `[E] DELIVER DAN TELEMETRY`. Pressing E completes the objective and triggers the completion pulse.
8. Letting the lander hull reach zero (during scan or delivery walk-back) triggers `lander-destroyed` failure with the existing fail UX.
9. Dying (during scan or delivery walk-back) triggers `player-died` failure.
10. Delivering with zero hits triggers `no-data-captured` and routes to retry. No payout.
11. On successful delivery, exfil pays out a reward between `rewardMin` and `reward` proportional to capture quality. Capping the meter and delivering pays full template `reward`.

Boot a non-DAN mission (any photometry, gather, or bunker contract) and confirm no behavior regression.

- [ ] **Step 5: Forced-synthesis smoke test**

Pick an asteroid with no natural craters (or temporarily set `DanCraterSpec.minQualityScore` to `Infinity`) and re-run the manual playthrough. Confirm the synthesis fallback path produces a playable encounter even though the visible mesh stays flat where the heightmap dips. The lander should still spawn at world `(0, 0)` and the encounter should run normally.

---

## Out Of Scope For This Slice

- Mesh-level deformation of the GLB to match a synthesized crater bowl (visual polish; players see a flat surface where the heightmap dips).
- Renaming the misnamed `survey*` HUD fields to neutral `minigame*` names.
- Per-faction audio or visual differentiation of DAN encounters between Jovian Society and Cinderline missions.
- Dedicated DAN HUD ring / faction tint on the meter.
- Persistent crater registry across missions (each level boot recomputes).
- DAN-specific viroid variants or behavior changes (uses existing viroid AI).
- "Noisy data" narrative branch when quality is low (mentioned in spec's open questions).

---

## Risk Notes For The Implementing Agent

1. **Multi-bake performance.** B1 already validates BVH-cached bakes are cheap. If the manual playthrough shows a noticeable boot stall on DAN missions, log bake timings and consider reducing `DAN_DEFAULT_CRATER_ROTATION_CANDIDATES` from 8 to 4 in B1's tuning.

2. **Synthesis visual mismatch.** The fallback applies a heightmap crater without deforming the GLB, so the visible surface stays flat where the heightmap reports a bowl. The encounter is functionally correct (particles spawn at the heightmap-dip Y, viroids descend from heightmap-rim Y) but visually wrong. If this looks too broken, a quick polish patch is to push down the GLB vertices in a radius around the crater center — out of scope, but worth flagging the option.

3. **Enemy targeting routing.** Existing viroids may not have a "prefer the lander when player is far" mode out of the box. Depending on what `enemyDirector.ts` exposes, this may require a small adapter (a per-enemy target override callback) rather than a config flag.

4. **The `survey*` field reuse is a tech-debt loan.** Photometry already cashed it; DAN cashes it again. Each new minigame that reuses these fields makes the eventual rename more painful. Flag in code comments at the assignment sites so the future refactor is greppable.

5. **Reward floor ratio is a design knob.** `DAN_REWARD_FLOOR_RATIO = 0.25` is a guess. Once the encounter is playable, the user will likely want to tune this (and `DAN_MIN_QUALITY_FOR_COMPLETION`) based on how punishing real failures feel.
