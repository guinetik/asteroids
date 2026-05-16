# Station Startup Intro Design

**Date:** 2026-05-16
**Status:** Approved for implementation
**Scope:** Add a data-driven, non-interactive startup intro for the new station view.

## Goal

When the player enters a station, the route should feel like an arrival instead of an abrupt spawn. The first station pass adds a short non-interactive intro: black fade, letterbox bars, a compact cyan HUD briefing, and an automatic walk from the entrance corridor toward the playable spawn.

## Player Experience

The sequence starts with the station view already loaded but controls locked. The camera fades in from black while letterbox bars frame the screen. The player is moved forward a short distance from the entrance corridor as if stepping in from the hatch. A HUD card identifies the station and gives a concise briefing. When the sequence ends, the letterbox retracts, the HUD fades out, pointer lock can be requested, and normal FPS station controls resume.

For `microwave-test`, the copy should frame the level as a derelict heist. It should not use the word "microwave". The player should understand that the vault has cargo, the vault keycard is inside a lethal security room, and another terminal exposes the safe floor plan.

## Data Model

`StationLayout` gains an optional `intro` object:

```ts
interface StationIntroSpec {
  title: string
  subtitle?: string
  body: string[]
  status?: string[]
}
```

The field is optional so existing stations keep their current behavior. When absent, the station view skips the startup overlay and controller intro movement.

## Runtime Design

`StationViewController` stores the loaded layout intro and emits it through a callback once initialization completes. If intro data is present, the controller starts in an intro lock state. The lock suppresses interact prompts, input-driven movement, multitool firing, and pointer lock requests. During the lock, the player position is interpolated from an entry offset south of the normal spawn into the existing spawn position, with yaw kept at the existing station spawn yaw.

`StationView.vue` owns the presentation state: fade opacity, letterbox visibility, HUD visibility, and text rendering. It reuses the `LevelView.vue` letterbox pattern and existing station HUD styling: dark translucent panel, cyan borders, uppercase Datatype text, and subtle scanline/glow details.

## Testing

Unit tests cover the data contract first:

- `StationLayout` accepts and preserves optional intro metadata.
- `loadStationLayout` preserves intro metadata.
- `microwave-test.json` validates with intro copy present.

The cinematic movement is a controller/UI integration behavior and can be manually verified in the running station view after unit/type/lint checks.
