# Thruster & Fuel System + ShuttleHud Design

## Overview

Three-thruster resource system with a shared fuel tank, plus a Vue HUD overlay. Thrusters consume charge when active, recharge when idle (consuming fuel). Running out of fuel stops recharging; running out of everything is game over. The HUD displays thruster gauges, fuel bar, speed, heading, and position.

## Domain Layer — ThrusterSystem (`src/lib/physics/thrusterSystem.ts`)

Pure TypeScript, no framework dependencies. Manages three thrusters and a fuel tank.

### Thruster Properties

Each thruster has:
- `capacity` — maximum charge
- `charge` — current charge (starts at capacity)
- `burnRate` — charge consumed per second while active
- `rechargeRate` — charge recovered per second while idle
- `fuelCostPerRecharge` — fuel consumed per unit of charge recharged

### Fuel Tank

- `capacity` — maximum fuel
- `level` — current fuel (starts at capacity)
- When fuel is empty, thrusters stop recharging but remaining charge is usable
- Emits `onFuelEmpty` callback when fuel reaches zero
- Future: inventory system can refill fuel (out of this scope)

### Tick Logic

Each frame (`tick(dt, activeThrusters)`):

1. **Active thrusters** drain: `charge -= burnRate * dt`
2. **Idle thrusters** recharge: if fuel > 0, `charge += rechargeRate * dt`, `fuel -= rechargeRate * dt * fuelCostPerRecharge`
3. A thruster **can fire** only if `charge >= burnRate * dt` (enough for at least one frame)
4. Charge clamped to `[0, capacity]`, fuel clamped to `[0, capacity]`

### API

```ts
interface ThrusterState {
  charge: number
  capacity: number
  active: boolean
}

class ThrusterSystem {
  constructor(config: ThrusterSystemConfig)
  canFire(thruster: 'thrust' | 'brake' | 'rcs'): boolean
  tick(dt: number, active: { thrust: boolean, brake: boolean, rcs: boolean }): void
  getState(thruster: 'thrust' | 'brake' | 'rcs'): ThrusterState
  get fuelLevel(): number
  get fuelCapacity(): number
  get isFuelEmpty(): boolean
  get isAllDepleted(): boolean  // fuel empty AND all thrusters empty
  onFuelEmpty: (() => void) | null
  onAllDepleted: (() => void) | null
}
```

### Default Values

| Param | Red (thrust) | Blue (brake) | White (RCS) |
|-------|-------------|-------------|-------------|
| Capacity | 100 | 80 | 120 |
| Burn rate | 15/s | 12/s | 5/s |
| Recharge rate | 8/s | 6/s | 10/s |
| Fuel cost/recharge | 0.5 | 0.4 | 0.2 |

Fuel tank: capacity 500, starts full.

## ShuttleController Integration

ShuttleController owns a ThrusterSystem. Before applying any force, it checks `canFire()`:
- `thrust` action → checks `canFire('thrust')`, only applies THRUST_FORCE if true
- `brake` action → checks `canFire('brake')`, only applies BRAKE_FACTOR if true
- `yawLeft`/`yawRight` → checks `canFire('rcs')`, only applies YAW_TORQUE if true

The `isThrusting`, `isBraking`, `isYawingLeft`, `isYawingRight` getters should reflect actual firing (input active AND canFire), so thruster particles only emit when charge is actually being consumed.

ThrusterSystem.tick() is called inside ShuttleController.tick() with the active state of each thruster.

## ShuttleHud.vue (`src/components/ShuttleHud.vue`)

Vue component overlaid on the 3D scene. No inline CSS — styles in main.css with @apply.

### Layout

- **Top center** — position coordinates `X: 300 Z: 150`
- **Top left** — horizontal fuel bar (green → yellow → red as it depletes)
- **Bottom center** — three vertical gauge bars side by side:
  - Red bar (thrust charge)
  - Blue bar (brake charge)  
  - White bar (RCS charge)
  - Each shows fill level as percentage of capacity
- **Bottom left** — `SPD 12.3` and `HDG 045°`

### Data Flow

HomeViewController extends the `onTelemetry` callback to include thruster and fuel state. ShuttleHud receives all data as props — no store needed for this demo.

```ts
interface ShuttleTelemetry {
  speed: number
  heading: number
  posX: number
  posZ: number
  fuelLevel: number
  fuelCapacity: number
  thrustCharge: number
  thrustCapacity: number
  brakeCharge: number
  brakeCapacity: number
  rcsCharge: number
  rcsCapacity: number
}
```

HomeView.vue creates ShuttleHud and passes telemetry as reactive props.

## File Structure

```
src/lib/physics/thrusterSystem.ts       — pure TS thruster + fuel logic
src/lib/physics/__tests__/thrusterSystem.spec.ts — unit tests
src/components/ShuttleHud.vue           — HUD overlay component
src/assets/css/main.css                 — HUD styles (added)
src/views/HomeView.vue                  — mounts ShuttleHud, passes telemetry
src/views/HomeViewController.ts         — reads ThrusterSystem state each tick
src/three/ShuttleController.ts          — owns ThrusterSystem, gates thrust on canFire
```

## Game Over Flow

1. Fuel reaches zero → `onFuelEmpty` fires (informational, not fatal)
2. All thrusters reach zero charge → `onAllDepleted` fires
3. HomeViewController catches `onAllDepleted` → triggers respawn (same as death by gravity)

## Out of Scope

- Inventory refueling
- Thruster upgrades
- Sound effects
- Thruster particle color/intensity changes based on charge level
