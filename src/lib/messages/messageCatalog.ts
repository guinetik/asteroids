/**
 * Authored shipboard message definitions.
 *
 * @author guinetik
 * @date 2026-04-05
 * @spec docs/superpowers/specs/2026-04-05-startup-message-system-design.md
 */
import type { ShipMessageDefinition } from './messageTypes'

/**
 * Wall-clock delay before Jay's contract heads-up arrives in the inbox after the
 * player archives the first-slingshot message. Gives the cinematic moment time
 * to breathe instead of slamming a contract into the mail program immediately.
 */
const JAY_CONTRACT_INCOMING_DELAY_SEC = 10

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
  enqueueOnDismiss: ['jay-so-you-actually-did-it'],
  trigger: 'map_start_earth_orbit',
  delivery: 'blocking_intro',
  priority: STARTUP_MESSAGE_PRIORITY,
  body: [
    'Hey handsome, Marta here.',
    "If I'm good at my job — and you know from this deal I'm very good at my job — your shuttle should be just parking up from the Moon at Earth's orbital Spaceport.",
    "She's yours!",
    "Never thought I'd be selling a shuttle to the guy I met at Space Bingo.",
    "Boy you must have been bored! A retired lander guy in his forties going indie? Baby, that's a midlife crisis.",
    "I'm not being sassy. I care about you. After everything on Luna I just... I want you to be careful out there, okay?",
    "Real talk. You got 1,000 credits left to your name, the ship eats fuel constantly and it's rocking bare-bones shielding. So, you're stuck near Earth for now. Too close to the sun you burn, if you leave Mars, systems will start to freeze. Spaceports have engineering bays for upgrades but you need credits first. Two kinds of contracts out there — shuttle jobs and lander jobs. Good thing you have both. Jay's got some work lined up for you. Take it.",
    "Stop by sometime. I'll buy you an Unicorn Skibidi Latte.",
    '— Marta',
  ],
}

export const JAY_STARTUP_FOLLOW_UP_MESSAGE: ShipMessageDefinition = {
  id: 'jay-so-you-actually-did-it',
  from: 'Jay Mercer',
  subject: 'So You Actually Did It',
  sentAt: '2306-04-05 08:22 UTC',
  audioUrl: '/sound/jay-001.mp3',
  trigger: 'map_start_earth_orbit',
  delivery: 'inbox_prompt',
  priority: JAY_MESSAGE_PRIORITY,
  body: [
    'Hey, you got Jay.',
    "So you actually did it. Wasn't sure you'd go through with it after the third beer when we talked about this. But here you are, up from the Moon, sitting in a shuttle, wondering what the hell you just did. Same thing I wondered eleven years ago. It passes.",
    "Marta's gonna tell you to be careful. She's right. But she's a dealer and I'm the guy who actually flies for a living, so here's what she left out.",
    "You don't need to burn hard. Earth does the work. Press E near a planet, A and D to aim, charge the slingshot. Planet's gravity does the rest. That's the whole trick. Green arrow's good, red means you're aimed at something solid. Go prograde. Don't rush it — impatient pilots buy fuel twice.",
    "One more thing. Sometimes the slingshot gets weird. Spacetime does this ripple thing, stomach flips, nav freaks out for a second. Totally harmless, done it a thousand times. Only side effect's an urge to pee. Nobody talks about that part. Everybody gets it. Wear the suit.",
    "You'll get the hang of it. Marta says you're good with your hands. Can confirm.",
    '— Jay',
  ],
}

/** Jay's note after the player's first slingshot — introduces contracts and the partnership pitch. */
export const JAY_FIRST_SLINGSHOT_MESSAGE: ShipMessageDefinition = {
  id: 'jay-first-slingshot-contracts',
  from: 'Jay Mercer',
  subject: 'Now We Are Talking',
  sentAt: '2306-04-05 08:38 UTC',
  audioUrl: '/sound/jay-002.mp3',
  trigger: 'map_first_slingshot',
  delivery: 'inbox_prompt',
  priority: JAY_MESSAGE_PRIORITY,
  enqueueOnDismiss: ['jay-contract-incoming'],
  enqueueOnDismissDelaySeconds: JAY_CONTRACT_INCOMING_DELAY_SEC,
  body: [
    'Hey, you got Jay.',
    'That was your first slingshot. See what I mean? The planet does the work. You just pick the angle and let go. That is flying.',
    'Now here is the thing. I did not talk you into buying that shuttle just so you could run contracts for strangers. I have been out here alone too long and you have been on the Moon too long and I think we are both done working for other people.',
    'I am sending you a couple starter jobs. Easy stuff, close to home. We split the margins fair. Think of it as a trial run for something bigger.',
    'Open the mission board on your shuttle terminal. There are two kinds of contracts out there — some need a shuttle, some need a lander. Good thing you have both.',
    'Pick something close. Pick something that pays. Earn enough to upgrade, and then the whole system opens up.',
    "Space Cowboys, Inc. You and me. We'll figure out the logo later.",
    '— Jay',
  ],
}

/**
 * Heads-up Jay sends a few seconds after the first-slingshot message is archived. Lives
 * in the default inbox. The actual Space Cowboys, Inc. contract is offered to the
 * **mail folder** the moment the player completes **any** first mission, not when
 * this message is archived.
 */
