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
  subject: 'First Job Done — Here Comes The Paperwork',
  sentAt: '2306-04-05 08:48 UTC',
  trigger: 'contract',
  delivery: 'inbox_prompt',
  priority: JAY_MESSAGE_PRIORITY,
  body: [
    'Hey, you got Jay.',
    'You closed your first job. Which means the Space Cowboys, Inc. contract is now sitting in a new folder in your mail — look for it on the left side of the message terminal.',
    'Read it, accept it if you are still in, and we are fifty-fifty on everything after that.',
    "The logo can wait. The flight hours couldn't.",
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
  subject: 'MMC — CONTRACT PACKET WAITING',
  sentAt: '2306-04-10 10:55 UTC',
  trigger: 'contract',
  delivery: 'inbox_prompt',
  priority: MMC_SAMPAIO_MESSAGE_PRIORITY,
  body: [
    'Pilot. Sampaio. Phobos desk.',
    'Cowboys handler vouched. Recorded. Mars line is logged. Eligibility confirmed for turret cohort enrollment.',
    'Contract packet is under MARTIAN MARINE CORPS in your shuttle mail. Not this inbox. The folder. Open it, read the brief, accept or decline.',
    '— Sampaio, MMC',
  ],
}

/** Jay's first note after the player meaningfully departs Earth orbit. */
export const JAY_DISTANCE_MESSAGE: ShipMessageDefinition = {
  id: 'jay-distance-from-earth',
  from: 'Jay Mercer',
  subject: 'The System Is Bigger Than It Looks From The Moon',
  sentAt: '2306-04-05 09:02 UTC',
  trigger: 'map_leave_earth_distance',
  delivery: 'inbox_prompt',
  priority: JAY_MESSAGE_PRIORITY,
  body: [
    'Hey, you got Jay.',
    "If Earth is looking small already, good. That means you are starting to see it the way haulers do. Distances out here will lie to you every single day if you let them.",
    "Do not think in straight lines. Think in wells, lanes, and what body you are going to steal speed from next. The slingshot you practiced near Earth works anywhere — same E to lock, same A and D to aim, different gravity source. That is the whole trick.",
    "Trust the orbit lines more than your gut until your gut earns the right. It took me eleven years. You are going to be faster.",
    "Probably. Maybe. I was really bad at this.",
    '— Jay',
  ],
}

/** Jay's note about burning out the red thrust charge for the first time. */
export const JAY_THRUSTER_MESSAGE: ShipMessageDefinition = {
  id: 'jay-main-thruster-spent',
  from: 'Jay Mercer',
  subject: 'That Red Bar Is Your Tuition',
  sentAt: '2306-04-05 09:18 UTC',
  trigger: 'map_main_thruster_depleted',
  delivery: 'inbox_prompt',
  priority: JAY_MESSAGE_PRIORITY,
  body: [
    'Hey, you got Jay.',
    "You just ran the main thrust charge down to nothing. So now you have seen the trick — the bar empties fast, the tank pays to bring it back, and waste shows up in your fuel ledger before you notice it in the seat.",
    "Main thrust, brake, and RCS all drink from the same tank, but they recharge on their own schedule. They top themselves off when idle. Learn that rhythm and you will stop flying like every burn is an emergency.",
    "Gravity is free. Use it more. That is a sentence I repeated to myself for an embarrassing number of years before it stuck.",
    '— Jay',
  ],
}

/** Jay's note about the shuttle brake being a costly last-resort lifesaver. */
export const JAY_BRAKE_MESSAGE: ShipMessageDefinition = {
  id: 'jay-brake-system-warning',
  from: 'Jay Mercer',
  subject: 'The Brake Is A Last Resort, Not A Habit',
  sentAt: '2306-04-05 09:26 UTC',
  trigger: 'map_brake_used',
  delivery: 'inbox_prompt',
  priority: JAY_MESSAGE_PRIORITY,
  body: [
    'Hey, you got Jay.',
    "That brake you just hit — future neutron-tech inertia dampeners, which is a fancy way of saying it will absolutely kill your velocity when you ask nice and pay the fuel bill.",
    "Use it when gravity, speed, and bad judgment have all showed up at the same party. It is worth the burn if it saves the ship.",
    "But if you are braking on normal approaches, something earlier in the math went wrong. Figure that out and the brake gets to stay in the drawer where it belongs.",
    "It is a last resort. Not a vibe.",
    '— Jay',
  ],
}

