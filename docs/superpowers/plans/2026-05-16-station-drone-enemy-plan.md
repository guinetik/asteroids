# Plan — Station Patrol Drone

**Spec:** `docs/superpowers/specs/2026-05-16-station-drone-enemy-design.md`
**Date:** 2026-05-16

## Phase 1 — Domain (pure TS + tests)

Owner: subagent A (general-purpose).

1. Create `src/lib/fps/drone/droneConfig.ts` with named constants for every tuning lever.
2. Create `src/lib/fps/drone/droneCountForRoom.ts` (`maxDronesForRoom`, `rollDroneCount`).
3. Create `src/lib/fps/drone/droneWanderBehavior.ts` (`makeInitialWanderState`, `tickWander`).
4. Create `src/lib/fps/drone/droneFsm.ts` (`DroneFsm`, intent output type).
5. Vitest specs under `src/lib/fps/drone/__tests__/` for each module.

Acceptance:
- `bun test:unit src/lib/fps/drone` — all green.
- `bun run type-check` — clean.
- `bun run lint` — clean.

## Phase 2 — Layout types + JSON

Owner: subagent A (continues).

6. Extend `src/lib/station/StationLayout.ts` with `DronesSpec` interface and `drones?: DronesSpec` on `StationLayout`, `drones?: boolean` on `RoomSpec`. Mirror `TurretsSpec` shape + docstring style.
7. Add the field to `microwave-test.json` (one or two rooms set `"drones": true`).
8. Audio: register `sfx.drone.laser` + `sfx.drone.destroyed` in `src/audio/audioManifest.ts` pointing at the existing turret WAVs (reuse files, separate IDs).

Acceptance:
- `bun run type-check` — clean.
- `bun run lint` — clean.

## Phase 3 — Three.js layer

Owner: subagent B (general-purpose).

9. `src/three/DroneModel.ts` — GLB load, material capture, hover bob, group-yaw face, hit/destruction/muzzle flashes, alert color swap.
10. `src/three/DroneController.ts` — wraps DroneModel + Enemy + FSM + wander state; mirrors `TurretController` API surface (with `setPatrolRect` instead of `setPatrolHalfSpace`).
11. `src/three/StationDroneDirector.ts` — `populateDronesInRooms(rooms, options)` ; receives shared `EnemyProjectileSystem` + `TurretLaserDartMeshPool` from the turret director; mirrors tick/dispose pattern.

Acceptance:
- `bun run type-check` — clean.
- `bun run lint` — clean (TSDoc on every export).

## Phase 4 — Integration

Owner: orchestrator (final stitch).

12. In `StationViewController.ts`:
   - Always construct the turret director (even when `turrets.enabled === false`) so its pool/projectile system are available — but skip `populateFromEntrances` per existing gate.
   - Construct `StationDroneDirector` with shared pool + projectile system.
   - Wire `setOnPlayerHit` to the same damage flash callback turrets use.
   - Set the collider.
   - When `layout.drones?.enabled !== false`, call `populateDronesInRooms(roomSpecs, { spawnXZ, safeRadius, spawnProbability })`.
   - Tick the drone director in the same `tickTurrets` callsite.
   - Dispose in the same `dispose()` callsite.
13. Manually verify in microwave-test JSON that one room declares `"drones": true`.

## Phase 5 — Verification

14. `bun run type-check` — must pass.
15. `bun run lint` — must pass with zero warnings.
16. `bun run test:unit` — must pass.
17. Dispatch `superpowers:code-reviewer` subagent against the diff for a second opinion. Address all blocking comments.
18. Commit on master with descriptive message. **Do not push.** Per instructions.

## Risk handling

- If face-forward axis lands wrong, the visual reads as "shooting from the back of its head." Verify visually is not possible in this autonomous session — leave a `DRONE_FACE_FORWARD` constant near the top of `DroneModel.ts` with a clear TSDoc on how to flip it after the user observes the in-game behavior.
- If the cyan→red emissive tint reads poorly, ship the alert flag wired but with a conservative tint; user can tune later.
