GRAVITY SURFING SYSTEM — UNLOCK QUEST + MECHANIC SPEC
Revision 2 — Space Jockey

# ========================================

⚠ IMPORTANT NOTE

The "Shuttle Handoff" and "First Flight Notes" message texts will need to
be redesigned around this new system. The Space Fabric toggle is no longer
available from the start — it is gated behind the gravitySurfing upgrade,
which is only acquired via the Consortium Certification quest. Any early-game
messaging that references the space fabric display, grid lines, or related
HUD elements must be revised to reflect that these features are not yet
accessible to a new player.

# ========================================

PART 1: UNLOCK QUEST

TRIGGER:

- Player reaches upgrade level average that qualifies for difficulty 3 missions
- On next visit to habitat terminal (MAIL tab), new message appears:

MESSAGE:
  from: "Space Consortium — Logistics Division"
  subject: "Requisition Package — Field Operator Certification"
  body:
    "Operator,

```
Your recent activity logs were flagged by an associate of ours
(J. Mercer, independent contractor license 4471-R) as evidence
of sustained deep-field work using a Class-C orbital frame.

The Consortium does not typically certify retrofitted hardware
for relativistic grid coupling. However, your completion rate
on difficulty-2 contracts suggests the hull is holding and the
operator knows what the gauges mean.

We have staged a certification package at the following coordinates.
Retrieve it, secure it aboard your shuttle, and install the
coupler package from inventory once the hull is clear.

Contents are export-controlled. Do not open in the field. Do not
let the package drift. If the hull is lost the package is lost
and this offer does not repeat.

— Consortium Logistics, Sol Sector"
```

MISSION: "CONSORTIUM CERTIFICATION"
  type: collect
  difficulty: special (unrated)
  location: specific asteroid in the belt (fixed coordinates, not random)

MISSION FLOW:

1. Player flies to waypoint in the asteroid belt
2. Arrives at a small asteroid — not a combat zone, no enemies
3. Level loads: flat terrain, single objective marker
4. Land, exit lander
5. Walk to objective: a sealed cargo container (procedural geometry —

BoxGeometry with Consortium branding, emissive cyan trim, locked indicator)
6. "[E] COLLECT CONSORTIUM PACKAGE"
7. Item added to shuttle inventory: "Grid Coupling Module" (special item,
cannot be sold, cannot be dropped)
8. Mission objective updates: "Return to shuttle and install Grid Coupling Module"
9. Player must exfil and return to shuttle safely
10. Player installs the module from shuttle inventory
11. Installation triggers:

REWARDS (all applied immediately):

- gravitySurfing upgrade unlocked (permanent)
→ this also unlocks the Space Fabric toggle in the HUD for the first time
- Heat Shield Level 1 (if not already owned — worth 5,000 CR)
- Cryo Insulation Level 1 (if not already owned — worth 5,000 CR)
- 2,000 CR bonus
- Jay message triggered (see below)

POST-INSTALL JAY MESSAGE:
  from: "Jay Mercer"
  subject: "You Got The Grid License"
  body:
    "Hey, you got Jay.

```
So the Consortium actually signed off on your hull. I put your
name in months ago and figured they would laugh at the application.
A Class-C shuttle running field contracts — most of those
certification officers have not seen one outside a museum.

The grid coupler they sent you is milspec. It lets you lock onto
the spacetime fabric lines your nav system already projects — but
your nav system could not project them before the coupler was
installed. You have been flying blind this whole time.

Enable the Space Fabric display in your HUD. Then press Q near
a grid line to couple. WASD to pick your rail. Q again to
decouple — fast stop, wherever you are. It drinks nothing.
The grid does the work.

The heat and cryo kits are their way of saying do not immediately
die trying to reach Saturn. You are welcome.

Do not make me regret the referral."
```

# ========================================

PART 2: GRAVITY SURFING MECHANIC

OVERVIEW:
An advanced traversal system that lets the player snap to SpaceTimeGrid
lines and travel along them at high speed with zero fuel cost. Unlocked
via the Consortium Certification quest (awards the gravitySurfing upgrade).
The gravitySurfing upgrade is the gate for both the Space Fabric HUD toggle
and the surfing mechanic itself. Toggled with Q key while Space Fabric is on.

