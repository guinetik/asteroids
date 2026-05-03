# Level Disturbance System

**Date:** 2026-05-02
**Author:** guinetik
**Status:** Draft
**Related:**
- `docs/superpowers/specs/2026-04-27-dan-mission-design.md`
- `src/lib/minigame/DanMinigame.ts`
- `src/lib/fps/enemyDirector.ts`
- `src/views/LevelViewController.ts`

## Problem

DAN already proves that viroid pressure works best when the player feels like
the asteroid is reacting to their behavior. That pressure is currently locked to
one minigame. Surface EVA should have a broader rule: noisy activity attracts
viroid attention.

The new system should make every asteroid level feel inhabited and dangerous
without turning every mission into a scripted combat encounter. Walking,
jumping, firing, mining, and other surface actions build hidden disturbance.
Crossing response thresholds summons viroids from believable terrain positions.
Taking off in the lander resets the disturbance, giving the player a clean
break-contact move that costs time and attention.

## Goals

- Add a level-wide disturbance system that runs on asteroid surface missions
  unless that mission already authors its own viroid pressure.
- Keep the disturbance value hidden from the player. The player should infer
  attention from viroid arrivals, audio, and short diegetic cues.
- Scale disturbance gain and response severity by `mission.difficulty`.
- Escalate responses over time: first one enemy, then another, then larger
  groups, then patrol-level pressure.
- Spawn enemies from terrain-edge positions some distance away from the player,
  not directly on top of them.
- Reset disturbance only when the lander actually lifts off or becomes airborne,
  not merely when the player re-enters the cockpit.
- Keep the system decoupled from minigames so it can coexist with gather,
  mining, survey, photometry, DAN, and exterminate objectives.

## Non-Goals

- No visible wanted meter or exact disturbance bar.
- No disturbance director on rescue or bunker missions. Those mission types
  already place viroids inside the asteroid as authored encounters.
- No bunker-interior integration in the first pass. Bunker waves remain their
  own encounter system.
- No new procedural enemy rigs are introduced. Responses reuse existing walker,
  floating, and ranger silhouettes authored for rescue and bunker play.
- No mission-authoring requirement. Existing mission JSON should not need new
  fields for the system to run.

## Player Experience

The player lands on an asteroid and begins EVA work. The game does not show a
disturbance meter. Normal actions slowly raise hidden attention:

- Walking and sprinting create low continuous disturbance.
- Jumping or hard landing creates a discrete pulse.
- Firing the multitool creates mode-specific pulses.
- Mining hits and rock breaks create stronger pulses.
- Explosions, if present, create large pulses.
- Destroying disturbance viroids trims hidden attention immediately. Stronger archetypes carve
  larger relief wedges (`bacteriophage < spire < chimera`), multiplied by mission
  `difficultyFactor`, so Chimera kills on hard contracts pull the meter down more than scouts on
  easy runs.

At first, nothing obvious happens. As disturbance crosses thresholds, viroids
begin arriving from the landscape. The first response should feel like a scout.
Later responses feel like the asteroid has noticed a pattern and is dispatching
patrols.

The player can break attention by returning to the lander and lifting off. Just
entering the lander does not clear the system; the lander must become airborne.

## System Model

Introduce a level-owned `LevelDisturbanceDirector` that is constructed during
level initialization and ticked from `LevelViewController`.

The director owns:

- A hidden `disturbance` value in `[0, 100]`.
- A `responseTier` representing the highest response already triggered.
- A cooldown so threshold crossings cannot dump too many enemies in one frame.
- A small level-scoped `EnemyDirector` for ambient viroids.
- Difficulty-scaled tuning derived from `mission.difficulty`.

The director receives action events from level systems rather than reading
input directly. This keeps it testable and avoids coupling it to Vue or Three.js
controller internals.

Example event vocabulary:

- `movement` for grounded EVA movement over time.
- `sprint` for faster EVA movement over time.
- `jump` for jump activation.
- `hard-landing` for fall-impact pulses.
- `tool-fire` for laser/science/miner trigger use.
- `mining-hit` for drill/projectile impact on a rock.
- `rock-break` for resource extraction completion.
- `combat-hit` for projectile impact on an enemy.
- `explosion` for future high-noise events.

## Difficulty Scaling

Mission difficulty is the only required tuning input. Use a normalized
difficulty factor:

```ts
difficultyFactor = 0.75 + (missionDifficulty - 1) * (0.5 / 9)
```

That maps difficulty 1 to `0.75` and difficulty 10 to `1.25`. The exact
numbers can change during tuning, but the important rule is that higher
difficulty fills disturbance faster and can allow stronger response tiers.

Scaling applies to:

- Disturbance gained per action.
- Maximum response tier allowed during the mission.
- Minimum cooldown between response spawns.

Low-difficulty missions should still have the system, but many players may only
see one scout unless they make sustained noise. High-difficulty missions should
produce patrol pressure during prolonged EVA play.

## Response Ladder

Response thresholds are hidden. Initial tuning:

- `10%`: one scout viroid.
- `25%`: one additional viroid.
- `45%`: two viroids.
- `70%`: three viroids.
- `90%`: patrol response, three to five viroids with shorter reinforcement
  cooldown.

Each threshold triggers once per disturbance cycle. After patrol tier, sustained
activity can trigger repeated patrol reinforcements on cooldown while the
disturbance remains high.

