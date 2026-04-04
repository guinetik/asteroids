# ASTEROID LANDER — Game Design Document
**Version 0.3 — April 4, 2026**
**Levelsio Vibe Coding Game Jam 2026 — Deadline: May 1, 2026 @ 13:37 UTC**

---

## High Concept

A space trucker simulation in three acts: navigate a real-scale solar system using gravitational slingshots, pilot a lunar lander onto procedurally generated asteroids, then exit on foot in first person to complete missions with a multi-tool. Manage fuel, oxygen, and momentum across two vehicles and your own boots. Everything is physics. Everything costs something.

**One-sentence pitch:** Fly a beat-up shuttle through spacetime curvature, land a NASA lander on asteroids, then step outside in first person to drill, shoot, and rescue — all while your fuel ticks down.

---

## Lore & Setting

### The World

It's the 2300s. About 200 years ago, the discovery of neutron thrusters democratized space travel. A massive space rush followed — companies mass-produced landers, rovers, habitats, and mining rigs. Asteroid mining colonies popped up across the belt and out toward the Kuiper belt. For a brief, golden era, space was the new frontier.

Then the bubble collapsed.

The companies folded. The infrastructure crumbled. The colonies were abandoned — or worse, left half-operational with skeleton crews. Some were overrun by alien organisms that had been dormant in the rock. Humanity is now scattered across space in a loose, unglamorous diaspora. No federation, no empire. Just people making do with aging equipment and shrinking margins.

### The Player

An independent contractor. A space trucker. You own two things: a refurbished space shuttle and a NASA-era lunar lander that rides in its cargo bay. Both are from the third space race — about 200 years old, held together with aftermarket parts and stubbornness. Both are paid off. That's all that matters.

You take contracts from a mission board. Mining companies need resources extracted. Colony administrators need infestations cleared. Distress signals come in from workers trapped in overrun sites. You fly there, land, step outside, do the work, get back in, fly home, get paid.

You have a cat.

### The Vehicles

**The Shuttle (Mothership)**
A space shuttle — the iconic NASA silhouette, 200 years past warranty. The cargo bay carries the lander. The flight deck is your home. Navigation requires gravitational slingshots around planets because the fuel budget doesn't support brute-force trajectories across the solar system.

Thruster system: 3 thrusters (main thrust, inertia dampener/brake, RCS side thrusters) sharing a common fuel reservoir.

**The Lander**
A NASA-era lunar lander, retrofitted with neutron thrusters and 16 RCS attitude control thrusters (4 quads × 4 directions: Aft, Down, Fore, Up). Deployed from the shuttle's cargo bay at mission sites. The lander is the player's taxi from orbit to asteroid surface and back.

Thruster system: 17 thrusters (1 main engine + 16 RCS) sharing a common fuel reservoir. Same ThrusterSystem class as the shuttle, different configuration.

**The Multi-Tool (On foot)**
A handheld device with three modes. The player's only tool when outside the lander. Low-poly first-person fixture prop — always visible, always in hand.

---

## Core Design Philosophy

### Fuel Is Life

The entire game is about fuel and resource management expressed through real-time physics. There is no health bar on the lander. There is no damage from rough landings. The asteroid doesn't punish you — *you* punish yourself through inefficiency.

Every thruster burst costs charge. Every charge recharge costs fuel. Every wasted maneuver is fuel you don't have for the return trip. The player who wins is the one who develops an intuition for calculated burns — who can *feel* how much delta-v a maneuver costs without doing the math.

The ThrusterSystem is the universal tension mechanic:
- Each thruster has a **charge bar** — drains while firing, recharges while idle
- Recharging consumes **fuel** from the shared tank
- **Fuel empty** = remaining charge is all you have, nothing recharges
- **All depleted** = dead in space, drifting, mission failed

This system is identical for both the shuttle and the lander. Different configs, same class, same stakes.

### Physics Is Honest

No auto-stabilization. No aim assist. Newtonian mechanics throughout. The player earns mastery through practice, not upgrades. The game teaches orbital mechanics and momentum management through play without ever showing an equation.

### The Vibe

Blue-collar space work. Not glamorous, not heroic. Silence, engine hum, radio crackle. The loneliness of being the only person on a rock in the void. The mundane warmth of returning to the shuttle where the cat is waiting.

---

## Game Layers

The game has four distinct gameplay layers:

