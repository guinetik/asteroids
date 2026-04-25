# Act 1 consortium run cleared on map refresh

## Symptom

After completing the three inner-system contracts, the game stages the `consortium-certification` asteroid run (journey step context: “Install the USC Module” is still pending until `gravitySurfing` is installed). A full page refresh could leave **Shuttle Control → Active Missions** empty (“No active missions”) even though the Act I tracker still expected the run.

## Cause

1. `replayAct1JourneyTriggers` ran at the start of `MapViewController.init`, before `MapMissionFacade.hydrateFromStorage`.
2. `maybeStageAct1Climax` → `stageConsortiumCertification` updated the in-memory board and called `saveActiveMission` but did not persist the full `ShuttleMissionBoard` snapshot.
3. Later, `hydrateFromStorage` loaded a **stale** `MISSION_BOARD` record without `activeAsteroidMission` and, in that branch, called `clearActiveMission()`, wiping the key written in step 2.

## Fix (2026-04-24)

- Run `replayAct1JourneyTriggers` **after** `hydrateFromStorage`.
- Call `saveMissionBoard` when staging the consortium run so the full board matches `ACTIVE_MISSION_KEY`.
- Emit the journey tracker once after replay so initial HUD matches replayed profile state.

## Asteroid / waypoint reappears after completing the run (same date)

`maybeStageAct1Climax` re-staged the consortium mission whenever the three contracts were done, gravity was not installed, and there was no active mission in storage — which is true **right after** a successful exfil. Each map `init` then posted the job again, so the belt waypoint and 3D preview came back.

**Fix:** If the shuttle inventory already contains `grid-coupling-module`, skip staging (pickup is complete; the player only needs the engineering-bay install).

**Related:** `persistCompletedAsteroidMissionRewards` now updates the full mission board whenever the stored board has no active asteroid or the active id matches, so a desynced snapshot cannot leave a stale `activeAsteroidMission` in `MISSION_BOARD_KEY`.
