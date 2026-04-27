# Dynamic Albedo of Neutrons — Mission GDD

*Asteroid prospecting · the active counterpart to Photometry*

---

## Premise

DAN is the second of the two Jovian Society survey instruments, and the active counterpart to photometry. Where photometry asks the player to *be still* (hover at standoff, hold the line, capture light), DAN asks the player to *be busy* (defend the lander, shoot rising neutrons, fight the things the scan summons). Same instrumentation series, opposite muscle group.

Fiction: the lander emits a downward neutron pulse into the asteroid's regolith. Subsurface hydrogen scatters the pulse upward; particles arc out of the ground at angles. The player's science gun captures those particles before they fall back. The faster you collect, the better the data.

The Society does not advertise this part: viroids in the asteroid hear the pulse and come for the source. The lander is the source. You are the source's bodyguard.

The mechanic is established (player already knows how to fight viroids and how to fire science mode). DAN is the **first time those two reflexes are used in the same minigame**.

---

## Core Loop

1. Lander parks in a crater on the asteroid surface (existing landing flow).
2. Player EVAs out (existing EVA flow).
3. Player approaches a terminal next to the lander, presses **E** to begin the scan.
4. Lander activates DAN — visible downward beam, ambient hum, scan UI appears.
5. **45-second timer starts.**
6. Particles begin arcing out of the crater floor. Each one shot in flight by science mode adds to a fill meter. Particles that fall back to the ground are lost.
7. Viroids descend into the crater from above on a per-tick spawn roll. Player swaps to laser mode to engage them. They damage the lander and the player on contact and on projectile hits.
8. Player juggles two responsibilities for 45 seconds: keep the meter filling, keep the lander alive.
9. **Success:** meter fills before timer expires. Scan completes, lander emits a wireframe pulse, telemetry returns.
10. **Failure:** hull destroyed, player died, or timer expired with the meter incomplete. Mission ends; player can restart.

---

## Setup & Activation

### Crater Selection

The mission requires a crater on the "ground" face of the asteroid (the face that was rotated upright at game start to serve as the player-accessible surface).

Resolution order:

1. **Prefer natural craters.** Procedural asteroids already generate impact features. The mission-generator scans the upright-face terrain at objective-load time and selects the largest viable natural crater (minimum bowl diameter and depth thresholds TBD by playtest — needs to fit the lander plus a defensible perimeter).
2. **Fall back to crater generator.** If no natural crater on the upright face meets the threshold, invoke the existing crater generator at a chosen surface location and deform the GLB. The generator runs once at objective load; the result is baked into the asteroid mesh for the duration of the mission.

### Terminal & Trigger