```
┌─────────────────────────────────────────────────────────────┐
│  LAYER 1: SHIP HUB                                         │
│  Shuttle interior — mission select, inventory, shop, cat    │
└──────────────────────┬──────────────────────────────────────┘
                       │ Accept mission → get waypoint
                       ▼
┌─────────────────────────────────────────────────────────────┐
│  LAYER 2: SOLAR SYSTEM NAVIGATION                           │
│  3D map — fly shuttle, slingshot planets, reach target       │
└──────────────────────┬──────────────────────────────────────┘
                       │ Arrive at asteroid → open cargo bay (F)
                       ▼
┌─────────────────────────────────────────────────────────────┐
│  LAYER 3: LANDER FLIGHT                                     │
│  Full 3D — pilot lander from shuttle to asteroid surface,   │
│  navigate terrain, land near objectives                     │
└──────────────────────┬──────────────────────────────────────┘
                       │ Grounded → press F to exit
                       ▼
┌─────────────────────────────────────────────────────────────┐
│  LAYER 4: FIRST PERSON — ON FOOT                            │
│  FPS view — multi-tool, O2 timer, complete objectives,      │
│  gather / exterminate / rescue                              │
└──────────────────────┬──────────────────────────────────────┘
                       │ Press F to re-enter lander
                       ▼
              Fly to next objective or exfil → LAYER 1
```

---

## Layer 1: Ship Hub

The shuttle interior between missions. Your apartment, your office, your truck cab.

### Elements
- **Mission Board** — incoming contracts: location, type, pay, difficulty, distance
- **Workbench** — repair lander, manage loadout
- **Inventory** — resources gathered, fuel reserves, supplies
- **Shop** — buy supplies, sell gathered resources, trade
- **The Cat** — wanders the screen, sits on the console, knocks things over
- **Radio** — ambient world-building: colony chatter, news broadcasts, lo-fi music
- **Window** — stars, void, nearby celestial bodies

### Design Note
Can be a stylized 2D/UI screen. Personality over polygon count. The cat, the radio, good typography — that's enough. A rushed 3D interior is worse than a polished menu with character.

---

## Layer 2: Solar System Navigation

### Overview
Real-time navigation across a data-driven, procedurally rendered solar system. No fast travel. You pilot the shuttle through actual spacetime curvature.

### Perspective
3D perspective view, camera behind/above the shuttle. SpaceTimeGrid renders as a deformable mesh visualizing gravitational curvature. Procedural GLSL shaders for all celestial bodies.

### Gravity Slingshot Mechanic

The core navigation system. Based on Schwarzschild spacetime curvature.

- Shuttle moves on a 2D plane (the grid) using WASD
- Player CANNOT directly control Y — only way to change Y is falling into a gravity well
- Gravity wells (sun, gas giants) deform the grid visibly
- Entering a gravity well's influence → shuttle falls toward barycenter
- **Slingshot:** correct attack angle → swing around the body, exit with massive velocity boost
- **Capture:** wrong angle or too slow → pulled past event horizon (orange ring) → game over (sun) or crash (planet)

### Navigation Challenge
Reaching distant targets (asteroid belt, Kuiper belt) requires chaining slingshot maneuvers. The shuttle's fuel budget can't support straight burns over those distances. The player must read the planetary positions and plan multi-body trajectories.

### Shuttle Controls
- **WASD** — 2D movement along grid plane
- **3 thrusters:** main (forward), brake (inertia dampener), RCS (side, A/D)
- Each thruster has charge bar + shared fuel reservoir (ThrusterSystem)
- **F** — open/close cargo bay doors (for lander deployment)

### Solar System Data
- 10 planets with Keplerian orbital mechanics
- 30+ moons
- 2 asteroid belts (main belt + Kuiper)
- Real telemetry: vis-viva velocity, solar time
- Gravitational mass in solar masses
- 5 GLSL shaders: star plasma, rocky terrain, gas giant bands, ring structure, shared vertex
- GravitySource interface shared with shuttle physics

---

## Layer 3: Lander Flight

### Overview
The player deploys the lander from the shuttle's cargo bay and flies it to the asteroid surface. Full 3D flight — not side-view, not locked to a plane. The lander can approach the asteroid from any angle, orbit it, circle it, and choose a landing spot near mission objectives.

### Perspective
Full 3D, third-person camera following the lander. The asteroid terrain fills the view as the player descends. Stars and the distant shuttle visible above.

### Physics: Newtonian Micro-Gravity
- No atmosphere, no drag
- Asteroids have very slight gravitational pull — idle lander drifts toward surface, doesn't "fall"
- Thrust applies force in nozzle direction
- No auto-stabilization — every thrust persists until countered
- Rotation separate from translation (RCS handles attitude, main engine handles velocity)
- Fuel is finite per mission via ThrusterSystem