PREREQUISITES:

1. gravitySurfing upgrade must be active
2. Space Fabric HUD toggle must be ON
  Both conditions must be true. If either is false, Q does nothing.

SPACE FABRIC TOGGLE:

- Controlled by the player via HUD toggle (same as always, now accessible)
- When OFF: grid lines are hidden. Surfing cannot be initiated. If the player
was surfing and turns the toggle OFF, surfing immediately decouples.
- When ON: grid lines are visible. Surfing can be initiated if near a line.
- The toggle has no effect on a player who does not have the gravitySurfing
upgrade — it does not appear in the HUD until the upgrade is active.

ACTIVATION:

- Q key pressed while:
a. gravitySurfing upgrade is active
b. Space Fabric toggle is ON
c. Shuttle is within snapping distance of a grid line (~0.5 grid cells)
- If any condition is not met: Q does nothing (no feedback needed, or a
subtle "NO GRID LINE IN RANGE" if the upgrade is active but no line is close)

COUPLING STATE:
When coupled to a grid line:

- Shuttle snaps to the nearest grid line (position interpolated smoothly
over 0.2s, not instant)
- Shuttle aligns to the line direction (rotation lerps to face along the line)
- Shuttle is now "on rails" — locked to this grid line
- Visual feedback: grid line under the shuttle glows brighter (cyan/white),
pulsing energy traveling along the line in the shuttle's direction
- Camera pulls back slightly to show more of the grid (speed feeling)

MOVEMENT WHILE SURFING:

- W: accelerate along the grid line (forward relative to current facing)
- S: decelerate / accelerate in reverse direction
- A/D: at grid intersections (where two lines cross), steer onto the
crossing line. A = turn left at next intersection, D = turn right.
If no intersection is nearby, A/D does nothing.
- Speed: starts at 0 on coupling. W accelerates to max surf speed
(~3x top thruster speed). Acceleration is smooth, not instant.
- Deceleration: S slows down. Shuttle can sit stationary on a line.

INTERSECTION HANDLING:

- When approaching a grid intersection, a brief UI indicator shows
available directions: forward (W), left (A), right (D), reverse (S)
- No input at an intersection: shuttle continues straight through
- A or D near intersection: shuttle smoothly curves onto the perpendicular
line (arc transition over 0.3s, not a hard snap)
- Intersections near gravity wells: grid lines are CURVED by gravity.
Surfing near a planet means riding a curved rail automatically.
If the curve bends into the gravity well's event horizon, coupling
BREAKS and the shuttle is ejected at current velocity into the well.
Warning: "GRAVITATIONAL INTERFERENCE — GRID COUPLING LOST"

DECOUPLING:

- Q pressed while surfing: shuttle decouples from the grid
- Shuttle rapidly decelerates to zero velocity (sub-0.5 seconds)
- On reaching zero: a gravity wave spawns at the decouple point,
propagating outward. See DECOUPLE WAVE below.
- Position: wherever the shuttle was on the line at the Q press
- Visual: brief energy discharge effect on the grid line, ripple outward
- Shuttle returns to normal flight mode immediately. All thrusters available.
- No fuel cost for the stop. The grid absorbs kinetic energy.
- Toggling Space Fabric OFF while surfing triggers the same decouple
sequence — fast deceleration, wave spawn, return to normal flight.

DECOUPLE WAVE:
  Spawns at the exact point the shuttle reaches zero velocity after decoupling.

- Type: standard SpaceTimeGrid gravity wave (same system as gravitational events)
- Size: fixed ~ship width (not speed-scaled — keep it visually consistent
and easy to tune)
- Parameters: exposed as tunable values for visual QA
waveRadius:       initial radius at spawn (default: ship width)
waveAmplitude:    Y-displacement height of the wave
wavePropagation:  outward travel speed
waveDamping:      amplitude falloff over distance
waveLifetime:     how long before the wave fully dissipates
- Always spawns. Regardless of decoupling speed. Small decouple = small visual,
same geometry — just tune amplitude/damping lower if needed.
- The wave can interact with other objects/debris in range the same way
any gravity wave does (consistent with existing wave behavior).

FUEL COST:

- Coupling: free
- Surfing: free (the grid does the work)
- Decoupling: free
- While surfing you CANNOT slingshot, orbit planets, or interact with anything.
You are on rails. Decouple first.

INTERACTION WITH GRAVITY:

- Grid lines near planets/sun are curved due to gravity well deformation
- Surfing through curved space: shuttle follows the bent line automatically
- DANGER ZONES: if a grid line passes through a gravity well's event horizon
(the orange/red ring), coupling on that segment is not possible.
The line appears red/broken in that region.
- If the shuttle is surfing toward a danger zone: warning flashes at 3 seconds
out. Auto-decouple at the danger boundary with velocity PRESERVED (not the
fast-decel stop — you are ejected at surf speed into the well).
This prevents using grid surfing to safely enter gravity wells.

INTERACTION WITH GRAVITATIONAL EVENTS:

- Spacetime disturbance waves can temporarily disrupt grid lines
- If a wave passes through the line you are surfing: brief turbulence
(camera shake, speed fluctuation ±20%), coupling holds
- If the wave is strong enough (high mass anomaly): coupling breaks,
shuttle ejected at current velocity. "WAVE DISRUPTION — COUPLING LOST"

VISUAL EFFECTS:

- Coupled grid line glows cyan-white (brighter than normal grid)
- Energy pulse particles travel along the line in shuttle direction
- At high speed: motion blur / streaking on nearby grid lines (parallax)
- At intersections: brief flash as the shuttle passes through
- On decouple: energy ripple expanding outward from decouple point,
then the gravity wave propagating on the grid plane
- Camera: slightly wider FOV while surfing, slight motion blur at max speed

HUD WHILE SURFING:

- "GRID COUPLED" indicator (replaces normal flight indicators)
- Current surf speed
- Direction indicator (which way along the line)
- Intersection preview: upcoming intersection countdown (distance or time)
- "Q — DECOUPLE" reminder

WIRING NOTES:

- The gravitySurfing upgrade flag already exists in the upgrade system.
The quest install/completion beat simply awards it via the existing mechanism.
- The Space Fabric toggle visibility is gated on gravitySurfing being active.
No new toggle — same toggle, now accessible.
- Surfing mechanic reads gravitySurfing flag on Q press. If false, Q is
ignored. No new upgrade key needed.
- Decouple wave plugs into the existing gravity wave / gravitational event
system. Spawn point = shuttle world position at velocity-zero moment.
Parameters are tunable constants, not derived from speed.

PERFORMANCE NOTES:

- Surfing is position interpolation along a line segment at speed.
No physics simulation while coupled — the shuttle is on rails.
- The expensive part is the visual effects (line glow, particles).
Keep particle count reasonable.
- Grid intersection detection: check shuttle position against grid
cell boundaries each tick. Simple modulo math on grid spacing.
- Decouple wave: reuses existing wave system. No new simulation needed.

BALANCE NOTES:

- Grid surfing handles flat traversal efficiently. It cannot change
Y-axis position (grid plane only). Slingshots are still required
for gravity well navigation and altitude changes.
- Surf speed (~3x normal top thrust) should feel meaningful without
making the solar system feel small.
- The fast deceleration on decouple is the key balance lever. You
arrive fast but arrive at zero velocity. Fuel is still required
to enter orbit, approach asteroids, etc. Surfing gets you there,
it does not finish the job.
- Surfing near planets is risky due to grid curvature. Safe surfing
is in the flat void between bodies. Dangerous surfing is threading
the needle between Jupiter and Saturn's curved grid lines.

UPGRADE TIERS (future, not for initial release):
  Tier 0: Grid Coupling Module (quest reward) — basic surfing, 3x speed
  Tier 1: Enhanced Coupling (upgrade shop, 3,000 CR) — 4x speed,
          faster intersection turns
  Tier 2: Stabilized Coupling (6,000 CR) — resists wave disruption, 5x speed
  Tier 3: Military-Grade Coupler (12,000 CR) — max speed, can surf
          through mild gravity curves without ejection

# ========================================

PART 3: IMPLEMENTATION SHAPE

GOAL OF THIS SECTION:
Translate the fantasy spec above into a buildable first release that fits
the current codebase. This is the "what do we actually wire up first" layer.

