# Contracts & Messages Revoice — Design

**Date:** 2026-05-03
**Status:** Approved by user, ready for plan-writing
**Voice authority:** `docs/inspo/npc-voice-bible.md`

---

## Goal

Rewrite every contract briefing, in-game message body, and mission-giver briefing string against the NPC voice bible — except the three messages that already have recorded VO. Weave gameplay incentives into the prose using selective peer references (P2), so that doing one contract makes others feel more present in the world.

## Background

A prior plan (`2026-05-02-mission-tip-budget`) revoiced the runtime visor tips and three giver tip overrides against the same voice bible. That work proved the voice rules and exposed the canonical bindings: Jay is "Hey, you got Jay" with closing joke; Vance is **Holroyd, Senior Asset Officer** (not "Hoyt, Asset Strategy"); Finch is Halloran's working alias with em-dash-heavy archaic prose; institutional dispatches stay clipped and role-coded.

The remaining ~50 prose blocks across contracts and messages are the next pass.

## Out of Scope

- Authoring net-new messages (rewrite-only).
- Mission tip JSON (already done).
- VO recording. The plan produces VO-ready text but does not record audio.
- Schema changes. Pure data-revision; if a schema gap is found, surface it as a separate concern.
- Carmen Sedna-Deimos (Act 3 — no current prose to rewrite).

## Excluded — already voiced

These three messages have recorded mp3s and must remain byte-identical to pre-plan state:

| Message id | VO file |
|---|---|
| `seller-welcome-earth-orbit` | `/sound/marta-001.mp3` |
| `jay-so-you-actually-did-it` | `/sound/jay-001.mp3` |
| `jay-first-slingshot-contracts` | `/sound/jay-002.mp3` |

A grep check at the acceptance gate confirms their bodies are untouched.

---

## Voice Rules (binding every task)

1. **Voice bible is canon.** One quirk per character — no stacking. Existing copy that violates the bible (wrong name, wrong title, wrong register) is corrected.
2. **P2 weaving — selective peer references only.** A character may mention another character's contract or leverage *only when it fits their voice*. Drop references that don't sound like that character would actually say it. Marta does not list contracts. The USC officer does not pitch Lucas Maverick.
3. **Mechanics by implication, not by quest log.** Reward values, fast-travel unlocks, and payout multipliers are alluded to, not itemized. "Two-times payout" → "Earth pays double when you wear our handler ID." "Fast-travel unlock" → "after this, the lane is yours."
4. **Mechanical accuracy where cited.** When prose names a number (e.g. "an eight-second hold"), the value matches the actual minigame config. Same bar as the prior tip plan.
5. **ElevenLabs VO tags preserved.** Inline tags like `[warm]`, `[laughs]`, `[sighs]`, `[pause]` are kept consistent with existing voiced messages so future VO recording does not need a second pass. Each per-character task seeds 1–3 tags appropriate to that voice.
6. **No new exports / no schema changes.** JSON schemas stay identical. Structural questions are surfaced as out-of-scope and copy proceeds.

---

## Scope of Edits

### Contracts (full depth — D3)
All 7 files in `src/data/contracts/*.json`. Every layer:
- `introBody[]` — briefing on accept.
- `steps[].subject` — title shown during each objective phase.
- `steps[].flavor[]` — paragraphs shown during each objective phase.
- `completionBody[]` — outro message on completion.

### Messages
16 of the 19 entries in `src/lib/messages/messageCatalog.ts` (the three voiced ones excluded). Every `subject` and `body[]`.

### Giver briefings
All 10 files in `src/data/missions/givers/*.json`. Every `briefing` string and any speaker-prose fields (taglines, descriptions if shown to the player).

---

## Per-Character Task Breakdown (S1 — by speaker)

One task per voice. Order recommended; lower-risk voices first.