### Lander Controls
- **W/S** — pitch (tilt forward/back)
- **A/D** — yaw (rotate left/right) or roll, depending on feel testing
- **Space** — main thruster (fires in direction lander is pointing)
- **L-Shift** — boost (2.5× fuel cost, doubled thrust)
- **C** — descent assist (controlled downward thrust for landing)
- **F** — exit lander (only when grounded)
- **Grappling Hook** — (TBD key) fire tether to anchor point, swing/redirect momentum

### Grappling Hook
A tether-based traversal tool. Fire it at a rock face or anchor point; the lander swings around the anchor, redirecting momentum without spending fuel. In micro-gravity, the grapple doesn't fight weight — it redirects velocity vectors.

Physics: distance constraint between lander and anchor. If `distance > ropeLength`, tension force pulls lander along rope vector. Release at the right moment to launch in a new direction.

Use cases:
- Traverse: swing around asteroid terrain features without thruster fuel
- Reach: access difficult terrain (overhangs, crater interiors, cliff faces)
- Combat: reposition quickly during exterminate missions
- Efficiency: chain grapple swings to conserve fuel for exfil

### Landing
When the lander contacts the terrain at low velocity → grounded state. Lander settles on landing legs. HUD shows "EXIT (F)" prompt. Player can stay in the lander and reposition, or exit to complete objectives on foot.

### The 17-Thruster System
The lander's ThrusterSystem has 17 thrusters:
- 1 main engine (bottom, primary thrust)
- 16 RCS thrusters: 4 quads (Front-Left, Front-Right, Back-Left, Back-Right) × 4 directions (Aft, Down, Fore, Up)

Each RCS thruster fires visually from its rigged mesh node in the GLB model. Player inputs map to thruster groups:
- Pitch forward → FL_Down + FR_Down + BL_Up + BR_Up
- Yaw left → FL_Aft + FR_Fore + BL_Aft + BR_Fore
- And so on — every visible puff corresponds to actual physics force

All 17 share one fuel reservoir. Every attitude correction costs fuel. Efficient piloting means minimal corrections.

---

## Layer 4: First Person — On Foot

### Overview
The player exits the lander and is now on foot, first person, on the surface of an asteroid in micro-gravity. This is where mission objectives are completed. The lander is visible behind you, parked on the surface.

### Perspective
First person. Camera at eye level. Multi-tool always visible in hand (low-poly FPS fixture prop, like the tool in a retro FPS). Crosshair for aiming. HUD shows O2 meter, multi-tool mode, and objective markers.

### Movement
Micro-gravity on foot. The player doesn't walk normally — they bounce, drift, push off surfaces. Each step is a small thrust. Movement feels floaty but controllable.

- **WASD** — move (thrust in direction relative to camera)
- **Space** — jump (in micro-gravity this launches you significantly)
- **Mouse** — look
- **Scroll wheel / 1-2-3** — swap multi-tool mode
- **Left click** — use multi-tool
- **F** — re-enter lander (when near and grounded)

### O2 Meter
Oxygen supply ticks down while on foot. This is the timer that prevents the player from wandering indefinitely. Returning to the lander replenishes O2. O2 can also be found at certain objective sites or carried as inventory items.

O2 creates mission pacing:
- Short EVAs: exit, do one objective, return to lander, fly to next objective
- Risky long EVAs: try to chain multiple objectives in one outing, cut it close on O2
- Emergency: O2 warning, sprint back to lander, barely make it

### The Multi-Tool

One prop, three modes. Low-poly, visible in first person. Each mode has a distinct visual state (color change, emitter shape, animation).

#### Mode 1: DRILL (Gather missions)
- Point at resource deposit → hold left click → laser drill extracts resources
- Visual: focused beam, particles flying off the rock, deposit glows and shrinks
- Resources transfer to lander inventory (must return to lander to "bank" them)
- Deposits are scattered across the asteroid surface, marked on HUD
- Some deposits are in hard-to-reach spots (cliff faces, crater floors, overhangs)

#### Mode 2: WEAPON (Exterminate missions)
- Point at bugs → left click → laser shoots
- Visual: rapid-fire beam or pulse, bug splatter particles
- Bugs are hostile — they move toward the player, attack on contact
- Nests must be destroyed to stop spawning
- In micro-gravity, combat movement is different — you can't strafe and shoot like a normal FPS. You drift, you bounce, you float. Every shot's recoil pushes you slightly. Fighting in zero-G is disorienting and unique.

