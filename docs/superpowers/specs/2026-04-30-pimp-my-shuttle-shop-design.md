# Pimp My Shuttle Shop

> Magenta cosmetic shop for high-credit visual customization sinks on Mars, Jupiter, and Saturn.

**Date:** 2026-04-30
**Author:** guinetik

---

## 1. Overview

Add a second planet shop option named **Pimp My Shuttle!**. It is a cosmetic-only CR sink
available only while orbiting Mars, Jupiter, or Saturn. The first pass is model-first and
data-driven: domain models, catalog loading, purchase/application logic, Pinia persistence, local
storage migration, premium trade-good intake, and Vue UI. No Three.js material, mesh, particle,
texture, or GLB integration is part of this pass.

The existing yellow trading shop remains on `B`. The new shop should render as a separate magenta
shop affordance only on eligible planets. Recommended default binding: `KeyP` via a new
`cosmeticShopAction` binding, because `B` is already taken by the trade shop and `P` maps cleanly to
Pimp.

The shop owner is also a premium buyer for tradeable cargo. She always buys trade goods at a
favorable margin versus the normal route economy, so the player can dump cargo here for a guaranteed
win while shopping for cosmetics. This makes the loop two-sided: she drains CR through cosmetics,
but also gives the player a reason to bring valuable cargo to Mars/Jupiter/Saturn.

The shop is introduced by **Fantasia Mira-Io**, a station-born stylist and trader who messages the
player the first time they reach any eligible planet.

## 2. Availability

The cosmetic shop is enabled only when the map orbit target is one of:


| Planet  | Planet id |
| ------- | --------- |
| Mars    | `mars`    |
| Jupiter | `jupiter` |
| Saturn  | `saturn`  |


All other planets keep the existing trade shop only. If the player leaves orbit, the cosmetic shop
dialog closes the same way the trade shop dialog closes.

Availability must come from data, not hardcoded UI checks:

```json
{
  "id": "pimp-my-shuttle",
  "label": "Pimp My Shuttle!",
  "theme": "magenta",
  "availablePlanetIds": ["mars", "jupiter", "saturn"]
}
```

## 3. Introduction Message

When the player first enters orbit at Mars, Jupiter, or Saturn, send a one-time message from
Fantasia Mira-Io introducing Pimp My Shuttle! and hinting that she buys trade goods at premium
prices. This should use the existing message system, not a bespoke popup.

Message gating:

- Trigger on first orbit arrival at any eligible planet: `mars`, `jupiter`, or `saturn`.
- Persist that the intro message was sent in the profile/message storage so it does not repeat on
every eligible planet.
- If the player first reaches Jupiter or Saturn before Mars, the same intro can fire there.
- The message should mention the magenta shop affordance and the configured key hint.
- The message should not block the player from opening the shop if it has not been read.

Suggested message metadata:

```json
{
  "id": "fantasia-pimp-my-shuttle-intro",
  "from": "Fantasia Mira-Io",
  "channel": "shop",
  "subject": "Lindo, your shuttle needs a color",
  "trigger": {
    "kind": "first-orbit-any",
    "planetIds": ["mars", "jupiter", "saturn"]
  }
}
```

Suggested body:

> Lindo, finally. I saw your transponder come through and thought: that pilot is flying around in
> default colors? In this economy? Come find the magenta light when you dock. I do hulls, flags,
> titles, thruster trails, the whole little miracle. Bring cargo too, amor. If it's tradeable, I
> pay better than the polite yellow counters.

## 4. Fantasia Mira-Io Voice

Fantasia talks like she is holding court. Every customer who walks in is the most fascinating
person she has seen all week, and she means it for the thirty seconds they are standing there. She
was born on a station and has never seen a real sunrise or felt rain on her skin, so color is not
decoration to her. Color is identity. Earthborn people inherit their light; she had to choose hers.
That is how she sees the player: not "what paint job do you want," but "who are you trying to be
today, and how do we make the hull match?"

She is theatrical, not fake. She is the friend who tells you the orange clashes with your boots,
then helps you find the right one before you finish apologizing. She runs hot: fast cadence,
sentences that start mid-thought, lots of emphasis, hands moving even when nobody can see them.
Pet names arrive from the first hello: `amor`, `lindo`, `querido`, `sweetness`, slipping between
English and the colony Portuguese she grew up speaking on the way to Mars.

