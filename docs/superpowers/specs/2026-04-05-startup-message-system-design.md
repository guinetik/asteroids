# Startup Message System

**Date:** 2026-04-05  
**Status:** Draft

## Goal

Add a reusable in-game message system that can surface one message at a time over gameplay, persist dismissal in local storage, and support future quest/system-triggered messages without building an inbox UI yet. The first use of the system is the opening seller/dealership message shown when the player starts in Earth orbit in `MapView`.

## Context

The map view is now the player's real gameplay start state. The shuttle begins in Earth orbit with orbit/slingshot systems already active, and `F` already toggles cargo-bay inspection. The player is an older asteroid engineer who sold his home on the Moon, bought a refurbished shuttle, and now lives in the habitat carried by that shuttle. The opening message should feel like the first practical handoff note in the ship's onboard mail system, not a generic tutorial popup.

This pass should establish the message domain in `src/lib/` so future systems such as a quest director can trigger messages using the same API. Dismissed messages should be tracked and persisted, but there is no inbox, archive, or message history UI yet. Once dismissed, a message is effectively gone for now.

## Approach: Thin Domain, Single Active Dialog

Implement a small message subsystem in `src/lib/` that owns:
- static message definitions
- message status tracking
- local-storage persistence
- trigger evaluation
- active message selection

`MapView` becomes only a presenter. It asks the message system for the current active message and renders it as a single modal dialog layered over the live map. The dialog looks like the player double-clicked an email in a shipboard mail client: message header metadata, large readable body, and a dismiss action.

This keeps the domain reusable while avoiding premature inbox UI or broad notification architecture.

## Message Model

The message model should be deliberately small and future-friendly.

### Static Definition

Each message definition includes:
- `id` — stable unique key for persistence and future quest references
- `from` — sender display name
- `subject` — message subject line
- `sentAt` — lore-facing date/time string for display
- `body` — plain text or display-ready paragraphs
- `trigger` — symbolic trigger id or condition key
- `priority` — tie-break when multiple messages become available

### Runtime Status

Tracked message status includes:
- `pending` — eligible to appear but not yet shown
- `shown` — currently surfaced to the player
- `dismissed` — explicitly closed and should never reappear in this pass

### Persistence

Persist only the minimum runtime state needed:
- message `id`
- current `status`
- timestamps if useful for future debugging or inbox work

The definitions remain static in code; local storage stores state, not full message bodies.

## Triggering API

The message system should expose gameplay-facing methods rather than UI-specific ones.

Recommended responsibilities:
- load persisted state
- register or import static message definitions
- notify the system that a gameplay trigger occurred
- compute the highest-priority active message
- mark a message as shown
- dismiss a message and persist state

### First-Pass Trigger Shape

For this first message, use a simple symbolic trigger such as:
- `map_start_earth_orbit`

When `MapViewController` finishes initialization in its normal Earth-orbit start path, it can notify the message system of that trigger. The system then exposes the startup message as the current active message unless it was already dismissed in a previous session.

### Future Compatibility

The same API should be usable later by higher-level systems:
- quest director sends `missionAccepted`
- mission arrival sends `arrivedAtAsteroid`
- emergency systems send `distressSignalReceived`

The future quest director should not know anything about Vue dialogs or local storage. It should only signal gameplay events to the domain.

## Proposed Files

### New

| File | Purpose |
|------|---------|
| `src/lib/messages/messageTypes.ts` | TSDoc-documented interfaces, status enum/type, trigger ids |
| `src/lib/messages/messageCatalog.ts` | Static message definitions including the opening seller message |
| `src/lib/messages/messageStorage.ts` | Local-storage read/write helpers for persisted message state |
| `src/lib/messages/messageSystem.ts` | Main API for trigger notification, active message selection, and dismissal |
| `src/lib/messages/__tests__/messageSystem.spec.ts` | Focused unit tests for triggers and persistence |
| `src/components/ShipMessageDialog.vue` | Outlook-like message reader dialog |

### Modified