#### Mode 3: HEAL (Rescue missions)
- Point at incapacitated NPC → hold left click → heal beam stabilizes them
- Visual: warm glow, medical particles, NPC status bar fills
- NPCs are found at objective sites, incapacitated (lying down, slumped, trapped)
- Once stabilized, NPCs follow the player back to the lander (simple follow AI)
- Each rescued NPC adds mass to the lander, affecting flight characteristics on exfil
- NPCs have a health state — if the player takes too long, they deteriorate. Urgency.

### Enemy Types (Exterminate & Rescue missions)

Keep minimal for jam scope. All enemies are alien bug organisms that infested mining colonies.

**Crawlers**
- Small, fast, swarm behavior
- Skitter across asteroid surface toward the player
- Melee attack on contact
- Low health, dangerous in numbers
- Visual: low-poly insectoid, bioluminescent yellow-green

**Spitters**
- Medium, stationary or slow-moving
- Ranged attack: acid projectile
- Higher health
- Visual: bulbous, pulsing, fixed to rock surface

**Nest Cores**
- Stationary organic structures embedded in terrain
- Spawn crawlers periodically
- Must be destroyed to clear an area
- High health, glowing weak point
- Visual: organic mass, tendrils, pulsing membrane

### Returning to Lander
Press F near the lander to re-enter. Perspective switches back to third-person lander view. Resources gathered on foot are now in the lander's cargo. Rescued NPCs are aboard. Player can fly to the next objective or exfil to the shuttle.

---

## Mission Types

All missions take place on procedurally generated asteroids. The player receives the contract at the Ship Hub, navigates the solar system to reach the target, deploys the lander, lands, exits on foot, completes objectives, returns to lander, exfils.

### 1. GATHER

**Contract:** "Mining survey at [asteroid designation]. Extract [N] deposits of [resource type]. Standard contractor rate."

**Objectives:** Collect N resource deposits scattered across the asteroid surface.

**Gameplay loop:**
1. Fly lander to first deposit cluster
2. Land nearby
3. Exit on foot, switch multi-tool to DRILL mode
4. Walk/bounce to deposit, hold click to extract
5. Return to lander (resources bank on re-entry)
6. Fly to next cluster or exfil when quota met

**Challenge:** Fuel-efficient routing between deposit clusters. O2 management on foot. Some deposits in hard-to-reach terrain requiring grappling hook approach or careful micro-gravity traversal.

**Mood:** Calm. Methodical. The bread and butter.

### 2. EXTERMINATE

**Contract:** "Infestation reported at [asteroid designation]. Clear [N] nest cores. Hazard pay included."

**Objectives:** Destroy N nest cores and survive.

**Gameplay loop:**
1. Fly lander to first nest area
2. Land at a safe distance (nests are defended)
3. Exit on foot, switch multi-tool to WEAPON mode
4. Fight through crawlers and spitters to reach nest core
5. Destroy nest core
6. Return to lander, fly to next nest or exfil

**Challenge:** Combat in micro-gravity is disorienting. Ammo/energy management on the multi-tool. Taking damage depletes O2 faster (suit breaches). Retreating to the lander for O2 refill costs time and fuel.

**Mood:** Tense. Chaotic. The money job.

### 3. RESCUE

**Contract:** "Distress signal from [asteroid designation]. [N] workers unresponsive. Medical supplies authorized."

**Objectives:** Locate and stabilize N incapacitated workers, escort them to the lander.

**Gameplay loop:**
1. Fly lander to first distress marker
2. Land near the signal source
3. Exit on foot, switch multi-tool to HEAL mode
4. Find incapacitated NPC, hold click to stabilize
5. NPC follows player back to lander
6. Repeat for remaining NPCs
7. Exfil with all passengers — lander is heavier per passenger

**Challenge:** NPCs deteriorate over time — urgency. Rescue sites may have bug presence (need to swap to WEAPON mode to clear, then HEAL). Each passenger adds mass to lander, making exfil progressively harder. O2 management is critical when going deep into terrain for trapped workers.

**Mood:** Urgent. Emotional. The one that reminds you why you do this.

---

## Procedural Asteroid Generation

All asteroids are procedurally generated. Zero GLB assets for terrain.

