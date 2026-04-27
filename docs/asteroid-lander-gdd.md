# ASTEROID LANDER — Game Design Document
**Version 0.1 — April 2026**
**Cursor AI Game Jam — 1 Month Timeline**

---

## High Concept

A 2.5D physics-driven lander game where you play as an autonomous space trucker piloting a refurbished NASA-era lunar lander, taking contracts to gather resources, exterminate bug infestations, and rescue stranded colonists on asteroids scattered across a post-boom solar system.

**One-sentence pitch:** Lunar Lander meets Firewatch meets Starship Troopers — blue-collar space work on a budget.

---

## Lore & Setting

### The World

It's the 2300s. About 200 years ago, the discovery of neutron thrusters democratized space travel. Suddenly, getting off-world wasn't just for governments and megacorps — it was for everyone. A massive space rush followed. Companies mass-produced landers, rovers, habitats, and mining rigs. Asteroid mining colonies popped up across the belt. For a brief, golden era, space was the new frontier.

It started on Phobos. A geological survey team drilling into the Martian moon found something that shouldn't have existed: a crystalline lattice structure that, when energized, produced thrust at relativistic scales. The neutron thruster. Suddenly, interplanetary travel wasn't measured in months — it was measured in days.

But Phobos wasn't empty. The drilling woke something. Silicate creatures — ancient, from interstellar space, territorial and lethal. Humanity calls them Viroids. They'd been slumbering in the regolith for millennia, and they didn't appreciate the company.

The neutron thruster fit remarkably well with 21st-century space tech. NASA-era lander designs, mothballed for two centuries, turned out to be the perfect chassis. Jupiter became the industrial heart of the expansion — its moons supplied raw materials, and a cloud city above the surface housed 3D-printing assembly lines that churned out ships by the thousands. Humanity spread fast.

Then the bubble collapsed.

The companies folded. The infrastructure crumbled. The colonies were abandoned — or worse, left half-operational with skeleton crews. Humanity is now scattered across space in a loose, unglamorous diaspora. No federation, no empire. Just people making do with aging equipment and shrinking margins.

### The Player

You are an independent contractor — a trucker, essentially. You own a refurbished lander from the third space race era, held together with aftermarket parts and stubbornness. The lander is paid off. That's all that matters.

You take jobs from a mission board: mining companies that need resources extracted, colony administrators dealing with infestations, distress signals from workers trapped in overrun sites. You fly in, do the work, fly out, get paid. You have a cat.

Earth-born, Moon-raised. You spent decades running lander ops for belt mining outfits before the work dried up. Something happened after you retired — something you don't talk about. You bought a ship to live in. You don't live on planets anymore.

### The Lander

A NASA-era lunar lander model (sourced from actual NASA 3D assets), retrofitted with neutron thrusters and modular hardpoints. It looks like what it is: a 200-year-old machine that still works because someone who cares about it keeps it running.

The lander is the player's only tool, vehicle, and weapon. It doesn't transform or upgrade into something unrecognizable — it stays fundamentally the same beat-up machine throughout the game.

---

## Core Gameplay

### Perspective & Rendering

- **2.5D side-view** — all gameplay runs on a 2D physics plane
- **Three.js rendered** — 3D models, lighting, particles, shaders
- Camera locked to side plane, lander and asteroids are 3D meshes
- Asteroids rotate slowly, casting dynamic shadows
- Parallax starfield and nebula skybox for depth

### Physics Model

**Newtonian mechanics in micro-gravity.**

- No atmosphere, no drag, no significant gravity well
- Asteroids have very slight gravitational pull — enough that an idle lander will slowly drift toward the surface rather than float away, but not enough to feel like "falling"
- Thrust applies force in the direction the nozzle points — the player must manage momentum manually
- No auto-stabilization. Every thrust changes velocity; every velocity persists until countered
- Rotation is separate from translation — the player can spin the lander without changing trajectory
- Fuel is finite per mission. Wasteful flying = not enough fuel to return
- Collision damage is velocity-dependent. Gentle contact = landing. Fast contact = hull damage

