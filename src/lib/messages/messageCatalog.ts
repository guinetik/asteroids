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
const CONSORTIUM_MESSAGE_PRIORITY = 75
const JAY_MESSAGE_PRIORITY = 50

/** Opening seller handoff message shown when the player starts in Earth orbit. */
export const STARTUP_SELLER_MESSAGE: ShipMessageDefinition = {
  id: 'seller-welcome-earth-orbit',
  from: 'Marta Vale, Vale Orbital Refurb',
  subject: "She's Yours Now",
  sentAt: '2306-04-05 08:14 UTC',
  audioUrl: '/sound/marta-001.mp3',
  enqueueOnRead: ['jay-so-you-actually-did-it'],
  trigger: 'map_start_earth_orbit',
  delivery: 'blocking_intro',
  priority: STARTUP_MESSAGE_PRIORITY,
  body: [
    'Hey handsome. Marta here.',
    'If I am good at my job — and you know from this deal that I am very good at my job — you should be reading this right as the runner parks at the spaceport. She made it up from the Moon in one piece. Your brand new shuttle.',
    'I never thought I would be selling you a shuttle when I met you at Space Bingo four years ago. A retired lander guy in his forties buying a refurbished hauler to go independent? Baby, that is a midlife crisis.',
    'I am not being sassy. I care about you and I want you to be careful.',
    'I know after what happened on Luna you needed to get out of there. But this is a big jump. Literally.',
    'Here is the reality. You have 1,000 credits to your name. That is it. That shuttle is beautiful but her shielding is bare minimum, which means your range right now is Earth orbit and not much further. Too close to the Sun and you cook. Too far out and the cold eats your systems. Stay in the neighborhood for now. Every spaceport has an engineering bay you can access from your shuttle terminal — that is where you buy upgrades like heat shields and cryo insulation to push further out. But you need credits first.',
    'The good news is there is work. Open the mission board on your shuttle terminal — there are two kinds of contracts out there. Some need a shuttle, some need a lander. Good thing you have both. Not many haulers can say that. Twenty years of surface hours and a lander license are about to start paying for themselves in ways they never did on the Moon.',
    'Pick something close. Pick something that pays. Earn enough to upgrade, and then the whole system opens up.',
    'Stop by the dealership next time you are in Earth orbit. I will buy you a Space Unicorn Skibidi Latte.',
    '— Marta',
  ],
}

export const JAY_STARTUP_FOLLOW_UP_MESSAGE: ShipMessageDefinition = {
  id: 'jay-so-you-actually-did-it',
  from: 'Jay Mercer',
  subject: 'So You Actually Did It',
  sentAt: '2306-04-05 08:22 UTC',
  audioUrl: '/sound/jay.mp3',
  trigger: 'map_start_earth_orbit',
  delivery: 'inbox_prompt',
  priority: JAY_MESSAGE_PRIORITY,
  body: [
    'Hey, you got Jay.',
    'So you actually bought her. I was not sure you would go through with it after the third beer when we talked about this. But here you are. Up from the Moon, sitting in a shuttle, probably looking at Earth through the bay window wondering what the hell you just did.',
    'Same thing I wondered eleven years ago. It passes.',
    'Listen, I know Marta is going to send you some beautiful heartfelt message about being careful. She is right. But she is also a dealer and I am the guy who actually does this for a living, so here is the part she left out.',
    "You do not need to burn hard to reach the rocks near Earth. Earth does most of the work. While you are parked at the spaceport, the planet is already pulling your hull through its gravity lane. Free speed. When your target lines up and the nav will show you when, you press E to lock orbit, aim your exit with A and D, and charge the slingshot. The spaceport gives you the kick. Earth's gravity does the rest. That is it. That is the whole trick.",
    'Done right you barely spend fuel and you arrive fast. Done wrong you burn 20% of your tank on a bad angle and get to sit there watching the rock drift away while you do math in your head.',
    "Watch the arrow. Green means go. Red means you are aimed at something solid. Launch with the planet's orbit, not against it. Prograde is your best friend out here. You will feel the difference the first time.",
    'Do not be impatient. Impatient pilots buy fuel twice.',
    'One more thing. Sometimes when you slingshot, especially the hard ones with the drive wound up, the local spacetime gets weird. Something about quantum entropy and the fabric not registering your jump cleanly. Your trajectory bends off the line you expected, the nav freaks out for a second, and the whole view does this ripple thing that makes your stomach flip.',
    'It is completely harmless. I have done it a thousand times. Just reorient and keep flying.',
    'The only actual side effect is an incontrollable urge to pee. Nobody talks about that part. I am telling you now so you do not think something is wrong with you. It is the spacetime thing. Everybody gets it. Wear the suit.',
    'Now here is the thing. I did not talk you into this just so you could run contracts for strangers. I have been out here alone too long and you have been on the Moon too long and I think we are both done working for other people.',
    'I am sending you a couple starter jobs. Easy stuff, close to home. We split the margins fair. Think of it as a trial run for something bigger.',
    'Space Cowboys, Inc. You and me. We will figure out the logo later.',
    'You will get the hang of it fast. Marta says you are good with your hands.',
    'I have no opinion on that yet.',
    '— Jay',
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

/** Special mission offer that also serves as the authored inbox handoff. */
export const CONSORTIUM_CERTIFICATION_MESSAGE: ShipMessageDefinition = {
  id: 'consortium-certification-offer',
  from: 'Space Consortium — Logistics Division',
  subject: 'Requisition Package — Field Operator Certification',
  sentAt: '2306-04-09 12:10 UTC',
  trigger: 'mission_start',
  delivery: 'inbox_prompt',
  priority: CONSORTIUM_MESSAGE_PRIORITY,
  body: [
    'Operator,',
    'Your recent activity logs were flagged by an associate of ours, J. Mercer, as evidence of sustained deep-field work using a Class-C orbital frame.',
    'We do not typically certify retrofitted hulls for relativistic grid coupling. In this case, an exception package has been staged and attached to your work queue under Consortium Certification.',
    'Proceed to the marked asteroid, retrieve the sealed Grid Coupling Module, and install it from shuttle inventory after recovery. Do not tamper with the package in the field.',
    'This assignment has already been entered into your active mission ledger. Track the waypoint and complete the pickup at your discretion.',
    '— Consortium Logistics, Sol Sector',
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
  CONSORTIUM_CERTIFICATION_MESSAGE,
  JAY_STARTUP_FOLLOW_UP_MESSAGE,
  JAY_DISTANCE_MESSAGE,
  JAY_THRUSTER_MESSAGE,
  JAY_BRAKE_MESSAGE,
  JAY_MISSION_START_MESSAGE,
  JAY_VENUS_WARNING_MESSAGE,
]
