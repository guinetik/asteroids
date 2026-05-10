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
  subject: 'USC HARDWARE DROP — GRAVITY SURFING MODULE 2207-R-887',
  sentAt: '2306-04-09 12:10 UTC',
  trigger: 'mission_start',
  delivery: 'inbox_prompt',
  priority: CONSORTIUM_MESSAGE_PRIORITY,
  enqueueOnDismiss: ['marta-gravity-surfing-heads-up', 'jay-gravity-surfing-heads-up'],
  enqueueOnDismissDelaySeconds: 6,
  body: [
    'OPERATOR,',
    'Pursuant to activity logs flagged on your file by an associate of record (J. MERCER), the Consortium has approved one (1) GRAVITY SURFING MODULE for issue against your hull. Package is staged on a Class-C asteroid in the main belt; waypoint added to your active mission ledger.',
    'PICKUP PROCEDURE: fly the waypoint, drop the lander (F), walk to the marked container, and collect the sealed module on foot. Return to the shuttle.',
    'INSTALL PROCEDURE: open the shuttle inventory, locate GRAVITY SURFING MODULE, and press INSTALL. The module is non-functional in storage. Once installed, the SPACE FABRIC overlay will populate on the tactical map (M) — these grid lines have always existed; your hardware could not see them. Approach any line and press Q to couple, WASD to select rail, Q again to decouple.',
    'Field tampering with the package is non-permitted and will void the exception. The Consortium thanks you for your cooperation.',
    '— USC Logistics, Sol Sector',
  ],
}

/** Marta's warm follow-up after the USC hardware drop offer hits the inbox. */
export const MARTA_GRAVITY_SURFING_HEADS_UP: ShipMessageDefinition = {
  id: 'marta-gravity-surfing-heads-up',
  from: 'Marta Vale, Vale Orbital Refurb',
  subject: 'Baby — That USC Letter Is A Big Deal',
  sentAt: '2306-04-09 12:18 UTC',
  trigger: 'gravity_surfing_offer_followup_scripted',
  delivery: 'inbox_prompt',
  priority: CONSORTIUM_MESSAGE_PRIORITY,
  body: [
    'Hey handsome, Marta here.',
    "I saw the USC notice come through the relay. I'm proud of you. Pilots wait years for one of those modules and you got one your second month out. Jay must've put your name forward the day you signed the shuttle papers.",
    "Here's what they didn't say in plain words, because Logistics never does: the Gravity Surfing Module is how you stop fighting the map. Right now you're burning fuel like every shuttle does. After you install it, you ride the spacetime grid for free. I can't sell you a fuel tank that competes with that.",
    "Go pick it up. Drop the lander on the asteroid, walk over, grab the box, fly it home. Then OPEN INVENTORY and press INSTALL. Don't leave it sitting in your hold like the boys who came through here last spring. They thought it was a souvenir.",
    "Stop by Earth when you're done. I'll have the latte ready.",
    '— Marta',
  ],
}

/** Jay's translation of the USC bureaucratese, chained off the offer dismiss. */
export const JAY_GRAVITY_SURFING_HEADS_UP: ShipMessageDefinition = {
  id: 'jay-gravity-surfing-heads-up',
  from: 'Jay Mercer',
  subject: 'I Vouched For You. Don\'t Sit On That Box.',
  sentAt: '2306-04-09 12:21 UTC',
  trigger: 'gravity_surfing_offer_followup_scripted',
  delivery: 'inbox_prompt',
  priority: JAY_MESSAGE_PRIORITY,
  body: [
    'Hey, you got Jay.',
    "USC writes letters like they're paid by the form number. Here's the human version: I put your name in months ago. They almost laughed me off the call — Class-C shuttle, retrofitted hull, indie operator. Then they pulled your contract numbers and stopped laughing.",
    "What they sent you is the GRAVITY SURFING MODULE. Milspec. It lights up the spacetime grid lines on your tactical map (M). Those lines have been there the whole time — your nav couldn't see them without the hardware. Once it's in, you stop burning fuel to cross the system. You ride the rails.",
    "Pickup is the easy part — drop the lander on the asteroid, EVA over, grab the box. The part people screw up is the install. It is NOT automatic. Open your shuttle inventory, find the module, press INSTALL. Until you do that, your map looks the same as it did yesterday.",
    "Press Q near a glowing grid line to couple. WASD picks the rail. Q again drops you off, anywhere. Costs nothing. The grid does the work.",
    "Don't make me regret the referral.",
    '— Jay',
  ],
}

