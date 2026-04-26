# Delivery Rocket Redesign

- **Date**: 2026-04-26
- **Author**: guinetik
- **Status**: Implementing

## Problem

The gather mission deposit prop currently reads like a short toy rocket: a
plain cylinder, cone nose, large blocky fins, and a small green panel. When the
player deposits minerals, mission completion fires immediately and the rocket
starts moving upward without a readable ignition beat, so the result can feel
like the prop disappeared instead of launching.

## Goals

- Make the gather deposit prop read as an industrial cargo probe instead of a
toy rocket.
- Keep the rocket roughly half the lander's visible height, around 9-11 scene
units tall from feet to antenna.
- Add a readable terminal screen and cargo hatch facing the player interaction
side.
- Stage the launch as ignition, liftoff, and climb so the rocket visibly flies
away before it is hidden.
- Keep the objective lifecycle decoupled from the visual prop: the minigame can
complete while the completed minigame keeps ticking the launch animation.

## Non-Goals

- Reworking collect objectives, which still use `DepositCrateModel`.
- Adding a GLB asset pipeline or new texture files.
- Changing asteroid mission rewards, inventory delivery, or exfil behavior.

## Design

`DepositRocketModel` remains a self-contained Three.js hierarchy owned by
`GatherMinigame`. The model uses primitive geometry so it can ship without new
assets: a slim metallic core, darker cargo bands, panel seams, braced landing
legs, a front terminal pedestal, a small antenna, and emissive screen/exhaust
materials.

The launch state lives inside `DepositRocketModel`. `takeOff()` starts an
ignition timer and reveals the exhaust. `tick(dt)` advances through a short
pre-liftoff hold, then accelerates the group upward with a slight drift and
roll. It returns `true` only after the rocket has had enough visible flight
time to read as leaving the surface.

`GatherMinigame` keeps its existing completion semantics: pressing interact at
the ready deposit point marks the objective complete and fires `onComplete`.
Because completed minigames continue ticking, the rocket can finish its visual
launch afterward without blocking mission progression.

## Validation

- Unit tests cover the launch lifecycle: takeoff starts visibly, does not finish
immediately, moves after ignition, and eventually reports done.
- Gather minigame tests cover deposit-triggered launch ticking after completion.
- `bun run type-check`, `bun run lint`, and `bun run test:unit` remain the final
acceptance checks.