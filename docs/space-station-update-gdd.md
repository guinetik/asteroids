# SPACE STATION UPDATE — Game Design Document

**Date:** 2026-05-14
**Status:** Intent / design notes (no implementation plan yet)
**Author:** guinetik
**Related work:**
- `docs/superpowers/specs/2026-05-05-ceres-station-dock-system-design.md` (authored Ceres station dock)
- `docs/superpowers/specs/2026-05-12-yamada-station-interior-design.md` (authored Yamada station interior)
- `src/lib/station/StationLayout.ts` (validated room + corridor layout substrate)

---

## High Concept

After Act 1, the player learns that the abandoned space rush left behind more than wrecked colonies on asteroids — it left **derelict space stations** drifting between bodies. Most were stripped, some weren't. The Space Station Update turns the existing station-interior substrate (originally built for the authored Yamada and Ceres stations in the **Act 3 Update**) into a repeatable, procedurally generated loot-and-traversal loop.

**One-sentence pitch:** Bloodborne chalice dungeons, in space — consumable scanners point you at a derelict, you dock, you scrounge keycards and dodge security systems, you leave with upgrades, paint jobs, or a fresh arcade ROM.

This update is **distinct from the Act 3 Update**. Yamada and Ceres stations are *authored* (hand-built layouts shipped as JSON). The Space Station Update introduces *procedural* stations: same building blocks, generated at runtime, none of them tied to story beats.

---

## Player-Facing Loop

```
Jay's message (post-Act 1)
        │
        ▼
Auto-created delivery contract: Mars → Earth (pickup Space Station Scanner)
        │
        ▼
Consume scanner from inventory ──► dice roll ──► derelict spawned on the solar map
        │
        ▼
Fly out, dock at the derelict (existing PinnedStationController + dock prompt)
        │
        ▼
Walk a procedural station: corridors, rooms, locked doors, security systems
        │
        ▼
Solve minigames + find keycards ──► reach the reward room
        │
        ▼
Loot rolls ──► leave the station ──► back to /map
        │
        ▼
Scanners are now sold in shops (everywhere except Earth, Venus, Mercury);
better scanners (= better loot) the further from the Sun
```

The loop is intentionally **self-paced and repeatable**. The player decides when to spend credits on a scanner, when to spend a scanner on a roll, and when to commit to a derelict run.

---

## Story Hook (Onboarding)

- Trigger: player completes Act 1 (existing flag — exact placement TBD).
- Delivery: Jay sends an in-game message ("there's something I've been meaning to tell you about…"). The message auto-creates a standard shuttle delivery contract: **Mars → Earth**, with the cargo being one Space Station Scanner. (Reuses the existing delivery-mission system; no new mission kind.)
- On delivery completion, the player owns one scanner.
- After consuming the first scanner (or completing the first derelict, TBD), scanners become purchasable.
- Jay's tone: dry, conspiratorial, "you didn't hear it from me." No HUD tutorial.

The story hook is **content**, not mechanics — once the contract is wired, the rest is the loop above.

---

## The Space Station Scanner

A consumable inventory item, reusing the existing consumable-from-inventory flow (the same pipe other consumables already run through).

**Tiers and pricing (initial values, expected to need tuning):**

| Tier | Shop locations | Base price | Reward quality |
|------|----------------|-----------:|----------------|
| I    | Mars, Ceres                | 10,000 cr  | Common loot bias |
| II   | Jupiter moons, Saturn moons | 25,000 cr  | Uncommon bias |
| III  | Uranus, Neptune, Kuiper     | 60,000 cr  | Rare bias |

Earth, Venus, and Mercury **never** sell scanners. ("Inner-system economies don't want you out there.")

**Consume behavior:** opening the inventory, selecting the scanner, and confirming triggers a dice roll. On success, a derelict pinned station spawns on the solar map at a deterministic (seeded) position the player can warp to. On failure (low tier, bad roll), the scanner is consumed and a flavor message is shown. Failure rate per tier is part of the tuning.

