# Shuttle Mail Contract Sections Design

> Spec for replacing the shuttle mail contract tabs with expandable contract sections.
> Authored 2026-04-29.

## Overview

`ShuttleControlProgramMail.vue` currently uses a horizontal tab bar where each
mail folder, including each contract folder, is a separate tab. As more
contracts are added, the tab row will overflow and make active contract mail
harder to scan.

The mail program will keep the existing two-column reader layout, but the left
column becomes the complete message browser. Each folder renders as a clickable
section header. Expanding a section shows that folder's messages below it.
Multiple sections may stay open at the same time, so players can see one
continuous message list divided by contract.

## Behavior

- The top tab bar is removed.
- The left column renders all folders returned by `MessageSystem.listFolders()`.
- Each folder header shows the folder label, delivered message count, and unread
  count when present.
- Clicking a folder header toggles that section open or closed.
- Multiple folder sections can remain open.
- Clicking a message selects it and renders the existing reader on the right.
- Empty expanded folders show the existing empty-state copy.
- Deep links through `focusFolderId` and `focusMessageId` open the target folder
  and select the target message.
- The Inbox section is open by default. Any folder containing the selected
  message is kept open.

## Architecture

The domain message system already provides the needed primitives:

- `listFolders()` returns the visible folders and unread counts.
- `listInboxRows(folderId)` returns rows for one folder.
- `getReadableShipMessage(id)` drives the reader.

The component will use a small pure helper in `src/lib/messages/` to build
folder sections from folders, per-folder rows, expanded folder ids, and the
selected message id. Keeping this logic outside the Vue component makes the
grouping behavior easy to unit test and keeps the component rendering-focused.

## Components

### New — `src/lib/messages/mailFolderSections.ts`

Exports `buildMailFolderSections(input)`, which returns one section per folder:

- `folder` — the original `ShipMessageFolder`.
- `rows` — the folder's `ShipMessageInboxRow[]`.
- `isExpanded` — true when the folder is explicitly expanded, is the default
  inbox, or contains the selected message.
- `containsSelectedMessage` — true when one row id matches the selected id.

### Updated — `src/components/shuttle-control/ShuttleControlProgramMail.vue`

- Replace `selectedFolderId`/single `rows` list with:
  - `expandedFolderIds: Set<string>`
  - `rowsByFolderId: Record<string, ShipMessageInboxRow[]>`
  - `sections = buildMailFolderSections(...)`
- Replace the tab template with section headers inside the left column.
- Keep `selectRow`, `dismissSelected`, `acceptContract`, `declineContract`,
  audio autoplay, and reader rendering behavior intact.
- Deep-link watcher opens the target folder and selects the target message.

## Testing

- Add unit tests for `buildMailFolderSections`.
- Verify the focused helper test fails before implementation, then passes.
- Run `bun run type-check`, `bun run lint`, and `bun run test:unit` before
  completion when practical.