A Society-provisioned terminal spawns next to the landing zone (same prefab pattern as photometry's terminal). Player approaches, presses **E**, scan begins. Standard EVA terminal flow — no new interaction layer needed.

The terminal is also where the contract-final Prospectus minigame happens in the Jovian chain (Step 9), but for ordinary DAN missions it just starts the scan.

---

## The Lander as Passive Scanner

The lander does the actual scanning work. The player does not pilot during DAN — the lander stays parked on its legs, engines off, throughout the scan.

What the lander needs to communicate:

- A visible **downward beam** from the underside (matches photometry's existing visual language but pointed at the ground instead of off-axis). The beam is the scan signature.
- An **ambient hum** that intensifies slightly as the meter fills.
- Hull integrity is the lander's only state during the scan. Existing hull-damage logic applies — projectile hits and viroid melee contact chip the bar. Damage persists into the post-mission lander state, so a sloppy DAN run costs spaceport repair credits later.

The lander is a static structure during the scan. It does not move, fire back, or repair itself. It is a building you defend, not a unit you control.

---

## The Player as Defender

Player is fully EVA'd out — same suit, same gun, same movement as any other EVA mission. O2 timer is implicitly present but should be tuned generously enough that 45 seconds never runs the player out (assume O2 is not a constraint for this mission unless playtesting shows otherwise).

### Movement

Free movement around and beyond the crater. Player can leave the bowl, but doing so means viroids are unimpeded reaching the lander. The crater is the **defensible space** — a bowl with rim cover, a clear sightline on incoming threats, and the lander dead-center as the asset to protect.

### Gun Modes

- **Science mode** (existing): the only mode that registers particle hits. Continues to function as heal/repair elsewhere. Hitting a particle in flight detonates it and ticks the fill meter.
- **Laser mode** (existing): the only mode that damages viroids. Standard combat behavior.
- **Miner mode** (existing): no DAN function. Firing miner during DAN does nothing useful but is not punished.

The player swaps modes on the existing input. The swap itself takes whatever time the existing animation/swap takes — that latency is the **rhythm cost** of the mission. You cannot fight and scan simultaneously. Every swap is a moment where one of the two jobs is going undone.

### Player Damage

Standard EVA damage rules: viroid projectiles reduce suit integrity, viroid melee contact reduces suit integrity. Player death is a failure state.

---

## The Particles (The Data)

Particles arc out of the crater floor toward the sky, originating from random points within the bowl. They follow a ballistic-style arc: launched at an angle, travel up, peak, fall back. If they hit the ground without being shot, they are lost.

### Spawn Behavior

Continuous, not waved. The particle system rolls per-tick (e.g., once per game frame or at a steady cadence like once per 0.25s) and decides whether to spawn one or more particles. Sometimes one. Sometimes two. Sometimes a brief lull. The cadence should feel like a *boil*, not a faucet — uneven intensity, with rhythm but no metronome.

### Tunable Parameters

- **Spawn probability per tick** (controls overall density)
- **Burst chance** (small chance of 2-3 particles spawning at once for variety)
- **Arc speed range** (slow particles are easy targets, fast ones are hard)
- **Arc angle range** (steep arcs stay near the launch point, shallow ones travel across the crater)
- **Lifetime** (how long the particle is in the air before it hits the ground and is lost)

### Hit Feedback

Hitting a particle:

- Particle detonates (small visual flash, audio click — distinct from viroid kill audio)
- Telemetry blip appears briefly on HUD
- Fill meter ticks up by a fixed percentage (1.5–2% per hit if meter requires ~50–65 successful hits over 45s)
- Brief data-stream visual from the detonation point flowing back to the lander (sells "the lander is collecting it")

### Missed Particles

Particles that fall to the ground without being shot are silently lost. No feedback, no penalty beyond the missed fill. Failure to fill the meter in time is the only consequence of accumulated misses.

---

## The Enemies (The Threat)

Viroids descend into the crater from above. Spawn behavior matches the rescue mission's pattern: per-tick dice roll on whether to spawn, not pre-authored waves.

### Spawn Behavior

- **Per-tick spawn roll** with a base probability tuned per difficulty tier.
- **Approach vector:** above. Viroids appear at the crater rim or above it and move down into the bowl. They are visible during their descent; the player has roughly 2-4 seconds of warning to react after a spawn before the viroid is in engagement range of the lander.
- **One at a time, mostly.** Probability rolls should be tuned so that doubled spawns are uncommon at difficulty 4 and routine at difficulty 6.

### Behavior

Standard viroid AI from combat missions. They prioritize the lander as a target if the player is far from it; they engage the player if the player is closer. This emergent target-priority means the player's *position* matters: hugging the lander pulls aggro to themselves and protects the asset; patrolling the rim leaves the lander exposed.

### Damage to Lander

Viroid projectiles and melee contact damage the lander's hull on the same damage curve as in combat missions. No new damage code required.

### Damage to Player

Standard EVA combat damage. Player can die.

### The Two-Threat Calculus

Because viroids prioritize the lander unless the player intercepts, the player constantly chooses:

- **Hold the lander:** stay close, intercept viroids before they reach it, fewer particles get scanned because you're laser-mode-locked.
- **Patrol the rim:** kill viroids on entry before they descend, more particles missed during travel, lander takes more hits if you let any through.

There's no correct answer. Both strategies fail at high difficulty unless the player swaps modes cleanly between threats.

---

## The Meter (Success Condition)

A horizontal fill meter on the HUD. Visually distinct from the photometry hold-progress bar. Suggested visual: thin horizontal bar near the top-center of the screen, labeled `DAN SCAN` with a percentage readout (`0/100` or `0% → 100%`).

### Fill Rate

Each particle hit fills the meter by a fixed amount. Tuned so that the **theoretical perfect run** (every particle hit, no misses) fills the meter in ~30 seconds — leaving 15 seconds of buffer for realistic miss rates and viroid distractions.

A **median competent run** should fill in ~40 seconds, leaving 5 seconds of margin.

A **sloppy run** should run out of time at ~85-95% — close enough to feel like the timer beat you, not like the difficulty was wrong.

### Visual State

- Filling: meter ticks up with each hit, brief flash on the new segment.
- Near completion (~80%+): meter pulses, audio rises in pitch, HUD signals the player they're close.
- Filled: meter locks at 100%, lander emits a wireframe pulse outward (same visual language as photometry's wireframe flash), scan completes.

### No Partial Credit

Either the meter fills in time or it doesn't. There is no "incomplete but partially valid" data return. Failure is restart-from-start.

(See Open Questions for whether this should ever change for the Jovian contract specifically.)

---

## Failure States

1. **Hull destroyed:** Lander hull reaches zero. Mission fails.
2. **Player death:** Suit integrity reaches zero. Mission fails.
3. **Timer expired with incomplete meter:** 45 seconds elapsed and meter is below 100%. Mission fails.

In all three cases, the player can restart the mission from the beginning. No checkpoint mid-scan. The 45 seconds is meant to be retryable.

---

## Duration & Pacing

**Total active scan time: 45 seconds.**

Particle spawn ramps up slightly across the duration:

- **0–10s:** light particle density, no viroid spawns yet. Player learns the rhythm, starts filling.
- **10–25s:** standard particle density, first viroid spawn becomes possible (low probability), player makes their first mode swap.
- **25–40s:** peak density, viroid spawn probability at maximum, the chaos zone. Mode swaps happen multiple times per minute.
- **40–45s:** the closing window. If the meter is on track, this is the relief lap. If it's not, this is the panic lap.

The asymmetric ramp is intentional — the early seconds are friendly so the player can settle in; the late seconds are brutal so the moment of completion *feels* earned.

---

## Difficulty Scaling

| Parameter | Diff 4 | Diff 5 | Diff 6 |
|-----------|--------|--------|--------|
| Particle spawn rate | Low | Medium | High |
| Particle speed | Slow | Medium | Fast |
| Burst chance (multi-spawn) | Rare | Occasional | Routine |
| Particle lifetime in air | Long (forgiving) | Medium | Short (tight) |
| Viroid spawn probability per tick | Low | Medium | High |
| Viroid health | Standard | Standard | Standard |
| Meter fill per hit | High (~2.5%) | Medium (~2%) | Low (~1.5%) |
| Required hits to fill | ~40 | ~50 | ~65 |
| Crater size | Large (forgiving) | Medium | Tight (rim closer) |

Two principles in the scaling:

- **More work, not harder mechanics.** Difficulty 6 doesn't introduce new enemy types or new particle behaviors — it just demands more hits, faster reactions, and more frequent mode swaps. The skill ceiling is in execution, not in learning new rules.
- **Crater size as soft difficulty.** A tighter crater means viroids reach the lander faster after spawn, the player has less rim cover, and particles arc outside the playable zone more often. The terrain doing balance work is cheap and effective.

---

## HUD & UI Requirements

- **DAN SCAN meter** (new): top-center horizontal bar, percentage readout.
- **Scan timer** (new or reused from photometry): mm:ss countdown from 0:45.
- **Lander hull integrity** (existing): visible during DAN since the lander is a defendable target. May need a slight UI prominence boost since it usually only shows in piloting view.
- **Particle hit blip** (new): small flash + numeric "+1" or "+%" tick on each successful hit, fades quickly.
- **Mode indicator** (existing): science vs laser vs miner — already shown.
- **Telemetry feed** (optional polish): small scrolling text feed in a corner with bureaucratic readouts ("BACKSCATTER TICK · 14.3 MeV · BAND 2 · LOGGED") — sells the science vibe and reinforces the Jovian Society's sterile language.

---

## Reuse vs. New Systems

### Reuse (no new code)

- EVA flow (terminal interact, suit, O2, walking, sprint, stamina)
- Three gun modes and mode-swap input
- Science gun heal/repair beam visual + audio (recolored or reused for particle hit)
- Laser gun combat behavior
- Viroid AI and damage curves
- Lander hull damage system
- Crater generator (already exists)
- Per-tick spawn roll (rescue mission pattern)
- Wireframe pulse on completion (photometry pattern)

### New Code

- **DAN objective type** in the mission generator (`objectiveType: "dan"`).
- **Particle system** for neutron arcs: spawn, ballistic motion, lifetime, despawn, science-hit detection.
- **Fill meter logic**: hit-to-fill conversion, meter UI, completion trigger.
- **Crater selection logic**: scan asteroid upright face for natural crater meeting threshold, fall back to crater generator.
- **DAN HUD elements**: meter, timer, hit blip.
- **Tunable parameters file** for difficulty scaling (probably mirrors photometry's params block).
- **Mission template params** (analogous to photometry's `timeLimit` / `scanHoldSeconds` / `probeDistance`):
  - `scanDuration` (default 45)
  - `meterFillTarget` (default 100)
  - `particleSpawnRate`
  - `particleSpeedRange`
  - `viroidSpawnProbability`
  - `requiredHits` (or derived from fill-per-hit × target)

---

## Open Questions / Decisions for You

1. **Should the Jovian contract get a "noisy data" outcome?** The current design is binary: fill the meter or fail the mission. That removes the earlier idea where a sloppy DAN run could ship "inconclusive" data and let a player manufacture plausible deniability for the Prospectus terminal. If you want that layer back, the meter would need a soft success band (e.g., 70–100% fills = success, but 70–85% flags the contract data as `quality: "noisy"`, which the terminal minigame could read). Cleaner without it. Richer with it. Your call.

2. **O2 as a second timer.** Default assumption: O2 is generous enough that 45 seconds doesn't threaten it. If you want O2 to matter, you could tune so that a slow restart-after-death run starts to bite. I'd leave it generous and let the 45s + meter + viroids carry the pressure.

3. **Does miner mode do anything during DAN?** Currently nothing. You could let miner mode break crater rocks for cover or extra particles, but that's scope creep. Recommend: nothing, ignore it.

4. **Lander repair mid-scan?** The science gun heals/repairs elsewhere. It would be thematically consistent to let the player repair the lander mid-scan with science mode. But that adds a *third* job to a player already juggling two. Recommend: no mid-scan repair. The lander hull is a finite resource for the run. Damage carries home.

5. **Particle origin points.** Random across the crater floor, or weighted toward the center directly under the lander beam? Center-weighted is more thematically tight (the beam is what summons them) and tactically interesting (the player wants to be near the lander anyway, and the particles spawn there too — defending and scanning are co-located). Random is more chaotic and forces more player movement. Lean center-weighted with some scatter.

6. **Particle behavior when shot.** Detonate immediately on hit, or detonate-and-spawn-mini-cluster? Detonate-only is cleaner. A cluster splash on hit would create chains where one good shot spawns more targets — fun, but probably scope creep. Recommend: detonate-only.

7. **Failure UX.** When the mission fails (timer expires, lander destroyed, player dies), does it auto-restart, prompt to restart, or kick back to lander/spaceport? Photometry's failure UX should dictate. Stay consistent.

8. **Does `martian-marines` turret upgrade tier change DAN performance?** Turret stats are scoped to shuttle mining, not science gun behavior. DAN should not be affected by turret upgrades — it's purely a multitool/suit/lander balancing problem. Worth confirming the multitool upgrade tree (`multitoolDamage`, `multitoolEfficiency`, `multitoolRtgCapacity`, `multitoolRtgCharge`) all apply correctly during DAN. RTG drain on science mode firing is the relevant question.

9. **RTG drain.** Science mode draws from the multitool RTG. If a player runs the RTG dry mid-scan, they can't hit particles for the rest of the scan. That's a real failure case worth designing around. Either:
   a. RTG drain during DAN is reduced/zero so it's never the bottleneck.
   b. RTG drain is normal and the player must manage it (adds depth, but also adds a 4th juggling target — probably too much).
   c. RTG passively recharges during DAN at a higher rate.
   
   Recommend (a): zero or trivial drain during DAN. The juggle is already complex enough.