/**
 * Marta's check-in after the player finishes the onboarding journey — she never names the cat,
 * just calls in the promise the player made before she'd hand over the keys.
 */
export const MARTA_CAT_CARE_CHECKIN: ShipMessageDefinition = {
  id: 'marta-cat-care-checkin',
  from: 'Marta Vale, Vale Orbital Refurb',
  subject: "How's My Little Guy Doing?",
  sentAt: '2306-04-12 09:30 UTC',
  trigger: 'welcome_journey_completed_scripted',
  delivery: 'inbox_prompt',
  priority: STARTUP_MESSAGE_PRIORITY,
  body: [
    'Hey handsome, Marta here.',
    "Quick check-in. I'm not asking about the shuttle — I'm asking about him. You remember the deal. I don't sell hulls to people who can't be trusted with a cat. You looked me in the eye and promised. So.",
    "Three meters to watch on him: love, hunger, and tired. Pet him and play with him so the love bar stays up. Keep his bowl filled or hunger drops and he gets cranky. And don't forget the litterbox — clean it out before it overflows or he'll boycott the thing and follow you around the habitat trying to make a point.",
    "When he's happy, he keeps to himself in the habitat — naps, wanders, does cat business. When something's off, he'll start trailing you wherever you go. That's him telling you, not asking.",
    "Cat food only sells reliably at Earth orbit at sane prices. Stock up before you push out. And listen — if you Rewind, your cargo is gone. Hull comes back, fuel comes back, the bags in your hold do not. So don't push your luck on a half-empty pantry.",
    "Take care of him and he'll take care of you. That's how it works.",
    '— Marta',
  ],
}

