# Pimp My Shuttle Shop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the model-first Pimp My Shuttle! cosmetic shop with Fantasia Mira-Io intro messaging,
premium trade-good intake, profile persistence, Pinia state, and magenta Vue UI. Do not integrate
Three.js materials, GLB model changes, or rendered vehicle cosmetics in this pass.

**Architecture:** Keep catalog, pricing, purchase, migration, and premium trade math in pure
`src/lib/cosmetics/`. Let map facades/controllers own orbit eligibility and visit sessions. Let
Pinia/Vue bind state and persist profile changes through existing player/profile storage.

**Spec:** `docs/superpowers/specs/2026-04-30-pimp-my-shuttle-shop-design.md`

**Tech Stack:** Vue 3, TypeScript, Pinia, Vitest, existing player profile, inventory, shop, and
message systems.

---

### Task 0: Fantasia Image Pipeline

**Files:**
- Source: `image/fantasia.png`
- Source: `image/portraits/fantasia.png`
- Generated: `public/fantasia.webp`
- Generated: `public/portraits/fantasia.webp`
- Existing script: `scripts/build-textures.mjs`

- [ ] Confirm `image/fantasia.png` and `image/portraits/fantasia.png` exist.
- [ ] Run `bun run textures:build` so the image pipeline emits `public/fantasia.webp` and
      `public/portraits/fantasia.webp`.
- [ ] Keep generated `.webp` files checked in with the feature.
- [ ] Do not hand-copy or manually rename pipeline output.

### Task 1: Cosmetic Catalog Data

**Files:**
- Create: `src/data/cosmetics/pimp-my-shuttle.json`
- Create: `src/lib/cosmetics/types.ts`
- Create: `src/lib/cosmetics/catalog.ts`
- Test: `src/lib/cosmetics/__tests__/catalog.spec.ts`

- [ ] Add data for shop metadata, eligible planets (`mars`, `jupiter`, `saturn`), premium trade
      tuning, and all cosmetic options.
- [ ] Include exactly 6 shuttle paintjobs, 4 lander paintjobs, 3 shuttle trails, 3 lander trails,
      3 multitool paintjobs, 1 shuttle-title service, and a compact flag list.
- [ ] Give every shader-like option a cool display name and `gradientStops`.
- [ ] Implement catalog validation for unique ids, valid categories, positive prices, valid
      hex-like gradient strings, and eligible planet ids.
- [ ] Write failing tests for catalog counts, prices, eligible planets, and malformed-option
      validation.
- [ ] Run `bun test:unit src/lib/cosmetics/__tests__/catalog.spec.ts --run` and confirm the new
      tests fail before implementation, then pass after implementation.

### Task 2: Profile Cosmetics Persistence

**Files:**
- Modify: `src/lib/player/types.ts`
- Modify: `src/lib/player/profile.ts`
- Modify: `src/stores/player.ts` if a focused profile setter is needed
- Create: `src/lib/cosmetics/profileCosmetics.ts`
- Test: `src/lib/cosmetics/__tests__/profileCosmetics.spec.ts`
- Test: update `src/lib/player/__tests__/profile.spec.ts` if needed

- [ ] Add `PlayerCosmetics` and optional `PlayerProfile.cosmetics`.
- [ ] Implement `createDefaultPlayerCosmetics()` with stable default ids from the catalog.
- [ ] Migrate legacy saves in `normalizeLoadedProfile()` by adding defaults when `cosmetics` is
      absent or malformed.
- [ ] Preserve existing profile fields during migration: credits, journeys, hull HP, contract
      rewards, disabled givers, and body access.
- [ ] Add helpers for ownership checks, active option lookup, and shuttle-title normalization.
- [ ] Normalize shuttle titles by trimming, collapsing whitespace, rejecting empty input, and
      capping at 24 visible characters.
- [ ] Add tests for fresh profiles, legacy save migration, malformed cosmetic save recovery, and
      title normalization.

### Task 3: Cosmetic Purchase and Apply Rules

**Files:**
- Create: `src/lib/cosmetics/purchase.ts`
- Test: `src/lib/cosmetics/__tests__/purchase.spec.ts`

- [ ] Implement `purchaseCosmeticOption(profile, optionId)`.
- [ ] Implement `applyOwnedCosmetic(profile, optionId)`.
- [ ] Implement `purchaseShuttleTitle(profile, rawTitle)`.
- [ ] Ensure first-time option purchase spends catalog CR, records lifetime credits spent through
      `spendCredits`, records ownership, and applies the option.
- [ ] Ensure already owned inactive options apply for free.
- [ ] Ensure active options return `already-active` without spending.
- [ ] Ensure insufficient credits and invalid ids leave profile unchanged.
- [ ] Ensure title changes always cost 5000 CR when the normalized value is different.
- [ ] Add tests for every result reason and for each category's active profile field.

### Task 4: Premium Trade Intake

**Files:**
- Create: `src/lib/cosmetics/premiumTrade.ts`
- Test: `src/lib/cosmetics/__tests__/premiumTrade.spec.ts`

- [ ] Implement `createPremiumTradeSession(planetId)` with one randomized multiplier per orbit
      visit, using catalog `visitMargin.minMultiplier` and `visitMargin.maxMultiplier`.
- [ ] Implement `computePremiumSellPrice(session, itemId)` by wrapping existing
      `computeSellPrice()` from `src/lib/shop/planetDemand.ts`.
- [ ] Implement `getPremiumDesirabilityPips(session, itemId)` by wrapping existing
      `getDesirabilityPips()` and adding catalog `minimumPipBonus`, capped at 5.
- [ ] Implement `sellPremiumTradeGood()` using existing inventory removal and profile credit
      helpers.
