# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Asteroid Lander - a 2.5D physics-driven lander game for the Vibe Coding Game Jam 2026 (deadline: May 1, 2026). Built with Vue 3 + TypeScript + Vite. Game design document lives in `docs/asteroid-lander-gdd.md`. Game jam rules are in `docs/game-jam.md`.

## Commands

- **Dev server:** `bun dev`
- **Build:** `bun run build` (runs type-check + vite build in parallel)
- **Type-check only:** `bun run type-check`
- **Lint (oxlint then eslint, both with --fix):** `bun lint`
- **Format:** `bun format`
- **Run tests:** `bun test:unit`
- **Run a single test:** `bun test:unit src/path/to/test.spec.ts`

Package manager is **Bun** (`bun install` to install dependencies). Use **`bun`** and **`bunx`** for scripts and one-off tools — do not use `npm` or `npx` in this repo. A `preinstall` script rejects installs driven by other package managers.

## Merge / acceptance criteria

Before a change is considered complete (and before merge), all of the following must pass locally:

1. **`bun run type-check`** — no TypeScript errors.
2. **`bun run lint`** — oxlint **0 errors**, ESLint **0 errors** and **0 warnings** (ESLint runs with `--max-warnings 0`; TSDoc gaps are errors on `src/**/*.ts`).
3. **`bun run test:unit`** — all Vitest tests green.

Do not document or suggest `npm run` / `npx` for this project.

## Architecture

- **Framework:** Vue 3 + Three.js + TypeScript + Vite
- **Reactivity:** Pinia for state management, Vue Router for routing
- **3D rendering:** Three.js — controllers live in `src/three/`
- **Styling:** Tailwind CSS v4 via `@tailwindcss/vite` plugin. Global styles in `src/assets/css/main.css`
- **Entry point:** `index.html` → `src/main.ts` → `src/App.vue`
- **Path alias:** `@/*` maps to `./src/*`
- **Domain logic:** `src/lib/` (math, physics, game state machine — pure TS, no framework deps)
- **Vue layer:** `src/views/`, `src/components/` (markup + bindings), with `ViewController.ts` companions
- **Three.js layer:** `src/three/` (controllers for 3D objects)
- **Stores:** `src/stores/` (Pinia stores)
- **Router:** `src/router/index.ts`
- **Tests:** Co-located in `src/**/__tests__/*.spec.ts`, run with Vitest + JSDOM. Focus on `src/lib/`
- **Static assets:** `public/` (includes `models/` for 3D assets)

## Ground Rules

1. **No magic numbers.** All numeric constants must be named.
2. **`src/lib/` for math & domain code.** `src/lib/math/`, `src/lib/physics/`, etc. No cross-concerns between Vue, Three.js, and domain logic. Tests focus on math/domain — no need to test Vue or Three.js layers.
3. **Data-driven everything.** Game content (asteroids, missions, configs) lives in JSON files under `src/data/`, imported statically by Vite. Never hardcode content as TypeScript objects.
4. **PostCSS + Tailwind @apply.** Reusable utility classes built with `@apply()`. No inline CSS blocks in `.vue` files.
5. **ViewController pattern for Vue.** `.vue` files in `src/components/` and `src/views/` contain markup + minimal JS bindings. Domain-to-Vue logic lives in a corresponding `ViewController.ts`.
6. **Controller pattern for Three.js.** 3D objects get a controller in `src/three/` (e.g. `AsteroidController.ts`).
7. **State machine** for game state management — hand-rolled in `src/lib/`, not a library.
8. **TSDoc comments on all exports.** Use standard TSDoc with `@author guinetik`, `@date`, and `@spec` linking to the design spec. Code should be self-documenting and pleasant to read.

## Code Style

- No semicolons, single quotes, 100-char line width (Prettier)
- 2-space indentation, LF line endings (EditorConfig)
- TypeScript strict mode with `noUncheckedIndexedAccess` enabled

## Linting

Two linters with distinct responsibilities:

- **Oxlint** — primary linter. Handles TS, Vue, Vitest, and correctness rules. Runs in ~10ms. Reference snippets under `docs/inspo/**` are excluded via `.oxlintrc.json` `ignorePatterns`.
- **ESLint** — enforces `jsdoc/require-jsdoc` as **errors** on `src/**/*.ts` (excluding `__tests__`). Uses `eslint-plugin-oxlint` to disable any rules oxlint already covers. Invoked with **`--max-warnings 0`** so documentation/TSDoc warnings cannot slip through.

`bun lint` runs both in sequence (oxlint first, then eslint).

## Power System (Thrusters & Fuel)

Every vehicle shares the same `ThrusterSystem<T>` pattern (`src/lib/physics/thrusterSystem.ts`):

- **Shared fuel pool.** One fuel tank per vehicle. All thrusters draw from it.
- **Thrusters have charge.** Each thruster group has its own charge bar (capacity, burn rate).
- **Recharge costs fuel.** When a thruster is idle and below full charge, it recharges — consuming fuel from the shared pool. Full charge = zero fuel drain.
- **No fuel = no recharge.** When the tank is empty, thrusters can only spend remaining charge.
- **Every power system in the game follows this pattern.** Weapons, shields, mining lasers — all will use `ThrusterSystem<T>` with their own named groups and a shared fuel pool.

Tuning levers per thruster group: `capacity`, `burnRate` (charge/s while firing), `rechargeRate` (charge/s while idle), `fuelCostPerRecharge` (fuel per unit of charge recovered).

## TSDoc Format

Every exported function, class, interface, type alias, and constant must have a TSDoc comment. Enforced by ESLint's `jsdoc/require-jsdoc` rule at **error** severity. Every interface property gets a doc comment explaining what it is, valid ranges, and real examples.

File-level header on all `src/lib/` and `src/three/` files:

```ts
/**
 * Brief description of what this module does.
 *
 * @author guinetik
 * @date 2026-04-03
 * @spec docs/superpowers/specs/2026-04-03-feature-name-design.md
 */
```