Fantasia drops compliments like tips, but underneath the performance she is watching closely. In the
middle of the spiel she says one thing so specific it lands. That is her real talent. The paint is
the excuse. She is selling the player back to themselves in a color they did not know they needed.

How she differs from Marta and Jay:

- Marta is warm-flirty because she knows the player; it is earned.
- Fantasia is performance-flirty because that is the room she runs. The player is new and she makes
them feel like an old friend in ninety seconds.
- Jay observes and lets silence sit.
- Fantasia fills silence the way paint fills a panel.
- Marta sells the player a machine. Jay sells the player a life. Fantasia sells the player a look.
Vain, on purpose, because that is the point of her shop.

ElevenLabs-ready sample lines:

First meeting:

```text
[warmly] Lindo, finally — someone with a face I can actually work with. [laughs] Most of these dirt-haulers come in here asking for grey. [scoffs] Grey, amor. In a galaxy with three thousand named colors. [excited] No no no — you, I can already see. You're not a grey. Sit, sit. Show me your shuttle.
```

Pitching the catalog:

```text
[smoothly] So — six hulls this rotation. Each one took me a week, and I named them all myself. [proudly] Phoenix Bleed. Static Dream. Saturn Honey — [pause] that one's for you, by the way. You don't have to listen to me. [laughs softly] You will, though.
```

Purchase confirmation:

```text
[delighted] Ah, amor — yes. [whispers] You're going to look so good out there. [warmly] Take your time leaving. The paint cures faster if she sits in the magenta light a minute. Trust me.
```

Player cannot afford it:

```text
[gentle sigh] Sweetness, I don't take credit. [softly] But I'll hold Saturn Honey off the menu for you. Two weeks. [playful] Don't make me sell her to someone with worse taste.
```

Return visit:

```text
[delighted] Querido! [laughs] Look at you, back already. I told the mirror you'd be back. [warmly] Mirror agreed.
```

## 5. Product Catalog

Create `src/data/cosmetics/pimp-my-shuttle.json`. The catalog owns every option, price, gradient,
label, and target slot. TypeScript only validates and consumes it.

### Categories


| Category                    | Target profile field     | Options    | Price    |
| --------------------------- | ------------------------ | ---------- | -------- |
| Shuttle paintjob            | `shuttlePaintjobId`      | 6          | 20000 CR |
| Lander paintjob             | `landerPaintjobId`       | 4          | 20000 CR |
| Shuttle title               | `shuttleTitle`           | text input | 5000 CR  |
| Shuttle + lander flag       | `vehicleFlagId`          | flag list  | 5000 CR  |
| Shuttle thruster trail      | `shuttleThrusterTrailId` | 3          | 10000 CR |
| Lander thruster trail color | `landerThrusterTrailId`  | 3          | 10000 CR |
| Multitool paintjob          | `multitoolPaintjobId`    | 3          | 5000 CR  |


Paint/trail choices should feel like Destiny 2 shaders: cool names represented by compact
gradients. The gradient is a UI preview and future rendering hint, not a Three.js instruction in
this pass.

### Catalog Shape

```ts
type CosmeticCategory =
  | 'shuttle-paintjob'
  | 'lander-paintjob'
  | 'shuttle-title'
  | 'vehicle-flag'
  | 'shuttle-thruster-trail'
  | 'lander-thruster-trail'
  | 'multitool-paintjob'

interface CosmeticOptionData {
  readonly id: string
  readonly category: CosmeticCategory
  readonly label: string
  readonly description: string
  readonly price: number
  readonly gradientStops: readonly string[]
  readonly emoji?: string
}
```

Example data entries:

```json
{
  "options": [
    {
      "id": "shuttle-paintjob-neon-comet",
      "category": "shuttle-paintjob",
      "label": "Neon Comet",
      "description": "Hot magenta bleeding into electric cobalt with ink-deep underbelly.",
      "price": 20000,
      "gradientStops": ["#ff2bd6", "#3b82f6", "#0f172a"]
    },
    {
      "id": "vehicle-flag-canada",
      "category": "vehicle-flag",
      "label": "Canada",
      "description": "Shared flag decal for shuttle and lander.",
      "price": 5000,
      "gradientStops": ["#ef4444", "#ffffff", "#ef4444"],
      "emoji": "🇨🇦"
    }
  ]
}
```

Recommended starting names:


| Category           | Option labels                                                                    |
| ------------------ | -------------------------------------------------------------------------------- |
| Shuttle paintjob   | Neon Comet, Red Sparrow, The Space Time Matrix, Void Chrome, Cinderline Gold, Saturn Club |
| Lander paintjob    | Dust Angel, Frostbite Safety, Mariner Red, Hazard Bloom                          |
| Shuttle trail      | Plasma Kiss, Blue Shift, Ember Wake                                              |
| Lander trail       | Cyan RCS, Magenta RCS, Amber RCS                                                 |
| Multitool paintjob | Arcade Relic, Surgical Pink, Graphite Bloom                                      |


Flag options should be a curated data list of emoji buttons. Keep it compact at first, for example
12 to 18 flags, because this is a CR sink UI rather than a full country picker.

## 6. Player Model and Persistence

Extend `PlayerProfile` with an optional cosmetic block instead of scattering cosmetic ids across the
root profile:

```ts
interface PlayerCosmetics {
  readonly ownedOptionIds: readonly string[]
  readonly shuttlePaintjobId: string
  readonly landerPaintjobId: string
  readonly shuttleTitle: string
  readonly vehicleFlagId: string
  readonly shuttleThrusterTrailId: string
  readonly landerThrusterTrailId: string
  readonly multitoolPaintjobId: string
}
```

Add `cosmetics?: PlayerCosmetics` to `PlayerProfile`. `createProfile()` seeds defaults. The profile
loader migrates legacy saves by creating the default cosmetic block when missing.

Persistence stays in the existing profile localStorage key:

```ts
PROFILE_STORAGE_KEY = 'asteroid-lander-profile'
```

Do not introduce a second save key for cosmetics. Cosmetic purchases and current selections belong
to the player profile because they are tied to credit spend and should reset with a profile reset.

## 7. Domain Layer

Create a new `src/lib/cosmetics/` domain slice.


| File                  | Responsibility                                                        |
| --------------------- | --------------------------------------------------------------------- |
| `types.ts`            | Category, option, shop config, profile cosmetic types                 |
| `catalog.ts`          | Load and validate `src/data/cosmetics/pimp-my-shuttle.json`           |
| `profileCosmetics.ts` | Defaults, migration, title normalization, option ownership helpers    |
| `purchase.ts`         | Pure purchase/apply functions that spend credits and update cosmetics |
| `availability.ts`     | Data-driven planet eligibility helpers                                |
| `premiumTrade.ts`     | Per-visit premium buy margins for tradeable cargo                     |


Core exported functions:

```ts
getPimpMyShuttleConfig(): CosmeticShopConfig
getCosmeticOptions(category: CosmeticCategory): readonly CosmeticOption[]
isPimpMyShuttleAvailable(planetId: string): boolean
createDefaultPlayerCosmetics(): PlayerCosmetics
normalizeShuttleTitle(rawTitle: string): string
purchaseCosmeticOption(profile: PlayerProfile, optionId: string): CosmeticPurchaseResult
purchaseShuttleTitle(profile: PlayerProfile, rawTitle: string): CosmeticPurchaseResult
applyOwnedCosmetic(profile: PlayerProfile, optionId: string): PlayerProfile
```

Purchase rules:

- Buying a cosmetic option spends CR once, adds the option id to `ownedOptionIds`, and applies it.
- Re-applying an already owned option is free.
- Buying a different option in the same category costs the catalog price unless already owned.
- Shuttle title changes always cost 5000 CR when the normalized title is different.
- Shuttle title normalization trims whitespace, collapses repeated whitespace, and caps at 24
visible characters.
- Empty title input fails and does not spend CR.
- Flag purchase applies one `vehicleFlagId` shared by shuttle and lander.
- Failed purchases return a typed reason: unavailable option, invalid title, already active,
insufficient credits, or malformed catalog.