/** Jay's future mission-site reminder, dispatched later by the mission system. */
export const JAY_MISSION_START_MESSAGE: ShipMessageDefinition = {
  id: 'jay-mission-start-lander-reminder',
  from: 'Jay Mercer',
  subject: 'Shuttle Gets You There, Lander Gets You Down',
  sentAt: '2306-04-05 09:34 UTC',
  trigger: 'mission_start',
  delivery: 'inbox_prompt',
  priority: JAY_MESSAGE_PRIORITY,
  body: [
    'Hey, you got Jay.',
    "You have got a mission waypoint now, which means the lander is the machine you want. Hit F to open the cargo bay, drop the lander, and use the right tool for the rock you are heading toward.",
    "Shuttle gets you there. Lander gets you down. Boots and hand tools after that. That order exists because people who tried the other order are now cautionary stories I tell at the Cowboys kiosk.",
    "Anyway. Go get paid.",
    '— Jay',
  ],
}

/** Special mission offer that also serves as the authored inbox handoff. */
export const CONSORTIUM_CERTIFICATION_MESSAGE: ShipMessageDefinition = {
  id: 'consortium-certification-offer',
  from: 'United Space Consortium — Logistics Division',
  subject: 'REQUISITION PACKAGE — FIELD OPERATOR CERTIFICATION 2207-R-887',
  sentAt: '2306-04-09 12:10 UTC',
  trigger: 'mission_start',
  delivery: 'inbox_prompt',
  priority: CONSORTIUM_MESSAGE_PRIORITY,
  body: [
    'OPERATOR,',
    'Pursuant to recent activity logs flagged on your file by an associate of record (J. MERCER), the Consortium notes sustained deep-field operation against a Class-C orbital frame.',
    'Retrofitted hulls are not typically certified for relativistic grid coupling. In this case, an exception package has been staged and attached to your active mission ledger under CONSORTIUM CERTIFICATION.',
    'Proceed to the marked asteroid, retrieve the sealed Grid Coupling Module per Form 4471-G-12, and install from shuttle inventory after recovery. Field tampering with the package is non-permitted and will void the exception.',
    'The assignment has been entered into your active mission ledger. Track the waypoint and complete the pickup at the operator\'s discretion. The Consortium thanks you for your cooperation.',
    '— USC Logistics, Sol Sector',
  ],
}

/** Jovian Step 4 — Hektor photometry offer. */
export const JOVIAN_HEKTOR_PHOTOMETRY_OFFER: ShipMessageDefinition = {
  id: 'jovian-prospection-hektor-photometry-offer',
  from: 'Vance Holroyd, Senior Asset Officer (Cloud City)',
  subject: 'OP 4 — TASKING: Photometric Pass — Asset 2306-J',
  sentAt: '2306-05-04 09:18 UTC',
  trigger: 'mission_start',
  delivery: 'inbox_prompt',
  priority: 80,
  folderId: 'jovian-society-prospection',
  folderLabel: 'Jovian Society',
  body: [
    '[courteous] I trust this finds you well.',
    'Calibration registers green. The Society has staged Asset 2306-J on your active mission ledger — Jovian Trojans, L4 cluster, leading Jupiter by approximately sixty degrees. The body will appear on your navigation system momentarily.',
    'Standard photometric protocol: hold standoff, capture telemetry, return for processing. The Society values clean data over rapid transit. Please prioritize signal quality.',
    '[measured] — Vance Holroyd, Senior Asset Officer',
  ],
}

/** Jovian Step 5 — Saturn photometry offer. */
export const JOVIAN_SATURN_PHOTOMETRY_OFFER: ShipMessageDefinition = {
  id: 'jovian-prospection-saturn-photometry-offer',
  from: 'Vance Holroyd, Senior Asset Officer (Cloud City)',
  subject: 'OP 5 — TASKING: Photometric Pass — Asset 2306-S',
  sentAt: '2306-05-09 11:42 UTC',
  trigger: 'mission_start',
  delivery: 'inbox_prompt',
  priority: 80,
  folderId: 'jovian-society-prospection',
  folderLabel: 'Jovian Society',
  body: [
    '[courteous] I trust this finds you well.',
    'The Jovian pass returned strong telemetry. The Society is routing you outsystem for this deliverable. Asset 2306-S is staged in the Saturn co-orbital region — I am aware this is slightly outside the standard operating envelope. I will say plainly that the portfolio review is system-wide this quarter, and we would prefer a contractor whose field quality we already have on file.',
    'Travel premium is included in the line item. The Society would prefer the figure not be cited to other cohort contractors.',
    'Same protocol as the Jovian pass. Bring back clean telemetry.',
    '[measured] — Vance Holroyd, Senior Asset Officer',
  ],
}

