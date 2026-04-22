# Saturn procedural asteroid contracts

Saturn stations only draft **exterminate** and **rescue** asteroid missions (Colonial Guard and Frontier Rescue templates). Mining and survey givers are excluded at generation time.

Implementation: `generateAsteroidMission` in `src/lib/missions/asteroidMissionGenerator.ts` detects `host.planetId === 'saturn'`, uses the full `MISSION_GIVERS` list so rescue/exterminate givers are not crowded out by difficulty overlap with miners, and keeps only templates whose `objectiveSlots` are all `exterminate` or `rescue`.

If no template matches the player’s mission difficulty (for example difficulty **1**, where no guard/rescue `regionByDifficulty` band applies), generation throws; `MapMissionFacade.offerAsteroidMissionFromDifficulty` catches that and skips the offer instead of crashing.
