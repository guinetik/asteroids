# Venusian Zeppelin Contract Notes

## Overview

The Venusian Zeppelin contract teaches interplanetary trading as a closed
route loop and rewards the player with:

- Fast travel unlock for Venus
- 2x payout multiplier on Venus-issued missions

Offer trigger is the first time the player enters Venus orbit.

## Trade Step Schema

Contracts now support a `trade-goods` step kind:

- `action`: `buy` or `sell`
- `planetId`: where the transaction must occur
- `itemId`: trade-good id from `src/data/shop/trade-goods.json`
- `count`: required quantity across matching transactions

Progress increments only when action + planet + item all match.

## Route and Economy

The authored tutorial loop is:

1. Buy `acid-resistant-coatings` at Venus
2. Sell `acid-resistant-coatings` at Earth
3. Buy `luxury-foods` at Earth
4. Sell `luxury-foods` at Mars
5. Buy `drill-bits` at Mars
6. Sell `drill-bits` at Venus

To guarantee the Venus -> Earth leg is valid in data, Earth demand now includes
`acid-resistant-coatings`.

## Narrative Intent

Handler voice is Lucas Maverick: former poker addict turned retail mogul.
Copy leans on card-table metaphors while explaining pricing spread and loop
discipline.

## QA Checklist

- Contract is offered when first orbiting Venus.
- Buy/sell progress updates only on matching action + planet + item.
- Multi-quantity transactions count correctly and cap at step target.
- Completion grants Venus fast travel and 2x Venus mission pay.
- Shop item hint text is fully readable (no clamped ellipsis) and brighter.