| File | Change |
|------|--------|
| `src/views/MapView.vue` | Render the active message dialog over the map scene |
| `src/views/MapViewController.ts` | Notify the message system when the start-of-game orbit state is established |
| `src/assets/css/main.css` | Add reusable utility classes for the dialog's NASA-meets-Vercel styling if needed |

## UI Behavior

The UI is a single modal dialog over the live map, not a feed, toast, or inbox.

### Presentation

Visual direction:
- ship-computer / mail-reader feel
- Outlook-like reading pane composition
- NASA console structure and labels
- Vercel-style restraint, glass, spacing, and typography polish
- practical industrial sci-fi, not flashy hologram fantasy

Expected visual structure:
- top chrome bar with shipboard system label
- metadata rows for `FROM`, `DATE`, and `SUBJECT`
- large readable message body
- subtle footer hint that this is a stored shipboard message
- single primary action: `Dismiss`

### Runtime Behavior

- If an active message exists, the dialog opens immediately over the map.
- The 3D map remains visible behind the dialog to preserve the feeling that the player is already in orbit.
- Dismissing the dialog immediately updates local storage.
- Once dismissed, the message does not return in this pass.
- If no active message exists, `MapView` behaves exactly as it does today.

### Input Behavior

- Mouse interaction with the dismiss button is sufficient for this pass.
- Optional `Escape` or `Enter` shortcuts are acceptable if they fit existing UI patterns, but are not required.
- There is no inbox access affordance, unread badge, or reopen action yet.

## First Message Content

The first message should come from the shuttle dealership manager or seller contact. The tone is blue-collar practical: not slick corporate copy, not jokey parody, and not military formalism. It should sound like a broker who has handed off plenty of old orbital hardware and knows the player bought this shuttle as a real home and working machine.

### Narrative Beats

The message should communicate:
- the handoff is complete and the player has been delivered from the Moon to the shuttle in Earth orbit
- shuttles no longer descend to planets because they are space-only semi-relativistic working vessels
- the cargo bay houses the player's lander and habitat, reinforcing that the shuttle is now both home and transport
- basic navigation expectations in plain language
- `F` opens/inspects the cargo bay
- slingshot travel is the practical way to move through the system without wasting fuel
- the overall tone of the world: buying used refurbished space hardware is normal, and competence matters more than glamour

### Suggested Content Shape

The body should likely be 4-6 short paragraphs:
1. handoff / congratulations / where the player is now
2. reminder that the shuttle stays in space and why
3. basic note on the cargo bay and `F`
4. practical explanation of orbit capture and slingshot behavior
5. sign-off from the dealership manager or seller

The copy should avoid over-explaining mechanics with abstract physics language. It should teach through practical operating advice.

## Domain Flow

First-start flow:

1. `MapViewController` initializes the normal Earth-orbit starting state.
2. It notifies the message system with `map_start_earth_orbit`.
3. The message system resolves the matching message as active if its status is not `dismissed`.
4. `MapView` receives the active message and renders `ShipMessageDialog`.
5. Player clicks `Dismiss`.
6. Message system marks it `dismissed` and persists state to local storage.
7. Dialog disappears and does not return on future loads.

## Testing

Tests should stay focused on the domain because the long-term risk is state logic, not the modal markup.

Recommended unit tests:
- a pending message becomes active when its trigger is notified
- the highest-priority eligible message is selected when multiple triggers fire
- dismissing a message persists dismissal in local storage
- a dismissed message does not reappear after system reload
- showing/dismissing one message does not mutate unrelated definitions

UI tests are optional unless there is already a clean pattern for component testing nearby. If one is added, keep it minimal: render active message metadata and verify dismissal emits/calls the expected action.

## Out of Scope

- inbox UI
- archived/saved message browser
- reply actions
- rich attachments
- quest journal integration
- multi-message queue UI
- sound effects, portraits, or animated mail transitions
- editing or authoring tools for message content

## Notes On Implementation Discipline

- Keep the message domain in `src/lib/` and decoupled from Vue.
- Document all exported types and functions with TSDoc.
- Prefer small, explicit interfaces over a broad event bus.
- Keep local-storage keys versionable so the system can evolve later without brittle migrations.
- Do not hardwire the message system to `MapView`; only the startup trigger is map-specific.
