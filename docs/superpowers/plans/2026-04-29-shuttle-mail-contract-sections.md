# Shuttle Mail Contract Sections Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the shuttle mail contract tab bar with an expandable grouped message list while preserving the existing right-side reader behavior.

**Architecture:** Add one framework-free helper in `src/lib/messages/` to derive folder section view models, then update `ShuttleControlProgramMail.vue` to render those sections in the existing left column. The message domain model remains unchanged because `MessageSystem` already exposes folders and per-folder rows.

**Tech Stack:** Vue 3 `<script setup>` + TypeScript, Vitest for the pure helper, Bun as the runner.

**Reference spec:** `docs/superpowers/specs/2026-04-29-shuttle-mail-contract-sections-design.md`

---

## File Structure

**Create:**

- `src/lib/messages/mailFolderSections.ts` — pure section builder for the mail UI
- `src/lib/messages/__tests__/mailFolderSections.spec.ts` — unit tests for section expansion and grouping

**Modify:**

- `src/components/shuttle-control/ShuttleControlProgramMail.vue` — replace tabs with expandable sections and wire section state

---

## Task 1 — Mail Folder Section Helper

**Files:**

- Create: `src/lib/messages/mailFolderSections.ts`
- Test: `src/lib/messages/__tests__/mailFolderSections.spec.ts`

- [ ] **Step 1.1 — Write the failing helper test**

Add tests proving the Inbox opens by default, explicitly expanded contract folders open, and the folder containing the selected row stays open.

- [ ] **Step 1.2 — Run the focused test**

Run: `bun test:unit src/lib/messages/__tests__/mailFolderSections.spec.ts`

Expected: FAIL because `mailFolderSections.ts` does not exist yet.

- [ ] **Step 1.3 — Implement the helper**

Create `buildMailFolderSections(input)` with documented exported types and constants. Do not mutate the input folders, rows, or expanded set.

- [ ] **Step 1.4 — Verify the focused test passes**

Run: `bun test:unit src/lib/messages/__tests__/mailFolderSections.spec.ts`

Expected: PASS.

## Task 2 — Shuttle Mail UI Sections

**Files:**

- Modify: `src/components/shuttle-control/ShuttleControlProgramMail.vue`

- [ ] **Step 2.1 — Replace selected-folder rows with section state**

Use `expandedFolderIds`, `rowsByFolderId`, `refreshRowsByFolder()`, and the helper-derived `sections`.

- [ ] **Step 2.2 — Replace the tab markup**

Render each folder as a section header in the left column, and render that folder's message rows under the header only when expanded.

- [ ] **Step 2.3 — Preserve selection behavior**

Keep `selectRow()` as the only message selection path, mark unread messages as shown, autoplay audio for user/deep-link selections, and keep the right reader unchanged.

- [ ] **Step 2.4 — Preserve deep-link behavior**

When `focusFolderId`/`focusMessageId` arrive, open the target folder and select the target message.

## Task 3 — Verification

**Files:**

- Check: `src/lib/messages/mailFolderSections.ts`
- Check: `src/lib/messages/__tests__/mailFolderSections.spec.ts`
- Check: `src/components/shuttle-control/ShuttleControlProgramMail.vue`

- [ ] **Step 3.1 — Run focused unit test**

Run: `bun test:unit src/lib/messages/__tests__/mailFolderSections.spec.ts`

- [ ] **Step 3.2 — Run type-check**

Run: `bun run type-check`

- [ ] **Step 3.3 — Run lint**

Run: `bun run lint`

- [ ] **Step 3.4 — Run full unit suite**

Run: `bun run test:unit`