CURRENT REPO ANCHORS:

- `gravitySurfing` already exists as a hidden upgrade in the upgrade system
- Space Fabric HUD gating already exists
- `MapViewController` already contains:
  - `hasGravitySurfingUnlock` integration
  - `applyInitialSpaceFabricVisibilityFromUpgrades()`
  - dev hooks for granting/revoking the upgrade
  - `installUpgradeFromConsumable()` and `onUpgradeInstalledAnnouncement`
- Asteroid mission difficulty plumbing already exists via
`computeMissionDifficulty()`

FIRST-RELEASE RULE:
Do not try to ship the full fantasy in one pass. Release in two layers:

LAYER A — QUEST + UPGRADE INSTALL:

- Add the unlock quest, package install, reward payout, and messaging
- Reuse existing upgrade-install announcement flow where possible
- Reuse existing asteroid mission framework where possible
- No actual surfing movement required in this layer
- Outcome: Space Fabric becomes a mid-game unlock, and the player receives
a clear promise/tutorial for the next feature

LAYER B — SURFING MECHANIC:

- Add coupling, rail motion, intersections, decouple stop, and wave spawn
- Build only after the unlock quest exists and the upgrade is granted by
game content instead of dev tooling

This split reduces risk. Layer A is mostly content/state plumbing.
Layer B is movement/camera/controls work and should be treated separately.

QUEST STATE MODEL:
Use an explicit lightweight quest state instead of inferring from inventory
or mail text alone.

Recommended states:

- `unavailable`
- `offered`
- `accepted`
- `packageCollected`
- `installed`
- `completed`

Required flags/data:

- `consortiumCertificationState`
- `consortiumPackageCollectedAt` (optional timestamp/debug aid)
- `consortiumPackageAsteroidId` or fixed waypoint id
- `consortiumInstallationRewardGranted` boolean safeguard

Rationale:

- Prevent duplicate rewards
- Prevent duplicate Jay follow-up mail
- Make save/load and UI copy deterministic
- Avoid brittle "do we still have the item?" logic

PACKAGE ITEM RULES:

- Item id: `gridCouplingModule`
- Inventory category: special mission item or equipment-style unique item
- Stack size: 1
- Sell/drop/jettison: disallowed
- Loss behavior:
  - If shuttle is destroyed while carrying it, package is lost
  - Quest state returns to `offered`
  - Consortium mail can re-issue the package waypoint after a short delay

This is the main place where the original "offer does not repeat" text is
too harsh for an actual game. First release should not permanently brick the
feature for a player because of one bad death. Keep the tone threatening, but
the implementation recoverable.

MISSION STRUCTURE RECOMMENDATION:
Treat "Consortium Certification" as a handcrafted special mission layered on
top of the asteroid mission system, not as a fully procedural mission.

Recommended shape:

- Fixed asteroid target
- Fixed objective chain
- No random giver roll
- No combat
- Manual accept/track/complete flow

Do not force this mission through the generic generator if that produces
unnatural abstractions. A one-off special-case mission is acceptable here.

MAIL / TERMINAL CONTENT CHANGES REQUIRED:
The note at the top of this doc is now a hard requirement, not a soft reminder.

Update or suppress any early-game content that currently assumes:

- the player can already toggle Space Fabric
- the player already understands grid lines
- the player has access to Q-based grid coupling

At minimum revise:

- Shuttle Handoff
- First Flight Notes
- any map/HUD onboarding copy that references Space Fabric directly

FIRST-TIME UNLOCK PRESENTATION:
When installation completes, present rewards in this order:

1. Credits reward
2. Heat Shield Level 1 install if needed
3. Cryo Insulation Level 1 install if needed
4. Gravity Surfing install announcement
5. Jay follow-up mail unlocks

Reasoning:

- It mirrors the existing auto-install flow for module rewards
- It gives Gravity Surfing the spotlight last
- It avoids the new feature reveal being buried under utility upgrades

Suggested install announcement metadata:

- headline: `UPGRADE INSTALLED`
- upgrade: `Gravity Surfing`
- tier: `1`
- meta: `Grid Coupling Module · Consortium Certified`

