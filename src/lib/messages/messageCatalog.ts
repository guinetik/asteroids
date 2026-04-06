/**
 * Authored shipboard message definitions.
 *
 * @author guinetik
 * @date 2026-04-05
 * @spec docs/superpowers/specs/2026-04-05-startup-message-system-design.md
 */
import type { ShipMessageDefinition } from './messageTypes'

/** Startup handoff should always beat later tutorial prompts. */
const STARTUP_MESSAGE_PRIORITY = 100
const JAY_MESSAGE_PRIORITY = 50

/** Opening seller handoff message shown when the player starts in Earth orbit. */
export const STARTUP_SELLER_MESSAGE: ShipMessageDefinition = {
  id: 'seller-welcome-earth-orbit',
  from: 'Marta Vale, Vale Orbital Refurb',
  subject: 'Your Shuttle Handoff and First Flight Notes',
  sentAt: '2306-04-05 08:14 UTC',
  trigger: 'map_start_earth_orbit',
  delivery: 'blocking_intro',
  priority: STARTUP_MESSAGE_PRIORITY,
  body: [
    'Handoff is complete. Our runner got you up from the Moon and left you parked in low Earth orbit beside your shuttle. That is the only sensible way to deliver a ship like this. She is a space boat now. She does not come down to planets, and if you try to make her, you will turn your new home into scrap.',
    'You already have the lander, which is why this hull makes sense for you. The working loop is simple: shuttle gets you across the system, lander gets you onto the mission rock, and your boots finish the job. When you come up on a mission-site asteroid, open the cargo bay, inspect the rig, and you will be able to undock the lander instead of throwing the whole shuttle into local work.',
    'Open the bay doors with F and take a look before you leave Earth orbit. In there you have the lander, the habitat cylinder, and two separate fuel compartments. One tank is for the shuttle and one is for the lander. They do not mix, and you do not want to learn that distinction while drifting over a worksite with the wrong tank low.',
    'The habitat is your shop floor and your apartment now. Open the bay and use the habitat for missions, ship modules, inventory, and maintenance. If you are going to live out of an orbital hauler in your forties, you may as well know where the drawers are before you cross Mars.',
    'For navigation, this hull carries a relativistic drive and the map is projecting its own spacetime fabric solution for you. That grid is shipboard instrumentation, not decoration. Ride gravity right and it will add speed for free. Ride it wrong and it will bleed speed, drag you deep, and eventually put you into a planet or the Sun hard enough to make the paperwork somebody else\'s problem.',
    'One more thing: until you fit better shielding, stay in the goldilocks band. Too close in and the ship cooks. Too far out and it freezes. Earth orbit is safe water, so use it to get comfortable with the bay, the habitat, and the way the old girl reads the system before you go looking for work.',
    'You know your trade, so I will leave it there. Open the bay, check your lander, and make sure the ship feels like yours before you point it anywhere expensive.',
    '— Marta',
  ],
}

/** Jay's first note after the player meaningfully departs Earth orbit. */
export const JAY_DISTANCE_MESSAGE: ShipMessageDefinition = {
  id: 'jay-distance-from-earth',
  from: 'Jay Mercer',
  subject: 'Distances Are Worse Than They Look',
  sentAt: '2306-04-05 09:02 UTC',
  trigger: 'map_leave_earth_distance',
  delivery: 'inbox_prompt',
  priority: JAY_MESSAGE_PRIORITY,
  body: [
    'Hey, you got Jay.',
    'If Earth already looks small, good. That means you are finally seeing the system the way haulers do. Distances out here will lie to you every single day if you let them.',
    'Do not think in straight lines. Think in wells, lanes, and what body you are going to steal speed from next. The ship will show you the fabric. Trust it more than your gut until your gut earns the right.',
  ],
}

/** Jay's note about burning out the red thrust charge for the first time. */
export const JAY_THRUSTER_MESSAGE: ShipMessageDefinition = {
  id: 'jay-main-thruster-spent',
  from: 'Jay Mercer',
  subject: 'That Red Bar Is The Lesson',
  sentAt: '2306-04-05 09:18 UTC',
  trigger: 'map_main_thruster_depleted',
  delivery: 'inbox_prompt',
  priority: JAY_MESSAGE_PRIORITY,
  body: [
    'Hey, you got Jay.',
    'You just ran the red thrust charge all the way down, so now you have seen the trick. The bar empties fast, the tank pays to bring it back, and waste shows up in your fuel ledger before you notice it in the seat.',
    'Main thrust, brake, and RCS all sip from the same shuttle fuel, but they recharge on their own terms. Learn the rhythm and you will stop flying like every burn is an emergency.',
  ],
}

/** Jay's note about the shuttle brake being a costly last-resort lifesaver. */
export const JAY_BRAKE_MESSAGE: ShipMessageDefinition = {
  id: 'jay-brake-system-warning',
  from: 'Jay Mercer',
  subject: 'Those Dampeners Are For Saving Your Skin',
  sentAt: '2306-04-05 09:26 UTC',
  trigger: 'map_brake_used',
  delivery: 'inbox_prompt',
  priority: JAY_MESSAGE_PRIORITY,
  body: [
    'Hey, you got Jay.',
    'That brake is future neutron-tech inertia dampeners, which is a pretty way of saying it will absolutely break your motion when you ask nice and pay the fuel bill.',
    'Use it when gravity, speed, or bad judgment have stacked the deck against you. It is worth the burn if it saves the ship, but you should never need it for normal flying. Last resort, not cruise control.',
  ],
}

/** Jay's future mission-site reminder, dispatched later by the mission system. */
export const JAY_MISSION_START_MESSAGE: ShipMessageDefinition = {
  id: 'jay-mission-start-lander-reminder',
  from: 'Jay Mercer',
  subject: 'Use The Right Machine',
  sentAt: '2306-04-05 09:34 UTC',
  trigger: 'mission_start',
  delivery: 'inbox_prompt',
  priority: JAY_MESSAGE_PRIORITY,
  body: [
    'Hey, you got Jay.',
    'Do not take the shuttle into local mission work just because it is the bigger machine. Open the bay, check the lander, and use the right tool for the rock you are heading toward.',
    'Shuttle gets you there. Lander gets you down. Then it is boots and hand tools. That order exists because people who tried the other order are now cautionary stories.',
  ],
}

/** Jay's warning when the player starts flirting with Venus' orbital lane. */
export const JAY_VENUS_WARNING_MESSAGE: ShipMessageDefinition = {
  id: 'jay-venus-orbit-warning',
  from: 'Jay Mercer',
  subject: 'You Are Getting Too Friendly With Venus',
  sentAt: '2306-04-05 09:46 UTC',
  trigger: 'map_venus_orbit_warning',
  delivery: 'inbox_prompt',
  priority: JAY_MESSAGE_PRIORITY,
  body: [
    'Hey, you got Jay.',
    'You are close enough to the Venus lane that heat starts being a planning problem, not a theory problem. Until you fit better shielding, do not loaf around in there.',
    'Use the pass, take what speed you came for, and get yourself back toward the goldilocks band before the hull starts teaching you a more expensive lesson.',
  ],
}

/** Full message catalog for the current build. */
export const SHIP_MESSAGE_CATALOG: ShipMessageDefinition[] = [
  STARTUP_SELLER_MESSAGE,
  JAY_DISTANCE_MESSAGE,
  JAY_THRUSTER_MESSAGE,
  JAY_BRAKE_MESSAGE,
  JAY_MISSION_START_MESSAGE,
  JAY_VENUS_WARNING_MESSAGE,
]