/** Jay's celebration delivered the moment the player presses INSTALL on the module. */
export const JAY_GRAVITY_SURFING_INSTALLED: ShipMessageDefinition = {
  id: 'jay-gravity-surfing-installed',
  from: 'Jay Mercer',
  subject: 'You Got The Grid License',
  sentAt: '2306-04-10 07:02 UTC',
  trigger: 'gravity_surfing_installed_scripted',
  delivery: 'inbox_prompt',
  priority: JAY_MESSAGE_PRIORITY,
  body: [
    'Hey, you got Jay.',
    "So the Consortium actually signed off on your hull. I put your name in months ago and figured they'd laugh at the application. A Class-C shuttle running field contracts — most of those certification officers haven't seen one outside a museum.",
    "The module they sent is milspec. It locks onto the spacetime fabric lines your nav system already projects — except your nav couldn't project them before the coupler was installed. You've been flying blind this whole time. Welcome to the grid.",
    "Open your tactical map (M). The SPACE FABRIC overlay is live now. Press Q near a glowing grid line to couple. WASD to pick your rail. Q again to decouple — fast stop, wherever you are. It drinks no fuel. The grid does the work.",
    "The heat and cryo kits bundled in are USC's way of saying 'do not immediately die trying to reach Saturn.' You're welcome.",
    'Don\'t make me regret the referral.',
    '— Jay',
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

/** Finch Step 1 — Saturn telescope offer. */
export const FINCH_SATURN_TELESCOPE_OFFER: ShipMessageDefinition = {
  id: 'finch-recovery-saturn-telescope-offer',
  from: 'Mr. Finch, Saturn Ringside Estate',
  subject: 'Step 1 — She Has Not Yet Been Seen',
  sentAt: '2306-05-19 09:00 UTC',
  trigger: 'mission_start',
  delivery: 'inbox_prompt',
  priority: 80,
  folderId: 'finch-recovery',
  folderLabel: 'Mr. Finch',
  body: [
    '[bored] Young pilot,',
    "The photograph is in your secure inbox; the EVA listing is on the Saturn ringside spaceport board, posted under my name. The telescope — long-baseline, calibrated for horizon detail — is at the listed site.",
    "Tune the long-baseline telescope until our Madame's surroundings resolve. I am told the relevant detail is the horizon. I am told you will know it when you see it.",
    '— Finch',
  ],
}

/** Finch Step 3 — Mars bunker offer. */
export const FINCH_MARS_BUNKER_OFFER: ShipMessageDefinition = {
  id: 'finch-recovery-mars-bunker-offer',
  from: 'Mr. Finch, Saturn Ringside Estate',
  subject: 'Step 3 — A Trail at Mars',
  sentAt: '2306-05-22 11:30 UTC',
  trigger: 'mission_start',
  delivery: 'inbox_prompt',
  priority: 80,
  folderId: 'finch-recovery',
  folderLabel: 'Mr. Finch',
  body: [
    'Young pilot,',
    'Mars confirms the trail. Our Madame appears to have used an abandoned Marines training bunker as a transfer point — local intelligence indicates the site is overrun and effectively forgotten by the Corps.',
    'Clear what is in the bunker. Recover what she left in it.',
    '— Finch',
  ],
}

/** Finch Step 5 — Venus telescope offer. */
export const FINCH_VENUS_TELESCOPE_OFFER: ShipMessageDefinition = {
  id: 'finch-recovery-venus-telescope-offer',
  from: 'Mr. Finch, Saturn Ringside Estate',
  subject: 'Step 5 — A Floor Camera at Venus',
  sentAt: '2306-05-26 13:18 UTC',
  trigger: 'mission_start',
  delivery: 'inbox_prompt',
  priority: 80,
  folderId: 'finch-recovery',
  folderLabel: 'Mr. Finch',
  body: [
    '[amused] Young pilot,',
    'The fence — was — at the Zeppelin Exchange. The floor cameras at that establishment are real and they captured a transaction. The horizon, again, is the matter of interest.',
    'Tune your knobs.',
    '— Finch',
  ],
}

/** Finch Step 7 — Earth telescope offer. */
export const FINCH_EARTH_TELESCOPE_OFFER: ShipMessageDefinition = {
  id: 'finch-recovery-earth-telescope-offer',
  from: 'Mr. Finch, Saturn Ringside Estate',
  subject: 'Step 7 — A Posed Photograph at Earth',
  sentAt: '2306-05-30 16:42 UTC',
  trigger: 'mission_start',
  delivery: 'inbox_prompt',
  priority: 80,
  folderId: 'finch-recovery',
  folderLabel: 'Mr. Finch',
  body: [
    '[amused] Young pilot,',
    'The Earth image is from a private gallery. The composition is the composition of someone who is now aware she is being followed and has decided to make a study of the matter.',
    'Tune the image. The destination is in the photograph. She placed it there.',
    '— Finch',
  ],
}

/** Finch Step 9 — Ceres bunker offer. */
export const FINCH_CERES_BUNKER_OFFER: ShipMessageDefinition = {
  id: 'finch-recovery-ceres-bunker-offer',
  from: 'Mr. Finch, Saturn Ringside Estate',
  subject: 'Step 9 — A Letter at Ceres',
  sentAt: '2306-06-04 08:50 UTC',
  trigger: 'mission_start',
  delivery: 'inbox_prompt',
  priority: 80,
  folderId: 'finch-recovery',
  folderLabel: 'Mr. Finch',
  body: [
    'Young pilot,',
    'Ceres. An exhausted nickel-platinum operation, decommissioned in the early colonization era, never properly sealed. Our Madame appears to favor the sites that no one is paying to remember.',
    'What you find at the end is for you. I have asked for nothing from this stop except that you survive it.',
    '— Finch',
  ],
}

/** Finch Step 11 — Neptune bunker offer (final). */
export const FINCH_NEPTUNE_BUNKER_OFFER: ShipMessageDefinition = {
  id: 'finch-recovery-neptune-bunker-offer',
  from: 'Mr. Finch, Saturn Ringside Estate',
  subject: 'Step 11 — Neptune, End of the Trail',
  sentAt: '2306-06-09 19:24 UTC',
  trigger: 'mission_start',
  delivery: 'inbox_prompt',
  priority: 80,
  folderId: 'finch-recovery',
  folderLabel: 'Mr. Finch',
  body: [
    'Young pilot,',
    'Neptune. The end of the trail. The brief, again, is recovery. Anything beyond that is between you and her.',
    'When you are finished, return to Saturn. I shall have the closeout ready.',
    '— Finch',
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

/** Carmen's recruitment letter, delivered ~10s after returning to /map post-Finch. */
const CARMEN_FOLLOWUP_PRIORITY = 47

/** Stable id for Carmen's first post-Finch letter, used by the scripted dispatcher. */
export const CARMEN_FINCH_FOLLOWUP_MESSAGE_ID = 'carmen-finch-followup-001'

/**
 * Carmen's first message after the Finch contract closes. Apologizes for the
 * theft, names the Neptune commune, invites the player up, lets slip that
 * Mr. Finch has more to say through the network if the player keeps listening.
 *
 * Delivered via {@link MessageSystem.enqueueById} ~10s after the player
 * returns to the map screen with the Finch contract complete and this
 * message not yet sent.
 */
export const CARMEN_FINCH_FOLLOWUP_MESSAGE: ShipMessageDefinition = {
  id: CARMEN_FINCH_FOLLOWUP_MESSAGE_ID,
  from: 'Carmen Sedna-Deimos · Neptune Commune',
  subject: 'Sorry About The Bunker',
  sentAt: '2306-06-02 09:41 UTC',
  trigger: 'carmen_finch_followup_scripted',
  delivery: 'inbox_prompt',
  priority: CARMEN_FOLLOWUP_PRIORITY,
  body: [
    "Hi. I'd say it's nice to finally meet you, except — we haven't, technically. I was on a couch eating dumplings while you were doing the cardio.",
    "First — sorry about the bunker. The wave count was for me, not you. I needed to know whether the pilot Mr. Finch picked was the kind who quits at Mars, the kind who flips at Venus when Lucas waves money around, or the kind who just keeps showing up. You kept showing up. I owe you a drink for that. Possibly several.",
    "Second — I kept the cash. Recovery fee. He can afford it; he's been compounding for two centuries and he still buys the same brand of tea. The device is whole. He'll know.",
    "Now the awkward part. I run procurement for a research commune on Neptune. We grow vegetables that have never seen Earth and print proteins from feedstock the inner system would throw away. I steal from people who can spare it so the council doesn't have to ask Jupiter for anything. That's the whole pitch. We're nice. We're tired. We could use someone with your reflexes.",
    "Come up to Neptune when you've got time. There's work. There's also a piece of mobility tech in storage I think you'd enjoy — I'll send the coordinates separately so it doesn't read like a bribe. (It is a bribe. A small one.)",
    "Last thing, and you didn't hear this from me. Mr. Finch is older than he looks. A lot older. Long before he was Mr. Finch he wrote things down — letters, notes, journal pages — and he tucked those into encrypted caches on Deep Space Network satellites. They've been drifting out there for a century plus. They just *exist*, on the relays, dormant.",
    "I hooked a small piece of software into your suit on the way out. Call it malware if it makes you feel better — I do. Next time you take an EVA contract that puts you on a DSN satellite, it'll quietly scan the cache and pull whatever entry it finds back to your inbox. One signal per satellite. No subscription, no opt-in form. If you don't service any satellites, you won't see any of it, and that's fine. He'll never know either way.",
    "I won't tell you what's in them. I read enough to know I'd rather not be the one introducing him. He'll do that himself, in pieces, in his own voices. Just — if you do start picking up the signals, read them slowly. The earliest ones especially.",
    "You're fun. That's not nothing. Come find me.",
    "— C.",
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
    'Young pilot — the rescue listing is on the kiosk. Bring them in; we will see them recovered at the station.',
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
    'Young pilot — another team. We do not abandon our own. They will be in our care from the moment you bring them in.',
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
    'Young pilot — the bunker tasking is active. Site CIB-7. Specimens are on the floor; their designations are on file. Clear them, then approach the terminal.',
    'Please don\'t read the archive. It would only confuse you.',
    '— Porter',
  ],
}

/** Full message catalog for the current build. */
export const SHIP_MESSAGE_CATALOG: ShipMessageDefinition[] = [
  STARTUP_SELLER_MESSAGE,
  CONSORTIUM_CERTIFICATION_MESSAGE,
  MARTA_GRAVITY_SURFING_HEADS_UP,
  JAY_GRAVITY_SURFING_HEADS_UP,
  JAY_GRAVITY_SURFING_INSTALLED,
  MARTA_CAT_CARE_CHECKIN,
  JOVIAN_HEKTOR_PHOTOMETRY_OFFER,
  JOVIAN_SATURN_PHOTOMETRY_OFFER,
  JOVIAN_HEKTOR_DAN_OFFER,
  JOVIAN_SATURN_DAN_OFFER,
  JOVIAN_HEKTOR_PROSPECTUS_OFFER,
  FINCH_SATURN_TELESCOPE_OFFER,
  FINCH_MARS_BUNKER_OFFER,
  FINCH_VENUS_TELESCOPE_OFFER,
  FINCH_EARTH_TELESCOPE_OFFER,
  FINCH_CERES_BUNKER_OFFER,
  FINCH_NEPTUNE_BUNKER_OFFER,
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
  CARMEN_FINCH_FOLLOWUP_MESSAGE,
  CERES_INSTITUTE_RESCUE_1_OFFER,
  CERES_INSTITUTE_MINERAL_ANALYSIS_OFFER,
  CERES_INSTITUTE_DAN_OFFER,
  CERES_INSTITUTE_RESCUE_2_OFFER,
  CERES_INSTITUTE_ARCHIVE_BUNKER_OFFER,
]