/** Jovian Step 7 — Hektor DAN offer. */
export const JOVIAN_HEKTOR_DAN_OFFER: ShipMessageDefinition = {
  id: 'jovian-prospection-hektor-dan-offer',
  from: 'Vance Holroyd, Senior Asset Officer (Cloud City)',
  subject: 'OP 7 — TASKING: Subsurface Survey — Asset 2306-J',
  sentAt: '2306-05-15 14:08 UTC',
  trigger: 'mission_start',
  delivery: 'inbox_prompt',
  priority: 80,
  folderId: 'jovian-society-prospection',
  folderLabel: 'Jovian Society',
  body: [
    '[courteous] I trust this finds you well.',
    'Instrumentation Bay confirms the DAN unit is registered to your lander. The Society has staged the subsurface pass on Asset 2306-J — the same Jovian Trojan body from OP 4. The territory will be familiar.',
    'Park in the crater the Society marked during your earlier visit, engage science mode, and run the neutron pulse. I am told the pulse may register ambient disturbance during operation on certain body types. The instrumentation team classifies this as sensor cross-talk. Please complete the survey regardless.',
    '[measured] — Vance Holroyd, Senior Asset Officer',
  ],
}

/** Jovian Step 8 — Saturn DAN offer. */
export const JOVIAN_SATURN_DAN_OFFER: ShipMessageDefinition = {
  id: 'jovian-prospection-saturn-dan-offer',
  from: 'Vance Holroyd, Senior Asset Officer (Cloud City)',
  subject: 'OP 8 — TASKING: Subsurface Survey — Asset 2306-S',
  sentAt: '2306-05-21 10:30 UTC',
  trigger: 'mission_start',
  delivery: 'inbox_prompt',
  priority: 80,
  folderId: 'jovian-society-prospection',
  folderLabel: 'Jovian Society',
  body: [
    '[courteous] I trust this finds you well.',
    'Final survey deliverable. Asset 2306-S is staged for the DAN pass — the Saturn co-orbital body from OP 5. Same protocol as the Jovian survey.',
    'I will note that several cohort contractors have reported elevated ambient disturbance during subsurface passes near gas-giant co-orbitals. I am told you are cleared to proceed at your discretion. Please note any telemetry anomalies in the delivery record rather than stopping the pass.',
    'Travel premium applies on this leg. Bring the data home and the Society will begin compiling the full prospectus.',
    '[measured] — Vance Holroyd, Senior Asset Officer',
  ],
}

/** Jovian Step 9 — Hektor prospectus compilation and transmission offer. */
export const JOVIAN_HEKTOR_PROSPECTUS_OFFER: ShipMessageDefinition = {
  id: 'jovian-prospection-hektor-prospectus-offer',
  from: 'Vance Holroyd, Senior Asset Officer (Cloud City)',
  subject: 'OP 9 — PROSPECTUS COMPILATION AND TRANSMISSION',
  sentAt: '2306-05-28 09:15 UTC',
  trigger: 'mission_start',
  delivery: 'inbox_prompt',
  priority: 80,
  folderId: 'jovian-society-prospection',
  folderLabel: 'Jovian Society',
  body: [
    '[courteous] I trust this finds you well.',
    'Eight deliverables returned clean. The Society is genuinely grateful for the data quality you have brought back across both instrumentation series. It is, I will say, above what we typically receive at this tier.',
    'Briefing',
    'Final assignment: please travel to Asset 2306-J in the Jovian Trojans. The Society has provisioned a terminal on the surface near your previous landing zone. Approach the terminal, review the assembled prospectus — your telemetry readings, our analysis, the recommended asset disposition — and confirm transmission to Cloud City Asset Strategy at your discretion.',
    'Recommendation',
    'On receipt of your transmission, the Society will advance Asset 2306-J through the standard extraction confidence bands. The closeout bonus structure attached to this step reflects the asset class. There is no further fieldwork after this deliverable.',
    '[pause] Welcome, in advance, to the manifest.',
    '[measured] — Vance Holroyd, Senior Asset Officer',
  ],
}