SPACE FABRIC DEFAULT AFTER UNLOCK:

- On the same session as module installation, force Space Fabric ON once
- On later loads, preserve current gated behavior:
  - if unlocked, map starts with fabric visible
  - if revoked in dev, hide it immediately

Reasoning:

- The player just got taught about the feature
- They should see the grid immediately without hunting for the toggle

INPUT / CONTROLS DECISION:
Keep `Q` as the coupling/decoupling input for now, but define exact priority:

Priority order on map view:

1. If surfing, `Q` decouples
2. Else if gravitySurfing is unlocked and Space Fabric is ON and snap target
  exists, `Q` couples
3. Else existing `Q` interactions keep priority if they are context-bound
4. Else no-op

This priority needs to be checked against any current `Q` binding in map view
before implementation to avoid hidden control conflicts.

SURFING STATE MACHINE:
Represent surfing as an explicit map-view locomotion mode.

Recommended states:

- `freeFlight`
- `coupling`
- `surfing`
- `decoupling`
- `forcedEjection`

Key invariants:

- Thruster-driven acceleration disabled in all non-`freeFlight` states
- Slingshot/orbit capture disabled while surfing
- Shuttle cannot enter land/approach interaction while surfing
- Forced ejection preserves velocity only for danger-zone or disruption exits
- Manual decouple always resolves to zero velocity before wave spawn

INTERSECTION INPUT BUFFER:
Do not require frame-perfect A/D input.

Recommended first-release behavior:

- input buffer window: ~0.35s before intersection
- choice persists until the next intersection is resolved
- if both A and D are pressed, last input wins
- if no valid branch exists, continue straight

Without buffering, the mechanic will feel unreliable at 3x speed.

DANGER-BOUNDARY RULE:
There are two decouple outcomes and they must stay distinct:

1. Manual decouple:

- fast stop
- zero final velocity
- spawn standard decouple wave

1. Forced decouple:

- no fast stop
- preserve current rail velocity
- no free safety stop before entering a gravity well

This distinction is core to balance and should be enforced in code, not left
as a tuning convention.

SAVE / LOAD EXPECTATIONS:
First release should support save/load for the quest state and upgrade unlock.
Do not attempt to persist an active surf trajectory in the first mechanic pass.

On load:

- quest state restores normally
- delivery rewards are not replayed if already granted
- if player saved mid-surf, fall back to normal free flight at current map
position with safe velocity

That fallback is acceptable and much simpler than restoring rail state.

QA ACCEPTANCE CRITERIA:

Quest unlock:

- Player below the intended difficulty threshold does not receive the mail
- Player at threshold receives the mail on next habitat terminal visit
- Mission can be accepted and tracked
- Package can be collected exactly once per run
- Delivery at Earth grants rewards exactly once
- Gravity Surfing upgrade appears as owned but never in the shop
- Space Fabric toggle becomes visible immediately after delivery
- Jay follow-up message appears exactly once

Failure/recovery:

- Dying before pickup leaves mission available
- Dying after pickup does not duplicate the package
- Reissued mission remains completable
- Reloading after delivery does not repeat credits/upgrades/mail

Mechanic:

- Q does nothing when upgrade is locked
- Q does nothing when Space Fabric is OFF
- Q couples when eligible and decouples when surfing
- Manual decouple ends at zero velocity and spawns a wave
- Forced ejection preserves velocity
- A/D branch selection works consistently with buffered input
- Turning Space Fabric OFF while surfing decouples immediately

PHASED SHIP PLAN:

Phase 1 — Narrative gate:

- special mail
- special mission
- package item
- inventory install
- reward/install flow
- early-game text cleanup

Phase 2 — Minimal surfing:

- nearest-line snap
- forward/reverse rail motion
- manual decouple stop
- HUD state

Phase 3 — Advanced surfing:

- intersections
- curved rails
- danger zones
- wave disruption
- polish VFX/camera

OPEN DESIGN CALLS:

- Should the certification mission live in MAIL only, or also appear on the
main mission board once offered?
- Should package loss fully reset the mission, or simply respawn the package
on the same asteroid?
- Should Space Fabric auto-enable only once on unlock, or every time the map
is entered until the player manually turns it off?
- Does installation happen immediately from shuttle inventory after pickup,
or only once the player leaves the mission site / returns to map view?

