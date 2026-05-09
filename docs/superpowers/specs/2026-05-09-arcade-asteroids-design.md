# Arcade Asteroids — Design Spec

- **Date:** 2026-05-09
- **Author:** guinetik (with GPT-5.5)
- **Status:** Approved for implementation

## Summary

Add a playable Atari-style Asteroids cabinet to the shuttle habitat. When the
player owns the arcade cabinet appliance, walking up to it shows `F  Play
Asteroids`. Pressing `F` opens a shipboard overlay, releases habitat pointer
lock, and focuses a vector-style canvas game.

## Goals

- Make the arcade cabinet a real interaction, matching the telescope's habitat
  payoff.
- Build a faithful classic Asteroids port: vector rendering, rotation, thrust,
  inertia, wraparound, bullets, waves, asteroid splitting, lives, saucers,
  hyperspace, scoring, high score, attract/start flow, and game over.
- Keep gameplay rules in pure TypeScript so movement, collisions, scoring, and
  progression can be tested deterministically.
- Keep rendering and input in Vue/component code, decoupled from simulation and
  from Three.js habitat code.

## Non-Goals

- No mission, inventory, contract, achievement, or credit rewards in v1.
- No multiplayer, online leaderboard, or persisted initials table.
- No reuse of the inline `index.html` prelude implementation beyond visual
  inspiration.
- No cabinet-screen rendering inside the 3D prop; v1 uses the telescope-style
  full-screen overlay.

## User Flow

1. Player buys or owns the arcade cabinet habitat appliance.
2. The habitat scene loads the arcade GLB and collision bounds.
3. Player walks near the cabinet and sees `F  Play Asteroids`.
4. Pressing `F` opens the overlay, releases pointer lock, and focuses the game.
5. Overlay starts in attract mode. Player presses `Enter` or fires to start.
6. Player plays classic Asteroids. `Escape` or the Close button exits the
   overlay without affecting habitat state.
7. Closing the overlay restores habitat pointer lock from the close gesture.

## Architecture

```
src/
  lib/minigame/arcadeAsteroids/
    types.ts
    config.ts
    rng.ts
    geometry.ts
    AsteroidsGame.ts
    __tests__/AsteroidsGame.spec.ts
  components/
    ArcadeAsteroidsCanvas.vue
    ArcadeAsteroidsOverlay.vue
    ArcadeAsteroidsOverlayController.ts
  assets/css/
    arcade-asteroids-overlay.css
  three/
    HabitatArcadeMachineModel.ts
    HabitatInteriorScene.ts
  lib/map/habitat/
    MapHabitatFacade.ts
  views/
    MapView.vue
    MapViewController.ts
```

## Layer Responsibilities

- `AsteroidsGame` owns rules only: state transitions, entity motion, collisions,
  spawning, scoring, lives, hyperspace, saucers, and high-score updates.
- `geometry` owns small math helpers such as wrapping, distance checks, and
  vector shape generation.
- `rng` provides deterministic random numbers for tests and browser play.
- `ArcadeAsteroidsOverlayController` maps UI commands to simulation inputs,
  manages high-score storage, and exposes state snapshots to Vue.
- `ArcadeAsteroidsCanvas` owns canvas sizing, keyboard focus, animation timing,
  and vector drawing.
- `ArcadeAsteroidsOverlay` owns shipboard chrome and close/start controls.
- Habitat and map classes only know that an `arcade` interaction opens an
  overlay; they do not know gameplay details.

## Controls

- `ArrowLeft` / `A`: rotate left.
- `ArrowRight` / `D`: rotate right.
- `ArrowUp` / `W`: thrust.
- `Space`: fire.
- `X`: hyperspace.
- `Enter`: start/restart from attract or game-over state.
- `Escape`: close the overlay.

## Gameplay Rules

- Ship wraps around the screen with velocity preserved.
- Bullets wrap while alive and expire after a short lifetime.
- Asteroids wrap, rotate, split from large to medium to small, and award classic
  score values.
- A wave clears when no asteroids remain; the next wave spawns more large
  asteroids.
- The ship loses a life on collision unless currently respawning.
- Game over occurs when a collision would consume the final life.
- Saucers spawn periodically after play begins, cross the screen, fire at the
  player, wrap or despawn at the edge, and award points when destroyed.
- Hyperspace teleports the ship to a random location with a small destruction
  risk.
- High score is stored locally by the overlay controller, not by simulation.

## Testing

Unit tests cover simulation behavior with deterministic RNG:

- Ship thrust and wraparound.
- Bullet cooldown, wrapping, and expiry.
- Asteroid splitting and score awards.
- Ship collision, respawn, lives, and game over.
- Wave progression.
- Saucer spawn/fire/destruction behavior.
- Hyperspace teleport and risk branch.
- Controller high-score persistence boundary.

## Acceptance Criteria

- The cabinet prompt appears only for a loaded arcade appliance.
- Opening the arcade releases habitat pointer lock and focuses overlay input.
- Closing the overlay restores habitat controls.
- The game plays as a faithful classic Asteroids port in the overlay.
- Core rules are covered by deterministic tests.
