# Martian Marine Corps (MMC) cohort contract

## Purpose

- Unlocks **Orbital Surfing** (manifold highway) as a **story reward**, replacing the old consumable `dark-lattice-coupler` install path.
- Adds **2× mission pay** for all missions whose **giver planet** is **Mars** (same pattern as the USC / Earth contract).

## Inbox nudge (main folder)

When the offer fires, the runtime enqueues `sampaio-mmc-contract-heads-up` — **Colonel Hélder Sampaio** (drill sergeant / “space trooper” handler voice) in the **default** inbox. Same “open mail, check the new folder on the left” function as `jay-contract-incoming` for Space Cowboys, but Jay does not write the MMC line.

## How it is offered

The contract `martian-marine-corps-cohort` is offered when:

1. The player has **completed** the **Space Cowboys, Inc.** contract (`space-cowboys-mars-hq`), and  
2. They have **completed at least one** mission with **giver planet** `mars` (shuttle, EVA, turret mining, etc.).

The contract system tracks giver counts in `giverPlanetCompletions` and re-evaluates prerequisites on each mission completion, on contract completion, and once at `ContractSystem` construction (so returning saves get the offer without an extra mission).

## Turret mining givers

Each file under `src/data/shuttle-missions/mining/*.json` includes a `giverId` so contracts can target specific boards (e.g. MMC uses `martian-marines` on the Mars pool).

## Step order and retro complete

- **OP 1** is `turretMiningUnlock` (L1+). Turret mining missions on the board are already gated on that upgrade in the mission UI, so the contract matches game flow.
- On **Accept**, `acceptContractWithRetroEval` re-fires `notifyUpgradeInstalled` for all upgrades; if the turret (and later, focus/cooling/regulator) are already at the required tier, those steps tick **immediately** without a second purchase.

## Authored data

- Contract definition: `src/data/contracts/martian-marine-corps-cohort.json`
- Mars mining pool: `src/data/shuttle-missions/mining/mars.json` (`giverName` + `giverId`)

## Reward wiring

- `mission-pay-multiplier` for `planetId: "mars"` (profile `missionPayMultipliers`).
- `shuttle-upgrade` with `orbitalSurfing` at `minLevel: 1` (upgrade storage via `ensureUpgradeAtLeast`).
