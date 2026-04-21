# Turret Mode — Design Spec

**Date:** 2026-04-20
**Author:** guinetik
**Status:** Draft
**Related:**
- `docs/asteroid-lander-gdd.md` (game design doc)
- `2026-04-04-map-view-design.md` (map architecture)
- `2026-04-04-multitool-switching-design.md` (LAS/drill/heal modes — pattern reference for future weapon mode)
- `2026-04-05-map-shuttle-player-design.md` (shuttle on map)
- `2026-04-18-gather-mission-design.md` (mining flow reference)
- `2026-04-19-eva-minigame-wiring-design.md` (session/fade pattern reference)

## Problem

The shuttle on `/map` flies through an asteroid field that is currently decorative — asteroids tumble and render for ambience, but nothing can interact with them. The game already has a full mining pipeline (rock HP, loot composition, yield extraction, inventory commit, tractor VFX) on the level scene using `RockYieldSystem` + `ProjectileSystem` + the FPS multitool's LAS/drill modes. Players want to mine the asteroid field directly from the ship without landing.

## Goals

- Press **T** on the map to enter a first-person "nose turret" view.
- Mine asteroids with a continuous beam that consumes shuttle fuel.
- Reuse the existing `RockYieldSystem`, inventory pipeline, and upgrade system — do not fork them.
- Integrate with `MapViewController.ts` (already 4089 lines) with **≤ 40 lines of delta**. All turret logic lives in new modules.
- Gate the feature behind a new upgrade (`turretMiningUnlock`) so new players don't get it for free.
- Lay architectural groundwork for a future weapon mode (`turretWeapon*` upgrades) without shipping any weapon code in this pass.

## Non-Goals (this pass)

- **Weapon mode / LAS turret.** The upgrade IDs `turretWeaponUnlock`, `turretWeaponDamage`, `turretWeaponEfficiency` are reserved and documented below, but no weapon code ships. Map combat targets do not exist yet; adding weapon mode before they do would be architecture without gameplay.
- Changes to the level-scene mining pipeline.
- Changes to `ProjectileSystem` — the turret uses a continuous-beam raycast, not discrete bolts.
- Mobile / gamepad input. Mouse + keyboard only.
- Audio design beyond call-site hooks (a follow-up audio pass can fill the SFX).

## User Flow

1. Player is flying on `/map` (map closed, not docked, not dead, `turretMiningUnlock` purchased).
2. Player presses **T**. `MapModeCoordinator.resolveTurretToggle()` allows entry.
3. Map sim freezes (same branch-skip pattern used for EVA, habitat, and map open). Screen fades to black over `TURRET_FADE_IN_DURATION` (0.4s default).
4. At full opacity, camera is detached from `MapCamera` and parented to a new `turretBase` at the shuttle nose. Pointer locks. HUD switches to the turret overlay (fuel bar, turret charge bar, inventory chip, cone indicator, reticle).
5. Fade back in. Turret input is live:
   - **Mouse**: pitch + yaw within a `±TURRET_CONE_HALF_ANGLE` (60°) cone relative to the turret base.
   - **A / D**: rotate the turret base in yaw at `TURRET_TRAVERSE_SPEED` (50°/s). Can traverse 360°.
   - **Space / LMB**: hold to fire the continuous mining beam.
   - **Esc / T**: exit turret.
6. While firing, the beam raycasts against registered asteroid instances. Rocks take kg/sec damage scaled by the `turretMiningYield` upgrade. Fuel drains through the shuttle's `ThrusterSystem` via a new `turretMining` thruster group.
7. On asteroid depletion, `onConsume` fires: the belt instance is hidden, tractor particles burst from the rock's last position and steer toward the shuttle nose, yield is already committed to inventory (at beam-hit time) via the existing `addItem` + `saveInventory` path.
8. Exit fades out, camera returns to `MapCamera`, sim unfreezes. If the player drained shuttle fuel to 0, the existing adrift timer + refuel UI button pick up on the next map tick as normal.

## Scope Boundary Diagram