- [ ] Accept trade goods by default. Leave minerals on normal yellow-shop behavior unless the
      catalog explicitly includes them later.
- [ ] Add tests that premium prices are always above normal prices, premium pips are at least
      normal + 2 capped at 5, the visit multiplier is stable, inventory is removed, credits are
      added, and trade earnings are recorded.

### Task 5: Fantasia Intro Message

**Files:**
- Add or modify message data under the existing message catalog/data location
- Modify: relevant `src/lib/messages/` trigger/catalog files
- Modify: `src/lib/messages/mailAuthorPortraits.ts`
- Modify: map orbit arrival integration point in `src/views/MapViewController.ts` or an existing
  map message facade
- Test: add/update focused message tests under `src/lib/messages/__tests__/`

- [ ] Add Fantasia Mira-Io as message author/sender if the catalog requires explicit sender data.
- [ ] Add `fantasia-pimp-my-shuttle-intro` message with subject, body, and eligible planets from
      the spec.
- [ ] Add exact sender portrait mapping:
      `'Fantasia Mira-Io': '/portraits/fantasia.webp'`.
- [ ] Trigger the intro once when the player first enters orbit at Mars, Jupiter, or Saturn.
- [ ] Persist that the message has been sent so it does not repeat across eligible planets.
- [ ] Do not block shop access on message read state.
- [ ] Add tests for Mars/Jupiter/Saturn triggering, Earth/Venus not triggering, and no repeat after
      the message has already been sent.
- [ ] Add or update portrait resolver coverage so Fantasia's message renders
      `public/portraits/fantasia.webp` in the inbox list and reader.

### Task 6: Pinia Cosmetics Store

**Files:**
- Create: `src/stores/cosmetics.ts`
- Modify: `src/stores/player.ts` if needed for profile replacement/persistence
- Test: optional focused store tests if local store patterns exist

- [ ] Add computed active cosmetics, ownership helpers, and affordability helpers.
- [ ] Add actions for `buyOption`, `applyOption`, `renameShuttle`, and `sellPremiumTradeGood`.
- [ ] Persist updated profile through existing `saveProfile()` path.
- [ ] Keep orbit eligibility and premium session creation out of the store.
- [ ] Keep the store as a thin wrapper around pure `src/lib/cosmetics` functions.

### Task 7: Map Facade and Controller Wiring

**Files:**
- Create: `src/lib/map/shop/MapCosmeticShopFacade.ts`
- Test: `src/lib/map/shop/__tests__/MapCosmeticShopFacade.spec.ts`
- Modify: `src/lib/defaultBindings.ts`
- Modify: `src/views/MapViewController.ts`
- Modify: `src/views/MapView.vue`

- [ ] Add `cosmeticShopAction` default binding on `KeyP`.
- [ ] Track cosmetic shop availability only while orbiting eligible planets.
- [ ] Create one `PremiumTradeSession` when entering eligible orbit and preserve it while the
      player remains in that orbit.
- [ ] Clear dialog state and premium session when leaving orbit.
- [ ] Emit button and dialog state to `MapView.vue`.
- [ ] Open/close the cosmetic dialog without affecting the existing yellow trade shop session.
- [ ] Add facade tests for eligible/ineligible orbit, stable visit session, leaving orbit, and
      reopening during the same orbit.

### Task 8: Magenta Shop UI

**Files:**
- Create: `src/components/shop/CosmeticShopButton.vue`
- Create: `src/components/shop/PimpMyShuttleDialog.vue`
- Modify: `src/assets/css/main.css`
- Modify: `src/views/MapView.vue`

- [ ] Render a separate magenta `Pimp My Shuttle!` button with the configured key hint.
- [ ] Use `public/fantasia.webp` as the shop cover/background art, following the same ambient
      faded-cover pattern used by the yellow `PlanetShopDialog` (`planet-shop-ambient` backdrop).
- [ ] Build dialog sections/tabs for shuttle paint, lander paint, shuttle title, flag, shuttle
      trail, lander trail, multitool paint, and premium cargo intake.
- [ ] Render shader options with gradient swatches, option names, prices, owned/active state, and
      Buy/Apply/Active action states.
- [ ] Render shuttle title editing as an in-dialog input, not `window.prompt`.
- [ ] Render flag options as emoji buttons from catalog data.
- [ ] Render premium cargo intake with inventory rows, magenta pips, premium prices, and sell
      actions.
- [ ] Disable unaffordable purchases without hiding prices.
- [ ] Keep styles in `src/assets/css/main.css`; do not add inline CSS blocks in Vue files.
- [ ] Ensure the UI remains dense and shop-like rather than a landing page.

### Task 9: Integration Verification

**Files:**
- Relevant changed files from Tasks 1-8

- [ ] Run `bun run type-check`.
- [ ] Run `bun run lint`.
- [ ] Run `bun run test:unit`.
- [ ] Verify `public/fantasia.webp` and `public/portraits/fantasia.webp` exist after
      `bun run textures:build`.
- [ ] Manually verify on the map that yellow `Shop` still opens on `B`.
- [ ] Manually verify Pimp My Shuttle! appears only on Mars/Jupiter/Saturn and opens on `P`.
- [ ] Manually verify Fantasia's intro message appears once on first eligible orbit.
- [ ] Manually verify Fantasia's intro message shows her portrait in both inbox list and reader.
- [ ] Manually verify the Pimp My Shuttle! dialog uses Fantasia cover art behind the magenta shop
      panel.
- [ ] Manually verify cosmetic purchases spend CR and persist after refresh.
- [ ] Manually verify premium cargo sale prices are higher than the normal yellow shop for the same
      items during the same planet visit.