The scanner deliberately echoes the existing `MapView.spawnYamadaStation()` dev-console command — same spawn primitive, gated behind an inventory-driven roll instead.

---

## Procedural Station Generation

> **This GDD captures intent only.** The procgen algorithm gets its own design spec when we sit down to build it.

### Substrate we already have

The Yamada/Ceres work shipped a validated layout system:

- Rooms (rectangular, tiled, with cardinal-side entrances)
- Modular corridor pieces: `cross`, `corner`, `window`, `straight`
- Per-piece **port** definitions with reciprocity + geometric mating + bbox-no-overlap validation (`StationLayout.validateLayout`)
- A Three.js builder that consumes the validated layout

**Procedural generation, in this update, is the problem of emitting a valid `StationLayout` JSON at runtime.** All the geometric correctness machinery is already there.

### Generation shape (intent)

- Stations are **corridor spines** with rooms branching off.
- Topology: a main straight run with occasional turns; rooms hang off the corridor at port mates; sometimes a side spur leads to a second cluster of rooms.
- Length scales with scanner tier — Tier I derelicts are small (3–5 rooms), Tier III stations sprawl.
- Walls get **per-segment emissive paint variation** (color, decal, scuff) so the player isn't walking the same beige hallway every run. Authored palette pool, per-derelict seed.
- Lighting: dimmer than Yamada. Flickering panels. Some segments fully dark and powered down.

### Rooms have **roles**, not identities

A generated room is one of:

- **Spawn room** — where the hatch dropped the player off.
- **Reward room** — locked; contains the loot. Always present, always last.
- **Keycard room** — contains a keycard. Always at least one.
- **Minigame room** — gates progression (see below).
- **Filler / loot scatter room** — flavor, ambient pickups, ROM scatter, paint can scatter, etc.

The generator picks a graph shape, assigns roles to rooms, and writes a station layout JSON that the existing builder consumes unchanged.

---

## Mechanic 1 — Keycards

A keycard is an in-station, single-use door key. Picked up from one room, used to unlock another. (Item art exists: `public/items/keycard.webp`.)

- Keycards are **station-local**, not inventory items the player keeps between runs.
- A locked door shows a "🔒 KEYCARD REQUIRED" prompt instead of the normal door interact.
- Multiple keycards per derelict are possible (color-coded for readability).
- The generator places keycards such that a valid traversal exists from spawn → reward.

---

## Mechanic 2 — Security Minigames

Locked rooms are gated by security puzzles. The first one we're building is the **Microwave Minigame**.

### Microwave Minigame

A three-room arrangement the generator can drop into a station:

- **Room A — Keycard.** Open. Player picks up the keycard here, but it doesn't open Room C directly — it opens **Room B** (the terminal room).
- **Room B — Terminal + grid floor.** The floor is a tiled grid of plates. Interacting with the terminal opens a small map overlay: it shows the room's grid with the **safe path** highlighted. Step off the path: the room cooks the player (security system fires; HP drain or instant death, tuning-dependent). At the other end of the path: a second keycard or the Room C unlock.
- **Room C — Reward room.** Opened by the keycard or terminal-token earned by surviving Room B.

The terminal overlay is **transient** — the player has to memorize the path before stepping onto the grid (or peek back at the terminal, eating time). The room is the minigame; the tension is "do I trust my memory."

**Fail state:** the room "catches fire" (security fires emissive plumes, screen-tint, audio swell). Treated as a real death — same handling as combat death. Player loses unsaved progress in the run.

Audio-visual coupling is non-negotiable here (see `feedback_audio_visual_coupling` memory): the terminal hum, the door latch sound, the security warmup tone, and the floor-plate footfall all need to teach the player the rules without UI text.

### Future minigames (placeholder list, design later)

- Vent crawl (cramped low-ceiling corridors, no pressure suit warning if you stayed too long).
- Power routing (cargo-bay-style logic puzzle on a junction box).
- Beacon triangulation (read signals at three terminals to derive a code).
- Pressure-lock timing (door cycles on a beat; jump through during the green window).

Each future minigame is its own design spec.