RECOMMENDED ANSWERS FOR FIRST RELEASE:

- MAIL-triggered offer, then trackable from normal mission UI
- package respawns via quest reset, not permanent failure
- auto-enable Space Fabric once on unlock only
- shuttle-inventory install, because it matches the current mission loop and
existing authored Consortium copy

# ========================================

PART 4: CURRENT BUILD DELTA + NEXT PASS

GOAL OF THIS SECTION:
Keep this doc synced with what already exists in the repo, so the next
implementation pass can focus on the remaining work instead of rediscovering
what was already wired.

CURRENTLY PRESENT IN REPO:

- Hidden `gravitySurfing` upgrade exists in `src/data/upgrades.json`
- Space Fabric gating already exists in map UI / controller
- Special mission scaffold already exists in
`src/data/missions/consortium-certification.json`
- Authored Consortium offer mail already exists in
`src/lib/messages/messageCatalog.ts`
- `grid-coupling-module` inventory item already exists in
`src/data/inventory/items.json`
- `MapViewController` already contains upgrade install hooks and the
one-time "show fabric when unlocked" seam

CURRENT MISMATCHES VS THIS SPEC:

1. Offer trigger is too broad right now

- Current authored message uses a generic mission-style trigger and reads more
like "this is already in your queue"
- First-release target should be: only offer after the intended progression
threshold, then let the player accept/track it deliberately

1. Pickup/install flow is the intended loop

- Current Consortium message copy says to retrieve the module and install it
from shuttle inventory
- Keep that loop as canon for first release:
pickup -> protect package -> return to shuttle -> install from inventory
- Do not redesign this into an Earth-delivery handoff

1. Mission data still needs post-pickup state handling

- Current JSON defines a special collect objective and asteroid waypoint
- It does not yet encode package-carrying state, install completion,
reset-on-loss, or reward-on-install safeguards

1. Startup/tutorial copy is no longer consistent

- Existing early Jay onboarding still references the ship "showing the fabric"
before the Gravity Surfing unlock
- Any onboarding that teaches Space Fabric before the unlock should be revised
or deferred behind the certification completion

1. Reward ordering is not yet authored as a single ceremonial sequence

- The repo has upgrade-install plumbing, but this feature wants a specific
payout cadence so Gravity Surfing lands as the headline beat

REPO-ALIGNED FIRST CODING SLICE:
Treat the next implementation pass as "Layer A hardening" with these concrete
deliverables:

- Add explicit certification quest state to persistent storage
- Gate the offer on the real progression threshold and habitat/mail visit
- Change the authored Consortium copy only where needed to better support the
inventory-install loop in Part 1
- Add one-time install completion and reward granting
- Queue the Jay follow-up message only after successful installation
- Revise startup/tutorial copy that currently assumes Space Fabric is available

FILES MOST LIKELY TO CHANGE NEXT:

- `src/lib/messages/messageCatalog.ts`
- `src/lib/messages/tutorialTriggers.ts`
- `src/lib/messages/messageSystem.ts`
- `src/lib/missions/specialMissions.ts`
- `src/lib/missions/missionStorage.ts`
- `src/lib/map/missions/MapMissionFacade.ts`
- `src/views/MapViewController.ts`
- `src/data/missions/consortium-certification.json`

SUGGESTED IMPLEMENTATION ORDER:

1. Quest persistence + reward safeguard state
2. Offer trigger and message copy cleanup
3. Package pickup / loss / reset behavior
4. Inventory install completion + reward ceremony
5. Early-game onboarding text cleanup
6. Only after all of that: begin actual surfing controls / movement

OUT OF SCOPE FOR THIS NEXT PASS:

- Rail movement
- Intersection steering
- Curved-line traversal
- decouple wave tuning
- camera/FOV surfing polish

SUCCESS CHECK FOR THE NEXT PASS:
When a mid-game player opens habitat mail after reaching the threshold,
they get a recoverable certification mission that ends in shuttle-inventory
installation, grants the hidden upgrade exactly once, turns on Space Fabric
for that session, and no longer leaves early-game messaging claiming the
player already had access to the feature.