### Generation Pipeline
1. **Base shape:** Perlin noise displacement on a sphere, stretched along random axes for irregular potato shapes
2. **Craters:** Circular depressions at random surface points, varying depth and diameter
3. **Ridges and overhangs:** Sharp terrain features for gameplay variety and traversal challenge
4. **Flat zones:** Identified for viable landing spots, marked on lander HUD
5. **Resource deposits:** Placed on accessible terrain (gather missions), some on cliff faces or in craters for challenge
6. **Bug nests:** Placed in concave terrain features — craters, crevices, overhangs (exterminate missions)
7. **NPC locations:** Placed near mining infrastructure debris, in caves/overhangs (rescue missions)

### Terrain Grid
Built on the existing grid system — basic grid → SpaceTimeGrid → terrain grid (brown). Same math, different parameters. The terrain grid uses heightmap displacement for the asteroid surface, providing both visual rendering and collision data.

### Visual Style
- Grey/brown rock with procedural surface detail
- Resource deposits glow (green/amber)
- Bug nests bioluminescent (sickly yellow-green)
- Harsh directional lighting (sun), deep shadows on dark side
- Lander headlamp cuts through darkness

---

## Vibeverse Portal Integration

### Requirements Met
- ✅ Web accessible, no login, free-to-play
- ✅ No loading screens (procedural visuals load instantly, GLBs stream async)
- ✅ 90%+ AI-written code (3 Cursor agents)
- ✅ Own domain
- ✅ Portal SDK integrated

### Portal Flow
**Inbound (`?portal=true`):** Player spawns on the solar system map in the shuttle. Red entry portal at spawn point — entering it returns to referring game via `?ref=` URL. Skip any intro/menu.

**Outbound:** Green Vibeverse Portal somewhere in the game world (wormhole on the map or at a space station). Flying shuttle into it redirects to `https://jam.pieter.com/portal/2026` with forwarded query params.

### Query Params
- `?portal=true` — skip intro, spawn on map
- `?username=` — player display name
- `?ref=` — origin game for return portal
- `?color=` — accent color (shuttle running lights)
- `?speed=` — initial shuttle velocity

### Asset Budget
- Shuttle GLB: ~2MB (async load)
- Lander GLB: ~1MB (async load, optimized from 43MB via gltf-transform pipeline)
- Multi-tool: low-poly, can be procedural geometry or tiny GLB
- Everything else: procedural (planets, asteroids, skybox, grid, particles)
- Total binary assets: ~3MB
- JS bundle: ~743KB min / ~201KB gzip (Three.js + Vue + Pinia + router + game code)
- Map view: ~59KB min / ~16.5KB gzip (lazy loaded)

---

## Technical Architecture

### Stack
- **Engine:** Three.js
- **Framework:** Vue + Pinia (state) + Vue Router (scenes)
- **Physics:** Custom — Schwarzschild (solar system), Newtonian F=ma (lander + on-foot)
- **Language:** TypeScript
- **Build:** Vite
- **IDE:** Cursor with 3 AI agents
- **Assets:** 2 GLBs + procedural everything else

### Shared Systems

**ThrusterSystem** (`src/lib/thrusterSystem.ts`)
Generic, parameterized over thruster names. Used by both shuttle and lander with different configs. Handles charge/discharge, fuel consumption, recharge mechanics, and depletion callbacks.

```typescript
// Shuttle: 3 thrusters
ThrusterSystemConfig<'thrust' | 'brake' | 'rcs'>

// Lander: 17 thrusters  
ThrusterSystemConfig<'main' | 'RCS_FL_Aft' | 'RCS_FL_Down' | 'RCS_FL_Fore' | 'RCS_FL_Up' | ... >
```

**GravitySource Interface**
Shared between shuttle scene and map. Schwarzschild radius as unit. Sun = 1 solar mass, planets = fractions.

**Inventory System** (`src/lib/inventory/`)
Shared state for resources, fuel, supplies. Persists across all layers.

**Mission System** (`src/lib/missions/`)
Mission templates with three objective types. Integrates with asteroid catalog for target selection and waypoint generation.

**Player Profile** (`src/lib/player/`)
Player state, progression, earnings.

**Portal System** (`src/lib/portal.ts`)
Vibeverse integration. Arrival detection, departure, return-to-origin.

### Agent Architecture

**Agent 1: Systems Designer**
Portal, asteroid catalog, mission templates, player profile, inventory, shop.

**Agent 2: Sandbox Designer**  
Shuttle flight, SpaceTimeGrid, gravity wells, slingshots, lander flight, cargo bay, thruster system.

**Agent 3: Map Designer**
Keplerian orbits, solar system catalog, procedural planet shaders, mesh factories, bloom/tone mapping, camera.