```
MapViewController.tick()
  ├─ mapState branch                  (existing, unchanged)
  ├─ habitatState branch              (existing, unchanged)
  ├─ turretToggle resolution          (NEW — ~5 lines)
  ├─ turretSession.isActive branch    (NEW — ~6 lines, mirrors habitat)
  │   └─ TurretSession.tick(dt, deps)
  │       ├─ TurretAimState.tick        (pure)
  │       ├─ TurretBeamSystem.tick      (raycast + damage)
  │       ├─ TurretYieldCoordinator     (RockYield ↔ belt ↔ inventory)
  │       ├─ TurretRigController.tick   (3D application)
  │       └─ TurretTractorEmitter.tick  (particles)
  └─ (remaining flight/orbit/health logic — unchanged)
```

## Module Boundaries

### New files (lib, pure-ish)

- `src/lib/map/turret/TurretSession.ts` — state machine (`idle | opening | active | closing`), fade driver, camera handoff orchestration, input polling facade. Owns the whole turret session lifecycle.
- `src/lib/map/turret/TurretAimState.ts` — pure aim math: base yaw, cone-relative pitch/yaw, clamps, world-space aim ray. Unit-tested.
- `src/lib/map/turret/TurretBeamSystem.ts` — per-tick ray-sphere raycast against registered asteroids, damage accumulator, target resolution. Pure with injected deps.
- `src/lib/map/turret/TurretYieldCoordinator.ts` — bridges `RockYieldSystem` ↔ `AsteroidBeltController` ↔ inventory ↔ tractor emitter. Owns `spawnIndex → instance` map and fractional-kg buffer.
- `src/lib/map/turret/turretConstants.ts` — typed constants read from JSON at boot (cone, traverse speed, beam range, dps, tier HPs).

### New files (three, visuals)

- `src/three/TurretRigController.ts` — owns `turretBase` Object3D, `TurretCamera` (PerspectiveCamera), reticle sprite, beam cylinder mesh. Reads `TurretAimState`, writes Three transforms. No game logic.
- `src/three/TurretTractorEmitter.ts` — `ParticleEmitter` flavor with per-particle steering toward a target `Object3D`. Used only at asteroid-depletion moments.

### New data files

- `src/data/map/turret-config.json` — all tunable numeric knobs (cone, traverse, beam, fade durations, thruster tuning, tier cutoffs).
- `src/data/asteroid-belt-loot.json` — loot composition tables keyed by tier (`asteroid-belt-small`, `asteroid-belt-medium`, `asteroid-belt-large`). Schema matches existing `MineralEntry[]` so `RockYieldSystem` reads it unchanged.

### Edits to existing files

| File | Delta | Nature |
|---|---|---|
| `src/views/MapViewController.ts` | ~30 lines | Field, lazy-init helper, tick-branch. |
| `src/lib/map/mode/MapModeCoordinator.ts` | +1 pure function | `resolveTurretToggle(input): 'enter' \| 'exit' \| null`. |
| `src/lib/physics/thrusterSystem.ts` | 2 lines | Add `'turretMining'` to `ShuttleThrusterName`; add default tuning to `DEFAULT_SHUTTLE_CONFIG`. |
| `src/data/upgrades.json` | 3 entries | `turretMiningUnlock`, `turretMiningYield`, `turretMiningEfficiency`. |
| `src/lib/upgrades.ts` | 3 IDs in union, 3 definitions | Standard upgrade addition. |
| `src/lib/defaultBindings.ts` | 1+ bindings | `toggleTurret` → T; `exitTurret` → Esc; `turretYawLeft` → A; `turretYawRight` → D; `turretFire` → Space or LMB. |
| `src/three/controllers/AsteroidBeltController.ts` | ~2 methods | `enumerateInstances()`, `hideInstance(localIndex)` (set scale-zero matrix). |

## State Machine: `TurretSession`

Mirrors `EvaSession` and the habitat state pattern.

```ts
export type TurretPhase = 'idle' | 'opening' | 'active' | 'closing'

export class TurretSession {
  get isActive(): boolean     // phase !== 'idle'
  get phase(): TurretPhase
  get fadeOpacity(): number   // 0..1, driven by phase + timer

  open(): void                // idle → opening
  requestExit(): void         // active → closing (also triggered by exit key)
  tick(dt: number, deps: TurretTickDeps): void
}

interface TurretTickDeps {
  exitPressed: boolean
  // TurretSession polls other input directly via its own InputManager handle
}
```

**Transitions**