---

## Rewards

Each derelict run rolls **one** reward category. The category is decided at station-spawn time and baked into the seed (so the player can't save-scum).

### Categories

1. **Upgrade unlock.** Pick one upgrade the player does not yet have at Level 3 and **install it at Level 3** (which retroactively unlocks Levels 1 and 2 of that upgrade if they were locked).
   - Rationale: the player who's already grinding upgrades on the regular path still benefits, because the derelict shortcut hands them a Tier 3 they may not have gotten to yet.
   - If the player has every upgrade at Level 3, this category is excluded from the roll for that station.

2. **Trade goods cargo.** 50–100 units of a **light, expensive** trade item (e.g., rare-earth concentrates, refined alloys, exotic isotopes). Tuned so the haul is meaningful credits-wise but doesn't tank cargo mass for the trip home.

3. **Exclusive paint jobs.** Per-run rolls pick from a derelict-exclusive pool:
   - 2 habitat-interior paint jobs
   - 1 shuttle exterior paint job
   - 1 lander exterior paint job
   - 1 multi-tool / gun paint job
   - These do not appear in Fantasia's regular Pimp My Ride store.

4. **Arcade ROM.** A new playable game for the habitat arcade cabinet.

Reward weights skew by scanner tier — Tier I rolls bias toward trade goods, Tier III biases toward upgrade unlocks and exclusive paints.

---

## Achievements (placeholder list)

To be expanded with proper rule definitions when we wire them. Working titles only:

- **First Contact** — Spawn your first derelict.
- **Spelunker** — Complete 10 derelict runs.
- **Locksmith** — Find all 4 keycards in a single derelict.
- **Don't Look Down** — Solve the microwave minigame without re-opening the terminal map.
- **Well Done** — Die to the microwave security system. (Joke achievement.)
- **Stripped Clean** — Loot every room in a derelict.
- **Cabinet of Curiosities** — Collect 3 derelict-exclusive arcade ROMs.
- **Repainted** — Equip a derelict-exclusive paint job on every vehicle.
- **Tier III** — Spawn and complete a Tier III derelict.

Each achievement gets its own poster art (matches the existing achievement-poster habitat decoration system).

---

## Out of Scope

- **Yamada and Ceres stations** — those are authored and ship in the Act 3 Update, not this one.
- **NPCs inside derelicts.** Empty stations only. Enemies (if any) are a later pass.
- **Player-built stations.** Not in this update. Maybe never.
- **Saving a derelict between sessions.** A station persists on the map only as long as the player hasn't completed or abandoned it; closing the game keeps the pinned asset, but a completed derelict is gone.
- **Co-op or multiplayer.** Single-player game, always.

---

## Update-Page Changelog Entry (draft)

For `public/data/changelog/home-updates.json`:

```json
{
  "title": "The Space Station Update",
  "date": "TBD",
  "backgroundImage": "/thumbnails/space-station-update.webp",
  "description": "Derelict procedural space stations. Buy a scanner, find one, loot it.",
  "changes": [
    "Procedurally generated derelict stations spawn on the solar map.",
    "Buy Space Station Scanners in outer-system shops — better the further from the Sun.",
    "Find keycards, solve security puzzles, and reach the reward room.",
    "First security puzzle: the Microwave Minigame — memorize a safe path or get cooked.",
    "Exclusive derelict loot: tier-3 upgrade unlocks, rare trade goods, exclusive paint jobs, and new arcade ROMs."
  ]
}
```

---

## Open Questions (intentionally deferred)

1. Exact procgen algorithm — corridor stitching strategy (depth-first walk? wave-function-collapse?). Decide in the procgen design spec.
2. How many minigames before this update can ship — one (microwave) might be enough for v1.
3. Whether stations should persist across save reloads if the run is mid-progress, or treat session-close as abandonment.
4. Tuning of scanner failure rates per tier.
5. Whether derelict-exclusive paints are limited per save (collectible) or just a recurring drop pool.

These don't block authoring the microwave minigame, which is the planned first build step.