**Agent 4 (new): Mission Designer**
First-person on-foot gameplay, multi-tool, enemy AI, NPC rescue, O2 system, mission objective logic.

### Scene Architecture

```
App (Vue Router)
│
├── /hub — Ship Hub
│   ├── MissionBoard
│   ├── Inventory UI
│   ├── Shop UI
│   └── Cat
│
├── /map — Solar System Navigation
│   ├── Three.js Scene
│   │   ├── Sun (plasma shader + corona)
│   │   ├── PlanetSystem[] (Keplerian, procedural shaders)
│   │   ├── AsteroidBelt[] (instanced)
│   │   ├── SpaceTimeGrid (Schwarzschild deformation)
│   │   ├── ShuttleModel (GLB)
│   │   ├── Vibeverse Portals (entry/exit)
│   │   └── Starfield + Bloom + ACES
│   └── Damped orbital camera
│
├── /mission — Lander Flight (3rd person)
│   ├── Three.js Scene
│   │   ├── AsteroidMesh (procedural terrain)
│   │   ├── LanderModel (GLB, 17 thruster nodes)
│   │   ├── ThrusterParticles (per-node emission)
│   │   ├── Headlamp (SpotLight)
│   │   ├── Objective markers
│   │   ├── Enemies (if exterminate/rescue)
│   │   ├── NPCs (if rescue)
│   │   ├── DirectionalLight (sun)
│   │   └── Skybox
│   └── 3rd person follow camera
│
├── /eva — First Person On-Foot
│   ├── Three.js Scene (same asteroid scene, camera change)
│   │   ├── MultiTool (FPS fixture, low-poly)
│   │   ├── Crosshair overlay
│   │   ├── Lander (visible in world, parked)
│   │   ├── Resource deposits (gather)
│   │   ├── Bug enemies (exterminate)
│   │   ├── NPCs (rescue)
│   │   └── Shared lighting/skybox
│   └── FPS camera (pointer lock)
│
└── Shared State (Pinia)
    ├── ThrusterSystem (shuttle instance)
    ├── ThrusterSystem (lander instance)
    ├── Inventory
    ├── Player profile
    ├── Mission state
    ├── O2 system
    └── Portal params
```

### First Person Implementation Notes

The EVA scene is NOT a separate Three.js scene — it's the same mission scene with a camera swap. When the player presses F to exit the lander:

1. Disable lander controls
2. Spawn player entity at lander door position
3. Switch to FPS camera with pointer lock
4. Attach multi-tool model to camera
5. Enable on-foot movement (micro-gravity)
6. Start O2 timer
7. Show FPS HUD (crosshair, O2 bar, multi-tool mode, objectives)

When re-entering:
1. Fade/transition
2. Disable FPS controls, release pointer lock
3. Switch back to 3rd person lander camera
4. Transfer gathered resources to lander inventory
5. Add rescued NPC mass to lander
6. Replenish O2
7. Re-enable lander controls

---

## HUD Design

### Layer 2: Shuttle HUD
- **Top left:** FUEL bar (green → red)
- **Top right:** Coordinates (X, Z)
- **Bottom left:** SPD (speed), HDG (heading)
- **Bottom right:** Thruster bars — THR, BRK, RCS (vertical bars showing charge)

### Layer 3: Lander HUD
- **Top left:** FUEL bar + ALT (altitude above terrain)
- **Top right:** Coordinates, mission objective markers with distance
- **Bottom left:** VEL (velocity vector magnitude)
- **Bottom right:** Thruster bars — MAIN + 16 RCS (grouped by quad, simplified display)
- **Center bottom:** "GROUNDED — EXIT (F)" prompt when landed
- **Grapple indicator:** Tether line + anchor point when grapple active

### Layer 4: First Person HUD
- **Top left:** O2 bar (blue → red, ticking down)
- **Center:** Crosshair
- **Bottom right:** Multi-tool mode indicator (DRILL / WEAPON / HEAL) with icon
- **Objective markers:** Floating 3D markers visible through terrain (direction + distance)
- **Bottom left:** Resources collected (gather) / Nests remaining (exterminate) / NPCs stabilized (rescue)
- **Lander marker:** Always visible, shows direction and distance back to lander

---

## Audio Direction

### Ambient
- **Space silence** — the default state. The void is quiet.
- **Engine hum** — low drone when shuttle/lander thrusters idle. Pitch shifts with thrust intensity.
- **Suit breathing** — on foot, you hear your own breathing. Faster as O2 gets low.