| From | Event | To | Side effects |
|---|---|---|---|
| `idle` | `open()` | `opening` | request pointer lock, register rocks, build rig, start fade-in timer |
| `opening` | `fadeOpacity >= 0.98` | `active` | camera handoff complete, enable input |
| `active` | `requestExit()` or `exitPressed` or `shuttleController.dead` | `closing` | forcibly stop beam, start fade-out timer |
| `closing` | `fadeOpacity <= 0.02` | `idle` | restore MapCamera, release pointer, dispose rig, unregister rocks, drop fractional yield buffer |

**Sim freeze**: because `MapViewController.tick()` returns early when `turretSession.phase !== 'idle'`, all downstream logic (flight, orbit, gravity, health, adrift timer) is paused. This is intentional and consistent with how EVA already freezes `shuttleController` auto-rescale (see memory `project_eva_on_map.md`).

**Failure handling during active**

- **Turret charge depleted (out of shuttle fuel):** `thrusterSystem.canFire('turretMining')` goes false. Beam stops visually this tick; will not re-fire until fuel returns (won't, in-session — session freezes flight). HUD flashes "OUT OF FUEL".
- **Inventory full:** beam continues damaging the rock; `addItem` fails for full stacks and `onResourcePickupFailed` fires a toast ("INVENTORY FULL — JETTISONING"). Surplus kg is dropped. Avoids softlock; player feedback is explicit.
- **`shuttleController.dead`** (defensive): force-close. Should not occur during sim freeze, but the guard is cheap.

## Power Model

The turret is a **thruster group on the shuttle's existing `ThrusterSystem`**. One shared shuttle fuel pool. No new system instance, no new tank.

**Type change** — `src/lib/physics/thrusterSystem.ts`:

```ts
export type ShuttleThrusterName = 'thrust' | 'brake' | 'rcs' | 'turretMining'
```

**Default tuning** added to `DEFAULT_SHUTTLE_CONFIG` (illustrative; final numbers in `turret-config.json`):

```ts
turretMining: {
  capacity: 100,
  burnRate: 20,             // charge/s while firing → ~5s burst from full
  rechargeRate: 25,         // charge/s while idle  → ~4s to refill
  fuelCostPerRecharge: 0.8, // shuttle fuel per unit of charge recovered
}
```

**Fire gate**

```ts
const canFire = thrusterSystem.canFire('turretMining')
beamActive = fireHeld && canFire
thrusterSystem.tick(dt, { turretMining: beamActive, thrust: false, brake: false, rcs: false }, modifiers)
```

**Upgrade integration**

`turretMiningEfficiency` (value 1.0 → 0.4 as the upgrade levels) is passed into the tick via `ThrusterRuntimeModifiers` as a per-group fuel-cost multiplier for `turretMining`. If `ThrusterRuntimeModifiers` today does not support per-group multipliers (the shuttle's thrust/brake/rcs flow uses a global modifier), the spec assumes a small additive change: an optional `fuelCostMultiplier: Partial<Record<T, number>>` field. This mirrors the pattern `multitoolEfficiency` already establishes for the multitool's `ThrusterSystem<'drill' | 'weapon' | 'heal'>`. **Implementation confirms the exact shape against `ThrusterSystem` source; the change is additive and backward compatible.**

**Shared-pool consequences (intentional)**

- Mining fuel comes out of the same tank as flight fuel. Heavy mining reduces flight range.
- While turret is active, flight thruster groups tick with `active = false`, so they recharge from shared fuel — a tiny side benefit (mine briefly, top off RCS).
- If the player burns shuttle fuel to 0 mining, they exit turret and the existing adrift/refuel flow takes over (30s window, existing UI refuel button). No new mechanic.

## Turret Rig & Aim

### Scene graph

```
shuttleController.group
  └─ turretBase (Object3D, y-rotation only)
      └─ TurretCamera (PerspectiveCamera, local pitch + cone yaw)
          ├─ reticle (Sprite, camera-local +Z)
          └─ beamMesh (CylinderGeometry along +Z, scales per tick)
```

Turret base is positioned at a local nose offset (`TURRET_NOSE_OFFSET`, e.g. `{x: 0, y: 0.3, z: 1.8}`, tuned to the shuttle model).

### `TurretAimState` (pure)

```ts
export interface TurretAimState {
  baseYaw: number    // world-relative yaw of turret base
  coneYaw: number    // camera yaw within cone, relative to baseYaw
  conePitch: number  // camera pitch, relative to horizontal
}

export interface TurretAimInput {
  yawAxis: number   // -1 (A) | 0 | +1 (D)
  mouseDx: number   // pixels
  mouseDy: number   // pixels
}

export function tickTurretAim(
  state: TurretAimState,
  input: TurretAimInput,
  config: TurretAimConfig,
  dt: number,
): TurretAimState
```

- `baseYaw += input.yawAxis * TURRET_TRAVERSE_SPEED * dt`
- `coneYaw += -input.mouseDx * MOUSE_SENSITIVITY`, clamped to `±TURRET_CONE_HALF_ANGLE`
- `conePitch += -input.mouseDy * MOUSE_SENSITIVITY`, clamped to `±TURRET_PITCH_LIMIT`
- Pure, deterministic, unit-tested.

`TurretRigController` applies the state: `turretBase.rotation.y = baseYaw`; camera local Euler from `coneYaw`, `conePitch`, `0`.

### Aim ray

```ts
getAimRay(camera): Ray = new Ray(camera.getWorldPosition(), camera.getWorldDirection())
```

No extra math beyond Three's built-ins.

### Reticle & cone indicator

- **Reticle**: camera-space `Sprite` at fixed distance. Tint: green when `TurretBeamSystem.lastHit !== null`, white otherwise.
- **Cone indicator** (HUD overlay, 2D): small arc widget showing ship-forward, `baseYaw`, and `coneYaw` within the cone. Implementation detail lives in the Vue HUD overlay; emits from `TurretSession.onTelemetry({ baseYaw, coneYaw, charge, fuel, ... })`.

### Beam mesh

- One `CylinderGeometry` aligned along +Z, parented to camera.
- Per tick: set `scale.z = hitDistance / geometryLength`, position cylinder so its near end is at the muzzle.
- Material mirrors the level LAS visual (same emissive magenta tint, same pulse shader). Reuse the material/shader from the existing level laser where possible — the GDD phrase "same beam type" refers to this visual consistency.

## Beam Raycast & Damage

### Registration (session-scoped)

On `TurretSession` entry, `TurretYieldCoordinator` walks each `AsteroidBeltController` and registers instances with a **fresh `RockYieldSystem` instance** (scoped to the session, disposed on exit). This avoids cross-session leaks and keeps the level-scene `RockYieldSystem` untouched.

```ts
const yieldSystem = new RockYieldSystem({
  composition: [], // unused at top level; per-rock composition provided at registerRock time via MineralEntry[]
  seed: SESSION_SEED,
  boltDamageKg: 0, // not used; mineRock is called with explicit kg from beam tick
})

let globalIndex = 0
for (const belt of beltControllers) {
  for (const inst of belt.enumerateInstances()) {
    const tier = pickTier(inst.radius)
    const spawnIndex = globalIndex++
    yieldSystem.registerRock({
      spawnIndex,
      diameter: inst.radius * 2,
      composition: loadLootTable(tier.lootId),
      seed: belt.seed ^ inst.localIndex,
      hpKgOverride: tier.hpKg,
    })
    coordinator.recordInstance(spawnIndex, { belt, localIndex: inst.localIndex, position: inst.position, radius: inst.radius })
  }
}
```

**If `RockYieldSystem.registerRock` does not currently accept an HP override**, the implementation adds one optional `hpKgOverride?: number` field. Additive and backward compatible — default behavior is unchanged for all existing callers.

### Per-tick beam

Only runs when `phase === 'active'` and `fireHeld && thrusterSystem.canFire('turretMining')`:

```ts
const ray = turretRig.getAimRay()
const hit = raycastBelt(ray, TURRET_BEAM_MAX_RANGE, coordinator.instances)
// hit = { spawnIndex, position: Vector3, distance: number } | null

beamMesh.visible = true
beamMesh.setLength(hit?.distance ?? TURRET_BEAM_MAX_RANGE)

if (hit) {
  const yieldMult = getCurrentUpgradeValue('turretMiningYield')
  const kg = TURRET_BEAM_DPS * dt * yieldMult
  yieldSystem.mineRock(hit.spawnIndex, kg)
}

thrusterSystem.tick(dt, activeGroups, modifiers)
```

### Raycast implementation

Flat ray-sphere tests against `coordinator.instances` (a `{position, radius, spawnIndex}[]` list). No Three `Raycaster`, no scene graph traversal. For a few hundred belt instances this is trivial. Returns the nearest hit within `TURRET_BEAM_MAX_RANGE`.

```ts
function raycastBelt(ray: Ray, maxDistance: number, instances: InstanceRef[]): BeamHit | null
```

Pure, unit-testable.

### Depletion

`yieldSystem.onConsume(spawnIndex)`:

1. `coordinator.resolveInstance(spawnIndex) → { belt, localIndex, position }`.
2. `belt.hideInstance(localIndex)` — sets matrix scale to 0, effectively invisible at zero draw cost.
3. `coordinator.unregister(spawnIndex)` — remove from raycast list.
4. `tractorEmitter.spawnBurst(position)` — particles steer to shuttle nose over `TRACTOR_DURATION` (~0.8s).
5. Optional audio hook: `audio.playAsteroidDestroyed()`.

### Yield commit

`yieldSystem.onMineralExtracted(itemId, kg)` fires every beam tick that rolls mineral kg:

```ts
pendingYield[itemId] = (pendingYield[itemId] ?? 0) + kg
while (pendingYield[itemId] >= 1) {
  pendingYield[itemId] -= 1
  const inventory = loadInventory()
  if (!inventory) break
  const result = addItem(inventory, itemId, 1)
  if (!result.ok) {
    onResourcePickupFailed?.(getItemLabel(itemId), result.reason ?? 'Inventory full')
    break // drop remainder — avoid tight loop on persistent failure
  }
  saveInventory(result.inventory)
  onResourcePickup?.(itemId, 1, getItemLabel(itemId))
}
```

- **Buffering rationale**: at 30 kg/s beam DPS, `onMineralExtracted` fires every frame with fractional kg. Without buffering we'd thrash `localStorage` every frame. The buffer drains on whole-unit boundaries.
- **On session close**: fractional kg is discarded. Loss < 1 kg per material — not player-visible.

## Asteroid Tiers & Loot

Tier is a pure function of the belt instance's `radius`. Read from `turret-config.json`:

```json
{
  "tiers": {
    "small":  { "radiusMax": 1.5,      "hpKg": 40,  "lootId": "asteroid-belt-small"  },
    "medium": { "radiusMax": 3.5,      "hpKg": 180, "lootId": "asteroid-belt-medium" },
    "large":  { "radiusMax": 999999,   "hpKg": 600, "lootId": "asteroid-belt-large"  }
  }
}
```

**HP vs. time-to-kill** (with 30 kg/s DPS at `turretMiningYield` level 0):

| Tier | HP | TTK (lv0) | TTK (lv3, × 2.25) |
|---|---|---|---|
| Small | 40 kg | ~1.3s | ~0.6s |
| Medium | 180 kg | ~6.0s | ~2.7s |
| Large | 600 kg | ~20s | ~8.9s |

Feels right for a 5s-burst charge bar: a small rock is a snack, a medium rock needs a full burst plus refire, a large rock is a multi-cycle commitment. Tune numbers later during balance.

### Loot table — `src/data/asteroid-belt-loot.json`

Schema matches existing `MineralEntry[]`:

```json
{
  "asteroid-belt-small": [
    { "itemId": "silicate-ore", "weightKg": 0.7 },
    { "itemId": "iron-ore", "weightKg": 0.3 }
  ],
  "asteroid-belt-medium": [
    { "itemId": "silicate-ore", "weightKg": 0.55 },
    { "itemId": "iron-ore", "weightKg": 0.35 },
    { "itemId": "nickel-ore", "weightKg": 0.1 }
  ],
  "asteroid-belt-large": [
    { "itemId": "silicate-ore", "weightKg": 0.35 },
    { "itemId": "iron-ore", "weightKg": 0.35 },
    { "itemId": "nickel-ore", "weightKg": 0.2 },
    { "itemId": "rare-metal", "weightKg": 0.1 }
  ]
}
```

Item IDs must match existing entries in `inventory/catalog.ts`. Implementation pulls the actual IDs from the current catalog when writing this file. The weight/field-name shape exactly mirrors whatever `RockYieldSystem.registerRock` consumes — no adapter layer.

Tuning intent: orbital mining is **bulk common ore** relative to hand-drilling (which rolls for rarity more aggressively). Large asteroids are the only source of `rare-metal` from the turret — creating a reason to hunt big rocks.

## Upgrades

Added to `src/data/upgrades.json`:

```json
{
  "id": "turretMiningUnlock",
  "category": "shuttle",
  "label": "Mining Turret Mount",
  "description": "Installs a hull-mounted mining laser. Press T from the map to operate.",
  "baseCost": 2500,
  "maxLevel": 1,
  "valuesByLevel": [0, 1],
  "hiddenFromShop": false,
  "excludeFromMissionDifficulty": true
},
{
  "id": "turretMiningYield",
  "category": "shuttle",
  "label": "Turret Focus Array",
  "description": "Tighter beam focus extracts more ore per second.",
  "baseCost": 1800,
  "maxLevel": 3,
  "valuesByLevel": [1.0, 1.35, 1.75, 2.25],
  "hiddenFromShop": false,
  "excludeFromMissionDifficulty": true
},
{
  "id": "turretMiningEfficiency",
  "category": "shuttle",
  "label": "Turret Power Regulator",
  "description": "Reduces fuel consumption while the mining beam is active.",
  "baseCost": 1800,
  "maxLevel": 3,
  "valuesByLevel": [1.0, 0.75, 0.55, 0.4],
  "hiddenFromShop": false,
  "excludeFromMissionDifficulty": true
}
```

`src/lib/upgrades.ts`: three new IDs added to the `UpgradeId` union, three new entries in `UPGRADE_DEFINITIONS`, three entries in `CURRENT_PLAYER_UPGRADE_LEVELS` starting at level 0. Standard additive change.

**Gating**: `MapModeCoordinator.resolveTurretToggle` treats `getCurrentUpgradeValue('turretMiningUnlock') >= 1` as the unlock check. Pressing T before unlock does nothing (or emits a HUD toast "Mining Turret Not Installed" — stretch).

### Reserved (future) upgrade IDs — NOT shipped in this pass

Documented here so future specs don't re-invent the naming:

- `turretWeaponUnlock` (maxLevel 1) — enables weapon mode on the turret.
- `turretWeaponDamage` (maxLevel 3) — multiplies weapon DPS.
- `turretWeaponEfficiency` (maxLevel 3) — multiplies weapon fuel cost.

Once map combat targets exist, a follow-up spec adds these IDs, a mode toggle in `TurretSession` (`'mining' | 'weapon'`), and a second thruster group `'turretWeapon'` alongside `'turretMining'`.

## Tractor Particles

`TurretTractorEmitter` extends `ParticleEmitter` with target-steering. On `spawnBurst(worldPos)`:

- Emit `TRACTOR_PARTICLE_COUNT` (~20) particles at `worldPos` with small random initial velocities.
- Per frame: `particle.velocity += (shipNose.position - particle.position).normalize() * TRACTOR_STEER_ACCEL * dt`. Optional mild damping to avoid orbiting forever.
- Despawn particle when within `TRACTOR_ARRIVAL_RADIUS` of the shuttle nose, or after `TRACTOR_MAX_LIFETIME`.

**Color tint**: per-burst tint set from the dominant mineral rolled during the rock's life (coordinator tracks `dominantItemId` per spawnIndex as yields accumulate). If dominant-tracking adds cost, fallback is a single warm-white tint — implementation picks based on the cost of the dominant-mineral bookkeeping. Either is acceptable for this pass; the burst is pure feedback and not gameplay-coupled.

**No gameplay effect**: yield was already committed to inventory at beam-hit time. Particles are purely cosmetic feedback.

## MapViewController Integration — the full delta

The complete set of changes to `MapViewController.ts`:

### 1. Field

```ts
private turretSession?: TurretSession
```

### 2. Lazy init helper (mirrors `ensureHabitatScene`)

```ts
private ensureTurretSession(): TurretSession {
  if (!this.turretSession) {
    this.turretSession = new TurretSession({
      shuttleController: this.shuttleController!,
      beltControllers: this.beltControllers,
      sceneObjects: this.sceneObjects!,
      audio: this.shuttleAudio,
      onResourcePickup: this.onResourcePickup,
      onResourcePickupFailed: this.onResourcePickupFailed,
      onTelemetry: this.onTurretTelemetry,
    })
  }
  return this.turretSession
}
```

### 3. Tick-loop insertion — after habitat branch (~line 1170), before `introLocked` check (~line 1172)

```ts
const turretToggle = this.modeCoordinator.resolveTurretToggle({
  togglePressed: this.inputManager?.wasActionPressed('toggleTurret') ?? false,
  turretActive: this.turretSession?.isActive ?? false,
  orbitState: this.orbitSystem?.state ?? 'free',
  mapIsOpen: this.mapState.isOpen,
  habitatActive: this.habitatState.isActive,
  evaActive: this.evaSession?.isActive ?? false,
  isDead: this.shuttleController?.dead ?? false,
  unlocked: getCurrentUpgradeValue('turretMiningUnlock') >= 1,
  introLocked,
})
if (turretToggle === 'enter') this.ensureTurretSession().open()

if (this.turretSession?.isActive) {
  this.turretSession.tick(dt, {
    exitPressed: this.inputManager?.wasActionPressed('exitTurret') ?? false,
  })
  this.onTurretFade?.(this.turretSession.fadeOpacity)
  if (this.turretSession.phase !== 'idle') return
}
```

### 4. New callback surface (declared alongside existing `onTelemetry`, etc.)

```ts
onTurretFade?: (opacity: number) => void
onTurretTelemetry?: (telemetry: TurretTelemetry) => void
```

Both forwarded from the controller to the Vue layer, where the HUD overlay and fade overlay consume them. `MapView.vue` wires them up.

**Total: ~30–40 lines of delta to `MapViewController.ts`.** Everything else lives in `TurretSession` and its collaborators.

## `MapModeCoordinator.resolveTurretToggle`

Pure function, no side effects:

```ts
interface TurretToggleInput {
  togglePressed: boolean
  turretActive: boolean
  orbitState: OrbitState
  mapIsOpen: boolean
  habitatActive: boolean
  evaActive: boolean
  isDead: boolean
  unlocked: boolean
  introLocked: boolean
}

export function resolveTurretToggle(input: TurretToggleInput): 'enter' | null {
  if (!input.togglePressed) return null
  if (input.turretActive) return null          // already inside; exit is handled internally
  if (input.mapIsOpen) return null
  if (input.habitatActive) return null
  if (input.evaActive) return null
  if (input.isDead) return null
  if (input.introLocked) return null
  if (!input.unlocked) return null
  if (input.orbitState === 'approaching' || input.orbitState === 'exiting') return null
  return 'enter'
}
```

Exit from active turret is handled by `TurretSession` itself (ESC, T-again, death). The coordinator does not emit `'exit'` — the session owns that transition.

## Inventory Integration

Reuses the level scene's pattern verbatim. No inventory code changes.

Key behaviors:
- `loadInventory()` called each commit (cheap; localStorage read).
- `addItem()` is pure and constraint-checks weight + slots.
- `saveInventory()` persists after each successful commit.
- `onResourcePickupFailed` is reused — the existing toast system handles "Inventory full" display.
- Session buffering (fractional kg) avoids localStorage thrash.

## Input Bindings

`src/lib/defaultBindings.ts` — new entries:

```ts
toggleTurret: ['KeyT'],
exitTurret: ['Escape', 'KeyT'],       // T toggles, Esc exits
turretYawLeft: ['KeyA', 'ArrowLeft'],
turretYawRight: ['KeyD', 'ArrowRight'],
turretFire: ['Space', 'MouseLeft'],
```

**Binding routing.** `toggleTurret` is polled by `MapViewController` (for entry) and `exitTurret` is polled by `TurretSession` (for exit). Because `TurretSession.isActive` causes `MapViewController.tick()` to early-return, `toggleTurret` cannot fire while the session is active, so the shared `KeyT` between toggle-in and exit-out cannot double-fire within a single press. `TurretSession` polls its bindings directly via its own `InputManager` handle, distinct from the map's input manager. This prevents stray bindings (`toggleMap`, `toggleDoors`, `interact`, etc.) from leaking into turret mode.

## Testing Plan

Per CLAUDE.md, tests focus on `src/lib/`. No tests for `TurretRigController` or `TurretTractorEmitter` (Three.js layer).

### New test files

- `src/lib/map/turret/__tests__/turretAimState.spec.ts`
  - Base yaw accumulates proportional to A/D input × dt.
  - Cone yaw clamps at `±TURRET_CONE_HALF_ANGLE`.
  - Pitch clamps at `±TURRET_PITCH_LIMIT`.
  - Neutral input → no drift.
  - Mouse input sign is inverted appropriately (mouse-right = turret-right).

- `src/lib/map/turret/__tests__/turretSession.spec.ts`
  - `open()` transitions `idle → opening`.
  - Fade opacity progresses from 0 to 1 over `TURRET_FADE_IN_DURATION`.
  - At opacity ≥ 0.98, `opening → active`.
  - `requestExit()` during active → `closing`.
  - `shuttleController.dead` during active → `closing`.
  - `closing` fades back and returns to `idle` at opacity ≤ 0.02.
  - `isActive` reflects `phase !== 'idle'`.

- `src/lib/map/turret/__tests__/turretBeamSystem.spec.ts`
  - Ray-sphere hit returns correct `{spawnIndex, distance}` for a single sphere.
  - Overlapping spheres return the nearest-along-ray.
  - Ray past `TURRET_BEAM_MAX_RANGE` returns null.
  - Ray missing all spheres returns null.
  - Hit data matches the instance data passed in.

- `src/lib/map/turret/__tests__/turretYieldCoordinator.spec.ts`
  - Registration assigns unique `spawnIndex` across multiple belts.
  - `unregister` removes the entry and drops from raycast list.
  - Fractional kg buffer commits on whole-unit boundaries only.
  - `addItem` failure does not tight-loop (break on first failure).
  - Cleanup on session close drops buffered fractional kg.

### Extended test files

- `src/lib/__tests__/upgrades.spec.ts`
  - `turretMiningUnlock` returns 0 at level 0, 1 at level 1.
  - `turretMiningYield` returns each `valuesByLevel` entry by level.
  - `turretMiningEfficiency` returns each `valuesByLevel` entry by level.

- `src/lib/map/mode/__tests__/mapModeCoordinator.spec.ts` (or nearest existing coordinator test)
  - `resolveTurretToggle` returns `null` without press.
  - Returns `null` when any of: already active, mapIsOpen, habitatActive, evaActive, isDead, !unlocked, introLocked.
  - Returns `null` when `orbitState === 'approaching' | 'exiting'`.
  - Returns `'enter'` in free flight with unlock, no other modes active, press true.

### Out-of-scope for tests

- Three.js rendering, camera handoff, pointer-lock wiring, fade overlay composition.
- Inventory pipeline (already covered by existing tests).
- `RockYieldSystem` internals (already tested).

## Acceptance Criteria

Before merge:
1. `bun run type-check` — clean.
2. `bun run lint` — oxlint 0 errors, ESLint 0 errors & 0 warnings. All new exports carry TSDoc with `@author guinetik`, `@date 2026-04-20`, `@spec` pointing to this doc.
3. `bun run test:unit` — all green including new turret specs.
4. In-browser smoke test: press T on map with `turretMiningUnlock` purchased → fade in → aim → mine a few asteroids → inventory fills → particles arrive → exit cleanly → map resumes. Verify adrift flow still works if fuel drained to 0 during mining.

## Open Questions / Caveats (captured for implementation)

1. **`ThrusterRuntimeModifiers` per-group fuel multiplier** — if not present today, add additively. One-line schema extension + one tick-site read. Spec assumes this is a trivial change; if it balloons, raise during implementation.
2. **`RockYieldSystem.registerRock` HP override** — if the current API derives HP strictly from `diameter`, add an optional `hpKgOverride?: number` field. Pure additive change; existing callers unaffected.
3. **`AsteroidBeltController.hideInstance`** — scale-to-zero matrix trick is standard; confirm the controller's per-instance matrix API supports re-application without flicker.
4. **Belt instance enumeration** — `enumerateInstances()` is a new read-only iterator exposing `{position, radius, localIndex}`. If the current controller stores these per-instance (it does, for collision), this is a ~5-line addition.
5. **Beam material reuse** — if the level's LAS bolt material is tightly coupled to `ProjectileSystem`'s bolt mesh (not a standalone material), extract a shared material into `src/three/materials/` as a small refactor rather than duplicating shader code. Stay focused — only do the extraction if necessary.

## Future Work (documented, not implemented)

- **Weapon mode** (`turretWeapon*` upgrades, mode toggle in `TurretSession`, second thruster group). Requires map combat targets (pirates, hostile drones, etc.) to exist first.
- **Ship mining missions** — mission type that specifies a minimum yield from the belt, completable via turret mining.
- **Asteroid types** (ice / metal / rare) — replacing size-driven tiers with type-driven ones if the belt generator grows a type field. Loot table schema already supports this shape.
- **Turret audio** — dedicated SFX for beam loop, asteroid destroyed, tractor arrive, exit.