| # | Speaker | Files touched | Approx. prose blocks |
|---|---|---|---|
| **T0** | **USC Officer** | `contracts/usc-venus-certification.json`, message `consortium-certification-offer` | ~14 |
| **T1** | **Jay Mercer** | `contracts/space-cowboys-mars-hq.json`, `givers/jay-mercer.json`, 6 Jay messages (`jay-contract-incoming`, `jay-distance-from-earth`, `jay-thruster-message`, `jay-brake-system-warning`, `jay-mission-start-lander-reminder`, `jay-venus-orbit-warning`) | ~22 |
| **T2** | **Cmdte. Sampaio** | `contracts/martian-marine-corps-cohort.json`, `givers/martian-marines-bunker.json`, message `sampaio-mmc-contract-heads-up` | ~15 |
| **T3** | **Lucas Maverick** | `contracts/venusian-zeppelin-trade-loop.json`, `givers/lucas-maverick.json` | ~14 |
| **T4** | **Cinderline** | `contracts/the-cinderline.json`, `givers/cinderline.json` | ~13 |
| **T5** | **Vance Holroyd** | `contracts/jovian-society-prospection.json`, `givers/jovian-society.json`, `givers/cloud-city-ops.json`, 5 Jovian messages (Hektor/Saturn photometry, DAN, prospectus) | ~22 |
| **T6** | **Halloran / Finch** | `contracts/finch-recovery.json`, `givers/mr-finch.json` | ~14 |
| **T7** | **Marta Vale** | Any Marta-voiced prose other than `seller-welcome-earth-orbit` (the voiced intro) — discovery happens at plan-write time; if the corpus has none, the task ships empty and is dropped from the index. | ~3 |
| **T8** | **Fantasia Mira-Io** | message `fantasia-pimp-my-shuttle-intro` plus any Fantasia-attributed prose discovered at plan-write time. | ~3 |
| **T9** | **Viroid Envoy** | messages `viroid-envoy-initial-contact`, `viroid-envoy-ceres-rendezvous` | ~4 |
| **T10** | **Final acceptance gate** | None — runs full gate, smoke-tests in browser, voice spot-check | — |

**Institutional voices** (Frontier Rescue / Colonial Guard / Mission Control / Consortium Dispatch) get a short revoice pass folded into the task that owns the giver file where they appear (typically T1 Jay or T2 Sampaio's neighbours), since none owns a contract and they are not characters with quirks.

---

## Per-Task Template

Each character task uses this five-block shape (same density as Task 0 of the prior tip plan):

1. **Voice anchor** — quote 2–3 lines from `npc-voice-bible.md` for that character at the top of the task.
2. **P2 weaving plan** — one short bullet list of which peer references this character will make and why each fits. Empty bullet list ("no P2 hooks for this voice") is acceptable and should be documented.
3. **Mechanics inventory** — brief list of in-game mechanics this character's prose touches, with numbers looked up at plan-write time and cited so the rewriter does not have to chase them.
4. **Steps** — one step per file or logical block, each providing the literal new JSON/TS string verbatim.
5. **Per-task gate** — `bun run type-check` (catches accidental JSON breakage), any targeted unit-test run if a spec asserts on that file's strings, then commit with `feat(copy): revoice <character>`.

---

## Acceptance Gate (Task T10)

- `bun run type-check && bun run lint && bun run test:unit` — all green (0 errors, 0 warnings, all specs pass).
- **VO-protect check:** grep confirms the three voiced message bodies are byte-identical to pre-plan.
- **Manual smoke:** `bun dev`. Fire one Act-1 contract briefing in the in-game message UI; confirm the new prose renders. Verify the existing pipeline's handling of inline `[VO tags]` (the voiced messages today contain them, so the answer is observable) and confirm rewritten messages match that behavior.
- **Voice spot-check:** pick three random rewritten blocks (one Jay, one Vance, one institutional). Read aloud. Confirm each sounds like its character.

---

## Risks & Mitigations

- **Voice drift across tasks.** Each task starts fresh and could drift from earlier work. Mitigation: voice-anchor block at the top of every task quotes the bible verbatim.
- **Mechanic claims become stale.** A reward value cited in prose could be tuned later in the gameplay config. Mitigation: prefer implication ("the lane is yours") over numbers wherever possible; when a number must appear, cite it from the live config at plan-write time and accept that it pins the prose.
- **VO regressions.** Accidentally editing a voiced message would invalidate the recorded mp3. Mitigation: explicit grep at the acceptance gate; per-task scope lists do not include the three excluded ids.
- **Plan size.** ~50 prose blocks across 10 voices is a lot. Mitigation: per-character slicing means each task is self-contained and can ship independently.