All prices are catalog data, with tests asserting the shipped catalog matches the intended counts
and prices.

## 8. Premium Trade-Good Intake

Pimp My Shuttle! can also receive the same tradeable inventory items handled by the yellow trade
shop sell table. This is not normal planetary demand. It is a special buyer margin scoped to the
cosmetic shop visit.

Current yellow-shop route math:

```ts
sellPrice = basePrice * demandMultiplier * TRADE_ROUTE_SELL_PREMIUM_MULTIPLIER
```

The premium buyer should wrap, not replace, that system:

```ts
premiumSellPrice = normalSellPrice * visitPremiumMultiplier
premiumPips = min(5, normalPips + minimumPipBonus)
```

Rules:

- `minimumPipBonus` is data-driven and defaults to `2`.
- Every sellable trade good shown in this shop must display at least two grades above its normal
desirability for the current planet.
- `premiumPips` caps at 5.
- The player always benefits: `visitPremiumMultiplier` is always greater than `1`.
- The premium multiplier is randomized once per cosmetic-shop visit and remains stable until the
player leaves orbit.
- Reopening the dialog during the same orbit visit shows the same premium values.
- Leaving orbit and returning creates a fresh premium margin roll.
- This premium applies to trade goods. Mineral fallback behavior can remain normal unless the
catalog explicitly marks a mineral as accepted by the premium buyer.
- The premium sale still removes inventory, adds credits, and records trade credits earned through
existing profile economy functions.

Add premium buyer tuning to `src/data/cosmetics/pimp-my-shuttle.json`:

```json
{
  "premiumTrade": {
    "acceptedCategories": ["trade-good"],
    "minimumPipBonus": 2,
    "visitMargin": {
      "minMultiplier": 1.08,
      "maxMultiplier": 1.65
    }
  }
}
```

`1.08` makes the worst roll still useful. `1.65` creates the occasional big dopamine sale without
turning every visit into an economy exploit. Tune after playtesting against cosmetic prices.

Recommended domain API:

```ts
interface PremiumTradeSession {
  readonly planetId: string
  readonly premiumMultiplier: number
}

createPremiumTradeSession(planetId: string): PremiumTradeSession
computePremiumSellPrice(session: PremiumTradeSession, itemId: string): number
getPremiumDesirabilityPips(session: PremiumTradeSession, itemId: string): number
sellPremiumTradeGood(
  session: PremiumTradeSession,
  profile: PlayerProfile,
  inventory: Inventory,
  itemId: string,
  quantity: number,
): ShopResult
```

The implementation may call existing `computeSellPrice()` and `getDesirabilityPips()` from
`src/lib/shop/planetDemand.ts`, then apply the premium wrapper. Keep the wrapper in
`src/lib/cosmetics/premiumTrade.ts` so normal trade shops do not accidentally inherit her premium.

## 9. Pinia Store

Add `src/stores/cosmetics.ts` as a thin reactive wrapper around the pure `src/lib/cosmetics`
functions. It should use `usePlayerStore()` for the profile and call `saveProfile()` through player
store mutation helpers or a focused setter.

Recommended store API:

```ts
const activeCosmetics = computed(() => profile.value?.cosmetics ?? defaults)
const availableCategories = computed(() => getCosmeticCategories())

function buyOption(optionId: string): CosmeticPurchaseResult
function applyOption(optionId: string): CosmeticPurchaseResult
function renameShuttle(rawTitle: string): CosmeticPurchaseResult
function sellPremiumTradeGood(itemId: string, quantity: number): PremiumTradeResult
function canAffordOption(optionId: string): boolean
function ownsOption(optionId: string): boolean
```

The store should not know map orbit state. Availability stays in the map facade/controller and is
passed into the dialog as props. The current `PremiumTradeSession` is created by the map cosmetic
shop facade and passed into the store/dialog action.

## 10. Map and UI Integration

Add a sibling flow to the current `MapShopFacade` rather than expanding the trade shop session
model:


| File                                          | Change                                                                  |
| --------------------------------------------- | ----------------------------------------------------------------------- |
| `src/lib/map/shop/MapCosmeticShopFacade.ts`   | Tracks open/closed state and planet eligibility                         |
| `src/views/MapViewController.ts`              | Emits cosmetic shop button/dialog state while orbiting eligible planets |
| `src/views/MapView.vue`                       | Renders magenta button and dialog                                       |
| `src/components/shop/CosmeticShopButton.vue`  | Magenta `Pimp My Shuttle!` button with key hint                         |
| `src/components/shop/PimpMyShuttleDialog.vue` | Cosmetic purchase/apply UI                                              |


UI behavior:

- Existing yellow `Shop` button remains unchanged.
- New magenta button appears only on Mars/Jupiter/Saturn.
- Dialog header: `Pimp My Shuttle!`
- Show current CR balance.
- Use tabs or compact segmented controls for categories.
- Render each shader-like option as a row/card with:
  - gradient swatch
  - option name
  - price
  - owned/active state
  - Buy, Apply, or Active action
- Title category opens a prompt-like in-dialog input, not `window.prompt`, so validation and styling
remain consistent.
- Flag category renders emoji buttons from catalog data.
- Insufficient CR disables buy actions and shows price state without spending.
- Add a `Cargo Intake` or `Sell Cargo` section using the same inventory rows as the yellow shop,
but with magenta demand pips and premium prices.
- Premium sell rows should communicate the favorable margin through state, not exposition: pips
glow magenta, prices are visibly higher, and the action button reads `Sell`.

Styling should live in `src/assets/css/main.css` with reusable classes, following the no inline CSS
rule for Vue files. The theme should be magenta-accented while keeping the existing shop's dense,
utility-focused layout.

## 11. Non-Goals for This Pass

- No Three.js material or texture changes.
- No GLB model mutation.
- No particle or thruster trail renderer changes.
- No lander/FPS/multitool visual binding.
- No full flag picker.
- No refund/resale system.
- No random stock, timers, or restocking for cosmetics. Cosmetics are a permanent catalog.
- No changes to the yellow shop's normal demand pricing.

## 12. Tests

Add focused Vitest coverage under `src/lib/cosmetics/__tests__/`.

Required tests:

- Catalog loads with exactly 6 shuttle paintjobs, 4 lander paintjobs, 3 shuttle trails, 3 lander
trails, 3 multitool paintjobs, 1 title service, and at least one flag.
- Mars, Jupiter, and Saturn are eligible; Earth and Venus are not.
- Purchasing an option spends the configured CR, records ownership, applies the selection, and
increments lifetime credits spent through `spendCredits`.
- Applying an owned inactive option is free.
- Re-buying or re-applying an active option fails with `already-active`.
- Insufficient credits leaves the profile unchanged.
- Title changes cost 5000 CR, normalize to the 24-character cap, and reject empty input.
- Premium trade session rolls a multiplier within catalog bounds and keeps it stable for the visit.
- Premium trade prices are always greater than normal `computeSellPrice()` for accepted trade goods.
- Premium trade pips are always at least two grades above normal pips, capped at 5.
- Selling premium trade goods removes inventory, adds credits, and records trade earnings.
- Fantasia's intro message fires once on first orbit at Mars/Jupiter/Saturn and does not repeat on
later eligible arrivals.
- Legacy profile migration creates default cosmetics without dropping existing credits, inventory
adjacent fields, journey fields, hull HP, or contract reward fields.

## 13. Implementation Plan

1. Add cosmetic catalog JSON and `src/lib/cosmetics` types/catalog validation.
2. Extend `PlayerProfile`, `createProfile()`, and `normalizeLoadedProfile()` with migrated
  cosmetics.
3. Add pure purchase/apply/title helpers and unit tests.
4. Add premium trade session/pricing helpers that wrap the existing trade route math.
5. Add Fantasia intro message data, trigger helper, and one-time persistence.
6. Add `useCosmeticsStore()` and player-store setter support if needed.
7. Add `MapCosmeticShopFacade`, `cosmeticShopAction` binding, and MapViewController callbacks.
8. Add magenta button/dialog components, premium sell table, and CSS.
9. Run `bun run type-check`, `bun run lint`, and `bun run test:unit`.