The response ladder should be implemented as data in TypeScript constants, not
scattered conditionals. This makes balancing easier and keeps the first pass
compatible with future mission or biome modifiers.

## Spawn Placement

Spawns should appear at believable terrain-edge positions around the player:

- Pick a random angle around the player.
- Pick a distance band far enough to avoid pop-in and immediate contact.
- Sample the heightmap at the candidate position.
- Reject invalid terrain, positions too close to the lander, and positions too
  close to active objective terminals or critical interactables.
- Prefer positions near ridges, crater rims, or the edge of the local play area
  when terrain data makes that practical.

First-pass placement can use a robust radial sampler around the player with
heightmap validation. Crater/ridge preference can be layered later without
changing the director contract.

## Enemy Ownership

The disturbance system should own its own `EnemyDirector`, separate from
objective minigames. This avoids rewriting existing minigames and keeps ambient
viroids alive even when the player is doing non-combat work.

### Archetype roster and palettes

Ambient spawns reuse the rescue/bunker pattern:

- **Difficulty 1–4:** rolls `bacteriophage` only.
- **Difficulty 5–7:** randomly rolls `bacteriophage` or `spire`.
- **Difficulty 8–10:** randomly rolls `bacteriophage`, `spire`, or `chimera`.

Mission difficulty maps to bunker-style visual tiers (`default`, `medium`, `hard`)
for hull and accent shaders on every spawned silhouette. Tier banding mirrors
enemy palette helpers in `enemyVisualPalette.ts`.

### Lifecycle requirements

The director must:

- Spawn walkers, floating Spires, and Chimeras through `EnemyDirector.spawn`
  consistent with `/data/fps/enemy-types.json`.
- Register spawned enemies with the shared surface `ProjectileSystem` so multitool bolts
  can damage them (unchanged rule).
- Run a scoped `EnemyProjectileSystem` plus `EnemyProjectileMeshPool`, mirroring rescue
  play, so Spire bolts and Chimera bursts can reach the EVA astronaut.
- Own and tick the matching visual controllers (`BacteriophageController`, `SpireController`,
  `ChimeraWalkerController`) with synced aim, melee motion, ranged feedback, death cleanup,
  and mesh-pool teardown on reset/dispose.
- Remove enemies from `ProjectileSystem` before despawn/dispose and clear projectile pools.
- Route contact hits and projectile hits through `LevelDisturbanceDirector.onDamagePlayer`, with
  `EnemyDirector`/`EnemyProjectileSystem` tiered player multipliers exported from
  `enemyPlayerDamageMultiplierForVisualTier` so escalating palettes remain mechanically sharper,
  not purely cosmetic.

The system should not initially target or damage the lander. The player can
choose to flee by lifting off, and the reset rule already makes the lander a
strategic escape option. Lander-targeting can be a later escalation if ambient
patrols need more stakes.

## UI And Feedback

The disturbance meter is hidden. Feedback should be indirect:

- A short prompt or mission-tip-style cue can fire when a response tier begins,
  such as `SUBSURFACE MOVEMENT DETECTED` or `VIROID SIGNAL CLOSING`.
- Audio stingers can play on response spawn.
- No persistent bar, percentage, or exact state label should appear.

The first pass can reuse existing prompt/marquee plumbing rather than adding a
new HUD component. If testing shows the system feels unfair, add more sensory
warning before adding a visible meter.

## Reset And Lifecycle

Disturbance starts at zero when a level loads. It resets when the lander lifts
off after being grounded. Re-entering the lander while grounded does not reset
it.

The reset should clear:

- Current disturbance.
- Triggered response tier history.
- Pending response cooldown.
- Ambient disturbance enemies that are not currently engaged, if this can be
  done without obvious pop-out.

If despawning visible enemies feels bad, the first implementation can reset the
meter and stop future spawns while leaving already-spawned enemies alive until
they are killed, despawned by distance, or the level exits.

## Integration Points

- `LevelViewController` owns construction, ticking, and disposal.
- `tickEva` emits movement, sprint, jump, firing, and hard-landing disturbance
  events.
- `ProjectileSystem` or `LevelCombatMiningFacade` emits mining-hit, rock-break,
  combat-hit, and explosion events.
- `LevelStateLifecycleFacade` and lander grounded/airborne state provide the
  lift-off reset signal.
- `mission.difficulty` provides tuning.
- Existing damage feedback and player damage callbacks handle contact damage.

## Testing Strategy

Add focused unit tests for the director:

- Disturbance gain scales by mission difficulty.
- Thresholds trigger the expected response tiers exactly once per cycle.
- Patrol tier can retrigger on cooldown while disturbance remains high.
- Lift-off reset clears disturbance and response history.
- Hidden UI contract: public telemetry exposes alert events, not a visible
  percentage.

Add integration-style tests only where necessary for wiring:

- Level action events call into the director.
- Spawned enemies register and unregister with `ProjectileSystem`.

## Open Tuning Values

The first implementation should treat these as constants with clear names:

- Disturbance gain per movement second.
- Disturbance gain per sprint second.
- Disturbance gain per jump.
- Disturbance gain per tool shot by mode.
- Disturbance gain per mining hit.
- Disturbance gain per rock break.
- Spawn distance min/max.
- Response cooldown by tier.
- Maximum live disturbance enemies.

These are tuning values, not feature decisions. They should be easy to adjust
after playtesting.