### Feedback
- **Thruster bursts** — punchy, satisfying. Primary player feedback for thrust inputs. Different pitch/character for main engine vs RCS puffs.
- **Landing contact** — deep thud transmitted through hull. The first physical sound after minutes of silence.
- **Multi-tool modes** — drill has a grinding/laser whine, weapon has rapid pulse shots, heal has a warm resonant hum.
- **Bug sounds** — chittering (crawlers), wet hissing (spitters), pulsing heartbeat (nest cores). Alien and unsettling.

### Music
- **Ship hub** — lo-fi radio station, warm and cozy
- **Solar system navigation** — minimal ambient drone, vast and empty
- **Lander flight** — sparse, tension builds on approach
- **On foot** — silence with incidental sounds. Music only during combat (low, urgent) or discovery moments

### Radio
- **Mission briefings** — crackling comms, slightly degraded audio quality
- **Colony chatter** — ambient world-building between missions
- **Distress signals** — rescue missions start with desperate transmissions

---

## Progression

### Economy
- Gather missions pay in resources (sell at shop) and credits
- Exterminate missions pay hazard rates in credits
- Rescue missions pay per NPC rescued
- Credits buy: fuel refills, lander repairs, multi-tool upgrades, O2 canisters, grapple upgrades

### Difficulty Curve
- **Early missions:** Asteroid belt, close to sun, short slingshot chains. Low-gravity asteroids, few bugs, generous fuel margins.
- **Mid missions:** Further out, longer navigation. Medium gravity asteroids, harder terrain, denser infestations.
- **Late/Endgame:** Kuiper belt. Requires multiple slingshots to reach. High-value contracts. Extreme terrain, heavy infestations, tight fuel margins.

### Upgrades (keep minimal)
- **Fuel tank capacity** — bigger reservoir
- **Thruster efficiency** — better burn rates
- **O2 capacity** — longer EVAs
- **Multi-tool power** — faster drilling, more damage, faster healing
- **Grapple range** — longer tether
- No skill trees. No RPG mechanics. You get better because *you* get better at flying and managing resources.

---

## Build Status (as of April 4, 2026 — Day 2)

### Completed ✅
- Portal system (`src/lib/portal.ts`)
- Asteroid catalog (`src/lib/asteroids/`)
- Mission templates with 3 objective types (`src/lib/missions/`)
- Player profile (`src/lib/player/`)
- Inventory system (`src/lib/inventory/`)
- ThrusterSystem — generic, used by shuttle and lander
- Shuttle: 2D grid movement, 3-thruster system, SpaceTimeGrid with gravity
- Shuttle: gravity pull to barycenter, event horizon capture, slingshot mechanic
- Shuttle: cargo bay doors (F key)
- Solar system: Keplerian orbits (6 pure math functions)
- Solar system: full catalog (10 planets, 30+ moons, 2 belts)
- Solar system: 5 GLSL shaders for celestial bodies
- Solar system: 5 mesh factories, bloom, ACES tone mapping
- Solar system: damped orbital camera, gravity integration
- Lander: GLB optimized (43MB → 1MB via gltf-transform pipeline)
- Lander: mesh hierarchy rigged in Blender (17 thruster nodes, door, legs, antenna)
- Lander: full 3D flight with WASD tilt, Space thrust, L-Shift boost, C descent
- Lander: thruster particle system (per-node emission)
- Lander: terrain grid (brown, heightmap-based, procedural)
- Lander: ALT/VEL/position HUD

### In Progress 🔄
- Shop system
- Procedural asteroid mesh generation (terrain grid → full 3D asteroid)

### Remaining ⬜
- Lander: grappling hook
- Lander: landing detection and grounded state
- Lander → EVA transition (F to exit)
- First person: FPS camera + pointer lock
- First person: multi-tool model and modes
- First person: micro-gravity on-foot movement
- First person: O2 system
- Gather: resource deposits, drill interaction
- Exterminate: bug AI (crawlers, spitters, nest cores)
- Exterminate: weapon mode combat
- Rescue: NPC placement, heal interaction, follow AI, mass system
- Mission waypoints on solar system map
- Ship hub UI (connect existing systems to visual interface)
- Full game loop integration (hub → map → lander → EVA → lander → map → hub)
- Audio implementation
- Visual polish (particles, lighting, shaders)
- UI polish (all HUD layers)
- Portal visual integration (Levelsio gist → game world)
- Difficulty progression
- Deploy to production domain