**Controls (keyboard):**
- `A/D` or `Left/Right` — rotate lander
- `W` or `Up` — main thruster (direction lander is pointing)
- `Space` — context action (drill / fire / interact)
- `Shift` — boost (burns more fuel)

### The Feel

The lander should feel **heavy but responsive**. Not twitchy, not sluggish. The player should feel the mass of the machine — it doesn't stop on a dime, it doesn't turn instantly. But inputs are never ignored. The skill expression is in reading momentum and planning thrust sequences ahead of time.

The game is not punishing for the sake of difficulty. It's honest. Physics is physics. You learn to work with it, not fight it. Mastery feels like becoming a pilot, not like memorizing patterns.

---

## Mission Types

### 1. GATHER

**Objective:** Collect resource deposits from the asteroid surface and return to orbit.

**Gameplay:** The most meditative mission type. Fly to marked deposits, land near them, activate drill, wait for extraction, fly to next deposit. The challenge is efficient routing — minimizing fuel use while hitting all deposits.

**Resources:** Minerals, metals, rare gases trapped in rock. These feed into the ship economy (fuel, repairs, trade).

**Mood:** Calm. Methodical. The space trucker's bread and butter.

### 2. EXTERMINATE

**Objective:** Clear bug colonies infesting the asteroid before mining operations can resume.

**Gameplay:** The lander swaps drill for a mounted minigun (think Hammond from Overwatch — a small mech with a big gun). Bug nests are scattered across the asteroid surface in craters and crevices. The player flies between nests, engaging swarms.

**Combat twist:** In micro-gravity, firing the gun produces recoil. Newton's third law means sustained fire pushes the lander backward. The player must counter-thrust while shooting, creating a dynamic dance of aim + movement. Bugs can latch onto the lander, adding drag and weight.

**Enemy types (keep minimal for jam scope):**
- **Crawlers** — skitter across the surface, swarm the lander
- **Spitters** — ranged attackers, shoot acid from fixed positions
- **Nest cores** — stationary, must be destroyed to clear an area, spawn crawlers

**Mood:** Tense. Chaotic. The mic-gravity combat makes everything feel unmoored and slightly panicky.

### 3. RESCUE

**Objective:** Extract colonists trapped in alien cocoons and return them safely to orbit.

**Gameplay:** Combines elements of both other modes. Navigate to cocoon sites (often in tight, dangerous terrain), clear any bugs guarding them, extract the colonist. Each rescued colonist adds mass to the lander, progressively changing flight characteristics. A full lander is sluggish and harder to control on the way back.

**Tension mechanic:** Colonists have a health/oxygen timer. The player must balance speed (rescuing quickly) with safety (not crashing with passengers aboard). Rough landings injure rescued colonists.

**Mood:** Urgent. Claustrophobic. The responsibility of carrying lives changes how you fly.

---

## Game Structure

### Mission Flow

```
SHIP HUB → MISSION SELECT → APPROACH → LANDER GAMEPLAY → EXTRACTION → SHIP HUB
```

1. **Ship Hub** — the player's home base between missions
2. **Mission Select** — choose from available contracts on the board
3. **Approach** — brief cinematic/interactive moment: the asteroid appears, you see it from distance, begin descent
4. **Lander Gameplay** — the core game (2.5D physics gameplay)
5. **Extraction** — return to orbit, mission summary, payout
6. **Back to Ship Hub** — spend earnings, repair, prepare for next job

### Ship Hub

The ship interior. A cozy, lived-in space — the trucker's cab. This is the player's apartment.