/** Jay's warning when the player starts flirting with Venus' orbital lane. */
export const JAY_VENUS_WARNING_MESSAGE: ShipMessageDefinition = {
  id: 'jay-venus-orbit-warning',
  from: 'Jay Mercer',
  subject: 'Venus Is A Pass, Not A Parking Spot',
  sentAt: '2306-04-05 09:46 UTC',
  trigger: 'map_venus_orbit_warning',
  delivery: 'inbox_prompt',
  priority: JAY_MESSAGE_PRIORITY,
  body: [
    'Hey, you got Jay.',
    "You are close enough to the Venus lane that heat stops being a theory problem. With what you are running right now, do not loaf around in there.",
    "Slingshot through if you need the speed, take what you came for, and get yourself back toward the goldilocks band before the hull starts writing you a tuition bill.",
    "There is a paperwork lane that pays for the heat shield if you can stomach the forms. Worth knowing about. Worth more if you do it before Venus teaches you why.",
    "The hull is not sentimental about this. Unfortunately.",
    '— Jay',
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
    'The ones you destroy are what we were. What we no longer choose to be. You are removing noise from the system.',
    'A thing has been placed at the coordinates in this transmission. It is not a weapon. It is not a gift. It is a key to infrastructure you cannot currently perceive.',
    'Install it. See what we built when we still built things.',
    'The waypoint is marked.',
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
    'Come to Ceres. This cannot be encoded.',
    'You have proven useful. We intend to understand why.',
  ],
}

/** Cosmetologist + premium cargo buyer stationed at Mars, Jupiter, and Saturn magenta docks. */
const FANTASIA_COSMETIC_MESSAGE_PRIORITY = 48

/** One-time magenta shop intro — delivered via `enqueueById` while orbiting an eligible outer world. */
export const FANTASIA_PIMP_MY_SHUTTLE_INTRO_MESSAGE: ShipMessageDefinition = {
  id: 'fantasia-pimp-my-shuttle-intro',
  from: 'Fantasia Mira-Io',
  subject: 'Lindo, your shuttle wants a color',
  sentAt: '2306-04-30 14:00 UTC',
  trigger: 'map_cosmetic_shop_intro_scripted',
  delivery: 'inbox_prompt',
  priority: FANTASIA_COSMETIC_MESSAGE_PRIORITY,
  folderId: 'station-comms',
  folderLabel: 'Station Comms',
  body: [
    '[bright] Lindo, finally.',
    '',
    'I saw your transponder squawk online and I just — I *stopped*. Default hull. Factory panels. Registry typeface nobody picked, just inherited. *That* is the shuttle of a person who has not yet decided who they are. You have decided a lot of things to get this far. Why not *this*?',
    '',
    'Come find me. Look for the magenta wash on the dock truss — that pulse is my wave hello. Berth there, hit P, and my hatch opens just for you. I am on Mars, Jupiter, and Saturn, *amor* — open your map (M) and you can jump between them. Each location rotates different pieces, so — [whispered] come see me on Saturn for the rings collection, I will not say this twice.',
    '',
    'I do hull shaders, lander flags, ship titles, multitool finishes. I grew up on a station. We chose our light because nobody was handing it out. Color is not decoration where I come from — it is *identity*. I will find yours. I usually know it faster than you do.',
    '',
    'Bring me whatever you have been hauling. I pay better than a standard market window and I do not make you stare at spreadsheets.',
    '',
    '[laughs] —Fantasia · Pimp My Shuttle!',
  ],
}

/** Priority for Ceres Institute messages — academic / institutional, mid-tier. */
const CERES_INSTITUTE_MESSAGE_PRIORITY = 70

/** Ceres Institute contract step 1 — field team rescue, first tasking. */
export const CERES_INSTITUTE_RESCUE_1_OFFER: ShipMessageDefinition = {
  id: 'ceres-institute-rescue-1-offer',
  from: 'Dean Bernard Porter, Ceres Institute',
  subject: 'Field Team Extraction — Tasking Active',
  sentAt: '2306-05-04 10:00 UTC',
  trigger: 'mission_start',
  delivery: 'inbox_prompt',
  priority: CERES_INSTITUTE_MESSAGE_PRIORITY,
  folderId: 'ceres-institute-contract',
  folderLabel: 'Ceres Institute',
  body: [
    'Young pilot — the rescue listing is on the kiosk. Bring our people home.',
    'Psychosphere collection is paid out of the Institute discretionary line.',
    '— Porter',
  ],
}