---

## Remaining Schedule (~27 days)

### Phase 1: Lander Completion (Days 3-7)
- Landing detection, grounded state, "EXIT (F)" prompt
- Grappling hook (fire, anchor, swing, release)
- Procedural asteroid mesh (terrain grid → visual asteroid)
- Camera refinement (3rd person follow, smooth tracking)
- **Milestone:** Complete lander flight loop — deploy from shuttle, fly to asteroid, land, grapple around terrain.

### Phase 2: First Person Core (Days 8-14)
- FPS camera swap on exit
- Multi-tool model (low-poly fixture)
- Micro-gravity on-foot movement
- O2 system with timer and lander replenishment
- Drill mode: resource deposits, extraction interaction
- Lander re-entry transition
- **Milestone:** Complete gather mission — land, exit, drill resources, return to lander.

### Phase 3: Combat & Rescue (Days 15-20)
- Bug AI: crawlers (swarm pathfinding), spitters (ranged), nest cores (spawners)
- Weapon mode: shooting, hit detection, bug destruction
- NPC system: placement, heal interaction, follow AI, lander mass
- Heal mode: stabilization beam, NPC escort
- **Milestone:** All three mission types playable end-to-end.

### Phase 4: Integration & Polish (Days 21-27)
- Ship hub UI (mission board, inventory, shop — wire up existing systems)
- Full game loop: hub → map → slingshot → arrive → lander → EVA → complete → exfil → hub
- Mission waypoints on map
- Audio (engine, thrusters, breathing, multi-tool, bugs, radio, music)
- Visual polish (particles, lighting, shader refinements)
- HUD polish across all four layers
- Portal visual integration and testing
- Difficulty progression and balance
- Performance optimization
- Deploy to domain
- **Milestone:** Ship it. May 1 @ 13:37 UTC.

### Scope Cuts (if time gets tight)
1. **First cut:** Drop rescue missions. Keep gather + exterminate. Two mission types is still a full game.
2. **Second cut:** Drop combat/exterminate. Gather-only with full navigation + lander + EVA. A space mining sim.
3. **Third cut:** Drop EVA. Lander-only missions (land near deposits, drill from the lander). Still has navigation + lander flight.
4. **Fourth cut:** Drop mission objectives. Navigation + lander flight as a sandbox/exploration toy. The slingshot + lander feel is enough.
5. **Nuclear:** Solar system navigation only. Gravity slingshot sandbox. Still unique in the jam.

---

## References

- **The Long Journey Home** (Daedalic, 2017) — lander mechanics, resource gathering, the "calculated landing" feel
- **Lunar Lander** (Atari, 1979) — thrust-vs-gravity, the original
- **Overwatch: Hammond** — mech-with-gun energy for exterminate combat
- **Alien** (1979) — blue collar space workers, corporate neglect, bug infestation aesthetic
- **Miami Vice** (Michael Mann, 2006) — vibe filmmaking, atmosphere over exposition
- **Firewatch** (Campo Santo, 2016) — isolation, phenomenological game design
- **FTL** (Subset Games, 2012) — ship hub, mission structure, resource pressure
- **Kerbal Space Program** — gravity slingshot satisfaction, physics honesty, calculated burns
- **Subnautica** — multi-tool design, resource loop, vehicle-to-on-foot transition
- **Dead Space** — on-foot zero-G combat, tension from limited resources

---

## Open Questions

- **Cat name?** The cat needs a name. This is blocking.
- **Narrative endgame:** Is there a final mission? A mystery in the Kuiper belt? Something the mining companies don't want found? Or is the mundanity the point?
- **Multiplayer:** Jam prefers it. Lightweight social (shared mission board, leaderboard) vs actual co-op (two players on one asteroid). Scope implications are massive.
- **On-foot combat feel:** Micro-gravity FPS is inherently floaty and disorienting. Is that a feature (unique, memorable) or a problem (frustrating)? Needs playtesting.
- **Lander-to-EVA performance:** Same scene, camera swap. Are enemies/NPCs loaded during lander flight or spawned on EVA entry? Performance implications.
- **Multi-tool energy:** Does the multi-tool have its own energy/ammo system, or is it unlimited? If limited, what recharges it?
- **Death/failure:** What happens when you die on foot (O2 depleted, killed by bugs)? Respawn at lander? Mission failed? Permadeath?
- **Grappling hook physics:** Simple distance constraint, or spring-damper for bouncier feel? Needs prototyping.

---

*"The machine works. It's paid off. That's all that matters."*