export const JAY_CONTRACT_INCOMING_MESSAGE: ShipMessageDefinition = {
  id: 'jay-contract-incoming',
  from: 'Jay Mercer',
  subject: 'After Your First Run — Partner Paperwork',
  sentAt: '2306-04-05 08:48 UTC',
  trigger: 'contract',
  delivery: 'inbox_prompt',
  priority: JAY_MESSAGE_PRIORITY,
  body: [
    'Hey, you got Jay.',
    'I am not parking the real Space Cowboys, Inc. contract in your mail until you have one real job under your belt — shuttle, lander, anything that pays. Close something out, then the system will open a new folder with the partner offer.',
    'Until you see that, you are on starter boards only. The logo can wait. Your flight hours cannot.',
    'When the folder shows up, read it, accept it if you are still in, and we are fifty-fifty on everything after.',
    '— Jay',
  ],
}

/** Nudge priority — MMC’s drill-sergeant handler; slightly above general Jay line noise. */
const MMC_SAMPAIO_MESSAGE_PRIORITY = 55

/**
 * Main-inbox nudge from Colonel Sampaio when the MMC turret contract unlocks. The real offer
 * and every step after live in the Martian Marine Corps folder — this is your orders to get eyes
 * on the mail stack (same “handler” idea as {@link JAY_CONTRACT_INCOMING_MESSAGE}, but Corps voice).
 */
export const COLONEL_SAMPAIO_MMC_HEADS_UP: ShipMessageDefinition = {
  id: 'sampaio-mmc-contract-heads-up',
  from: 'Col. Hélder Sampaio, MMC (Engineering & Mining Liaison)',
  subject: "LISTEN — YOU'VE GOT ORDERS IN THE MMC STACK",
  sentAt: '2306-04-10 10:55 UTC',
  trigger: 'contract',
  delivery: 'inbox_prompt',
  priority: MMC_SAMPAIO_MESSAGE_PRIORITY,
  body: [
    "Phobos cleared your file. You closed the Space Cowboys' Mars charter and you already ran a line on red dirt — that means you are eligible for a proper Corps turret detachment, not a sticker on your window.",
    'The packet starts with a hull mount, not a joyride. No turret, no mining line from the Corps. Already carrying one? The contract will log it. Before you go joyriding in the belt: there is a contract packet under MARTIAN MARINE CORPS in your shuttle mail. Not this inbox. The folder on the left. Open the terminal, hit Messages, read the offer, then hit Accept or Decline like you mean it.',
    'If you can not find a mail folder, you are not ready for my ore runs. I am not re-explaining the UI in a second message.',
    '— Sampaio. Move.',
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

/** Priority for Viroid Envoy messages — rare alien contact, high importance. */
const VIROID_ENVOY_PRIORITY = 90

/** Viroid Envoy's first contact after 3 exterminate missions. */
export const VIROID_ENVOY_INITIAL_CONTACT: ShipMessageDefinition = {
  id: 'viroid-envoy-initial-contact',
  from: '— — —',
  subject: '...',
  sentAt: '2306-04-12 00:00 UTC',
  trigger: 'viroid_envoy_initial_contact',
  delivery: 'inbox_prompt',
  priority: VIROID_ENVOY_PRIORITY,
  body: [
    'You kill. We watch.',
    'The ones you destroy are what we were. What we no longer choose to be. You are removing noise from the system. This is noted.',
    'A thing has been placed at the coordinates in this transmission. It is not a weapon. It is not a gift. It is a key to infrastructure you cannot currently perceive.',
    'Install it. See what we built when we still built things.',
    'Retrieve the package. The waypoint is marked.',
  ],
}

/** Viroid Envoy's follow-up after installing the Dark Lattice Coupler. */
export const VIROID_ENVOY_CERES_RENDEZVOUS: ShipMessageDefinition = {
  id: 'viroid-envoy-ceres-rendezvous',
  from: '— — —',
  subject: 'Ceres',
  sentAt: '2306-04-12 00:00 UTC',
  trigger: 'viroid_envoy_ceres_rendezvous',
  delivery: 'inbox_prompt',
  priority: VIROID_ENVOY_PRIORITY,
  enqueueOnDismiss: [],
  body: [
    'You see now. The highways. What remains.',
    'Come to Ceres. There is something we need to discuss that cannot be encoded in a transmission.',
    'You have proven useful. We would like to understand why.',
  ],
}

/** Full message catalog for the current build. */
export const SHIP_MESSAGE_CATALOG: ShipMessageDefinition[] = [
  STARTUP_SELLER_MESSAGE,
  CONSORTIUM_CERTIFICATION_MESSAGE,
  JAY_STARTUP_FOLLOW_UP_MESSAGE,
  JAY_FIRST_SLINGSHOT_MESSAGE,
  JAY_CONTRACT_INCOMING_MESSAGE,
  COLONEL_SAMPAIO_MMC_HEADS_UP,
  JAY_DISTANCE_MESSAGE,
  JAY_THRUSTER_MESSAGE,
  JAY_BRAKE_MESSAGE,
  JAY_MISSION_START_MESSAGE,
  JAY_VENUS_WARNING_MESSAGE,
  VIROID_ENVOY_INITIAL_CONTACT,
  VIROID_ENVOY_CERES_RENDEZVOUS,
]