/** Ceres Institute contract step 2 — mineral resonance survey tasking. */
export const CERES_INSTITUTE_MINERAL_ANALYSIS_OFFER: ShipMessageDefinition = {
  id: 'ceres-institute-mineral-analysis-offer',
  from: 'Dean Bernard Porter, Ceres Institute',
  subject: 'Resonance Survey — Mineral Composition',
  sentAt: '2306-05-06 09:15 UTC',
  trigger: 'mission_start',
  delivery: 'inbox_prompt',
  priority: CERES_INSTITUTE_MESSAGE_PRIORITY,
  folderId: 'ceres-institute-contract',
  folderLabel: 'Ceres Institute',
  body: [
    'Young pilot — mineral analysis tasking is on the board. Submit clean readings; we prefer signal quality over speed.',
    '— Porter',
  ],
}

/** Ceres Institute contract step 3 — DAN albedo survey tasking. */
export const CERES_INSTITUTE_DAN_OFFER: ShipMessageDefinition = {
  id: 'ceres-institute-dan-offer',
  from: 'Dean Bernard Porter, Ceres Institute',
  subject: 'DAN Albedo Survey — Tasking Active',
  sentAt: '2306-05-08 11:30 UTC',
  trigger: 'mission_start',
  delivery: 'inbox_prompt',
  priority: CERES_INSTITUTE_MESSAGE_PRIORITY,
  folderId: 'ceres-institute-contract',
  folderLabel: 'Ceres Institute',
  body: [
    'Young pilot — the DAN run is on the kiosk. Capture the particle return cleanly; ignore any sensor cross-talk during the pass.',
    '— Porter',
  ],
}

/** Ceres Institute contract step 4 — second field team rescue tasking. */
export const CERES_INSTITUTE_RESCUE_2_OFFER: ShipMessageDefinition = {
  id: 'ceres-institute-rescue-2-offer',
  from: 'Dean Bernard Porter, Ceres Institute',
  subject: 'Field Team Extraction — Second Tasking',
  sentAt: '2306-05-10 08:45 UTC',
  trigger: 'mission_start',
  delivery: 'inbox_prompt',
  priority: CERES_INSTITUTE_MESSAGE_PRIORITY,
  folderId: 'ceres-institute-contract',
  folderLabel: 'Ceres Institute',
  body: [
    'Young pilot — another team. We do not abandon our own. The listing is on the kiosk.',
    'More psychosphere if your cargo allows.',
    '— Porter',
  ],
}

/** Ceres Institute contract step 5 — archive bunker final tasking. */
export const CERES_INSTITUTE_ARCHIVE_BUNKER_OFFER: ShipMessageDefinition = {
  id: 'ceres-institute-archive-bunker-offer',
  from: 'Dean Bernard Porter, Ceres Institute',
  subject: 'Archive Transmission — Final Tasking',
  sentAt: '2306-05-12 14:20 UTC',
  trigger: 'mission_start',
  delivery: 'inbox_prompt',
  priority: CERES_INSTITUTE_MESSAGE_PRIORITY,
  folderId: 'ceres-institute-contract',
  folderLabel: 'Ceres Institute',
  body: [
    'Young pilot — the bunker tasking is active. Site CIB-7. Clear the chimera presence, then approach the terminal.',
    'Please don\'t read the archive. It would only confuse you.',
    '— Porter',
  ],
}

/** Full message catalog for the current build. */
export const SHIP_MESSAGE_CATALOG: ShipMessageDefinition[] = [
  STARTUP_SELLER_MESSAGE,
  CONSORTIUM_CERTIFICATION_MESSAGE,
  JOVIAN_HEKTOR_PHOTOMETRY_OFFER,
  JOVIAN_SATURN_PHOTOMETRY_OFFER,
  JOVIAN_HEKTOR_DAN_OFFER,
  JOVIAN_SATURN_DAN_OFFER,
  JOVIAN_HEKTOR_PROSPECTUS_OFFER,
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
  FANTASIA_PIMP_MY_SHUTTLE_INTRO_MESSAGE,
  CERES_INSTITUTE_RESCUE_1_OFFER,
  CERES_INSTITUTE_MINERAL_ANALYSIS_OFFER,
  CERES_INSTITUTE_DAN_OFFER,
  CERES_INSTITUTE_RESCUE_2_OFFER,
  CERES_INSTITUTE_ARCHIVE_BUNKER_OFFER,
]