**Elements:**
- **Mission board** — incoming contracts with descriptions, pay, difficulty rating
- **Workbench** — repair lander, manage fuel, install upgrades
- **Cargo/trade** — sell gathered resources, buy supplies
- **The cat** — wanders the screen, sits on things, exists
- **Radio** — ambient world-building: news broadcasts, colony chatter, music
- **Window** — stars drifting past, the void

**Design note:** The hub can be as simple as a stylized 2D screen with interactive elements. It doesn't need to be a full 3D environment. If time is tight, a well-designed menu with personality (the cat, the radio, good typography) is better than a rushed 3D interior.

### Progression

Keep it simple for jam scope:

- Missions get harder (stronger gravity asteroids, more bugs, tighter fuel margins)
- Earnings allow lander upgrades (better thrusters, larger fuel tank, stronger hull, better drill/gun)
- Upgrades are meaningful but don't transform the game — you're still in the same lander
- No skill trees, no crafting systems, no RPG mechanics. You get better because *you* get better at flying.

---

## Visual Direction

### Aesthetic

- **Lighting:** High contrast. Harsh directional light (the sun) casting long, sharp shadows on asteroid surfaces. The dark side is *dark*. The lander's headlamps cut through it.
- **Color:** Mostly desaturated — grey rock, black sky, white light. Accent colors come from: thruster flames (orange/blue), resource deposits (green/amber glow), bug bio-luminescence (sickly yellow-green), the lander's running lights.
- **Particles:** Thruster exhaust, dust kicked up on landing, debris from drilling, bug splatter. Particles sell the physics.
- **Skybox:** Deep space. Not busy — a few distant nebulae, dense star field, maybe a distant planet or the sun as a bright point. The emptiness is the point.

### Audio Direction

Audio is half the vibe.

- **Engine hum** — constant low drone when thrusters are idle. Changes pitch with thrust.
- **Thruster bursts** — punchy, satisfying. The main feedback for player input.
- **Silence** — the default state. Space is quiet. Long stretches of just the hum.
- **Radio crackle** — mission briefings, colony comms, distress calls. Slightly degraded audio quality.
- **Bug sounds** — chittering, skittering, hissing. Alien and unsettling.
- **Music** — minimal. Ambient drone during gather missions. Tension builds during combat. The ship hub has a lo-fi radio station.
- **Landing contact** — a deep, satisfying thud transmitted through the hull. The first physical sound after minutes of near-silence.

---

## Technical Architecture

### Stack

- **Engine:** Three.js
- **Physics:** Custom 2D physics (simple enough to not need a library — it's just F=ma, collision detection, and angular momentum)
- **Language:** JavaScript/TypeScript
- **Build:** Whatever Cursor defaults to (Vite likely)
- **Assets:** NASA lander model + procedural asteroid generation + minimal hand-made assets

### Scene Graph

```
Scene
├── Skybox (CubeTexture or shader-based starfield)
├── AsteroidGroup
│   ├── AsteroidMesh (procedural geometry)
│   ├── ResourceDeposits[] (glowing markers)
│   ├── BugNests[] (exterminate missions)
│   └── Cocoons[] (rescue missions)
├── LanderGroup
│   ├── LanderModel (NASA .glb)
│   ├── ThrusterParticles (point sprites / instanced meshes)
│   ├── Headlamp (SpotLight)
│   └── MountedWeapon (exterminate missions)
├── Camera (orthographic or tight perspective, follows lander)
├── DirectionalLight (sun)
└── UI (HTML overlay or Three.js sprites)
```

### Procedural Asteroid Generation

For the 2.5D view, the asteroid terrain is essentially a **2D heightmap / surface profile** rendered as a 3D mesh:

1. Generate a base radius with Perlin noise displacement
2. Add crater features (circular depressions at random points)
3. Add sharp ridges and overhangs for gameplay variety
4. Map resource deposit locations to accessible flat areas
5. The 3D mesh wraps this profile into a visible asteroid shape for background rendering

### Physics Implementation (pseudocode)

```
each frame:
  // Gravity (very weak, toward asteroid center)
  gravityForce = direction_to_asteroid_center * MICRO_GRAVITY_CONSTANT

  // Player input
  if (thrustKey):
    thrustForce = lander.forward * THRUST_POWER
    fuel -= FUEL_RATE * dt

  if (rotateLeft): angularVelocity -= ROTATION_SPEED * dt
  if (rotateRight): angularVelocity += ROTATION_SPEED * dt

  // Integration
  acceleration = (gravityForce + thrustForce + recoilForce) / lander.mass
  velocity += acceleration * dt
  position += velocity * dt
  angle += angularVelocity * dt

  // Collision with terrain
  if (intersects_terrain):
    impactSpeed = velocity.magnitude
    if impactSpeed > CRASH_THRESHOLD:
      damage(impactSpeed)
    else:
      land() // successful landing
      velocity = 0
```

---

## Scope Management — 4-Week Plan

### Week 1: The Feel
- Lander physics: thrust, rotation, momentum, fuel
- Asteroid terrain generation (2D profile → 3D mesh)
- Camera system following lander
- Basic collision detection
- Placeholder visuals (simple shapes)
- **Milestone:** You can fly the lander and land on an asteroid. It feels good.

### Week 2: Gather Missions
- Resource deposit placement on terrain
- Drilling mechanic (land near deposit → hold action → collect)
- Fuel economy and return-to-orbit condition
- NASA lander model integrated
- Basic lighting and skybox
- **Milestone:** Complete gather loop — fly down, collect resources, fly back.

### Week 3: Combat & Rescue
- Minigun weapon with recoil physics
- Bug AI (crawlers move toward lander, spitters shoot)
- Bug nest spawning and destruction
- Rescue cocoon interaction
- Mass/weight system for rescued colonists
- **Milestone:** All three mission types playable.

### Week 4: Hub & Polish
- Ship hub screen (mission board, repairs, the cat)
- Mission generation and difficulty progression
- Audio implementation (engine sounds, thrusters, ambience)
- Visual polish (particles, shaders, lighting)
- UI (fuel gauge, health, mission objectives)
- **Milestone:** Playable game loop from hub to mission and back. Ship it.

### Scope Cuts (if time is tight)
1. **First cut:** Ship hub becomes a styled menu screen (still has the cat)
2. **Second cut:** Drop rescue missions, keep gather + exterminate
3. **Third cut:** Drop progression/upgrades, make it a score-attack arcade mode
4. **Nuclear option:** Lander physics + gather only. If this feels good, it's still a game.

---

## References

- **The Long Journey Home** (Daedalic, 2017) — lander mechanics, resource gathering, planetary variety
- **Lunar Lander** (Atari, 1979) — the original thrust-vs-gravity game
- **Firewatch** (Campo Santo, 2016) — vibe, isolation, phenomenological game design
- **FTL: Faster Than Light** (Subset Games, 2012) — ship hub design, mission structure, roguelike progression
- **Overwatch: Hammond/Wrecking Ball** — the mech-with-a-gun-in-a-ball fantasy for exterminate missions
- **Alien** (Ridley Scott, 1979) — blue collar space workers, corporate neglect, bug infestation aesthetic
- **Miami Vice** (Michael Mann, 2006) — vibe filmmaking, atmosphere over exposition

---

## Open Questions

- **Lander upgrades:** How many? What do they change? Keep minimal.
- **Narrative:** Is there an arc beyond "do jobs, make money"? A mystery? A final mission? Or is the mundanity the point?
- **Multiplayer:** Out of scope for jam, but the concept supports co-op naturally (two landers on one asteroid)
- **Asteroid variety:** How different do asteroids look/feel from each other? Procedural params (size, gravity, terrain roughness) or hand-authored biomes?
- **The cat:** Does the cat have a name? Does the cat affect gameplay? The cat is important.

---

*"The machine works. It's paid off. That's all that matters."*
