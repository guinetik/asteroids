/**
 * Tuning/config knobs owned by LevelViewController runtime orchestration.
 *
 * @author guinetik
 * @date 2026-04-24
 * @spec docs/superpowers/specs/2026-04-04-level-state-machine-design.md
 */
import { Vector3 } from 'three'

/**
 * Aggregated tuning for the level scene controller.
 *
 * Kept separate from pure domain modules so the controller can stay focused on
 * orchestration while all gameplay-facing constants remain grouped and
 * documented in one place.
 *
 * @author guinetik
 * @date 2026-04-24
 * @spec docs/superpowers/specs/2026-04-04-level-state-machine-design.md
 */
export const LEVEL_VIEW_CONTROLLER_CONFIG = {
  /** Inventory item id of the loot dropped by viroids during armed drop contracts. */
  loot: {
    viroidDropItemId: 'viroid-psychosphere',
  },

  /**
   * Heightmap bake + lander/objective placement tuning.
   *
   * Heightmap grid resolution is used for both the raycast bake AND downstream
   * queries (collision, rock slope check, minimap). `256` on a 3500u world
   * gives ~13.7u per cell, which is plenty for character-footing collision on
   * a ~2600u asteroid and keeps the BVH-accelerated bake under a frame.
   */
  terrain: {
    resolution: 256,
    /** Y altitude from which bake rays start. Must sit above any asteroid geometry. */
    bakeRayStartAltitude: 5000,
    /**
     * Drop altitude for the gameplay lander, measured ABOVE the baked ground Y
     * at the spawn cell.
     */
    landerSpawnHeight: 700,
    /**
     * Maximum random offset from center for lander spawn position (XZ). Kept
     * well inside the asteroid silhouette so the spawn point lands on the
     * baked mesh.
     */
    spawnPositionRange: 500,
    /** Attempts used by `sampleSpawnOnSurface` before falling back to origin. */
    spawnSampleAttempts: 32,
    /** Small X nudged used to line the gameplay spawn up with lander lighting/composition. */
    landerSpawnLightAlignmentX: 5,
    /** Applies the gameplay spawn offset so the lander clears the portal geometry. */
    gameplayStartOffset: new Vector3(0, 0, 0),
    /** EVA spawn point offset when falling back to a simple side-step from the lander. */
    evaSpawnOffsetX: 8,
    /** Vertical offset used to place the EVA spawn safely above the lander/ground. */
    evaSpawnTopYOffset: 12,
    /** Maximum altitude the lander may reach above the parked shuttle before clamping. */
    landerAltitudeCeilingAboveShuttle: 100,
  },

  /** Objective resampling/flattening rules near the ship spawn. */
  objectivePlacement: {
    /** Minimum radial distance from the ship spawn at which objectives can land. */
    minDistanceFromShip: 220,
    /** Maximum radial distance: close enough to walk, far enough to feel separated. */
    maxDistanceFromShip: 700,
    /** Minimum spacing between objectives and between objectives + ship. */
    minMutualSpacing: 220,
    /** Max absolute slope magnitude accepted for an objective cell (0 = flat). */
    maxSlope: 0.6,
    /** Attempts used when resampling an objective onto the ship's face. */
    resampleAttempts: 64,
    /**
     * Radius around each objective and the ship spawn inside which the baked
     * heightmap is smoothed toward the centre height.
     */
    flattenRadius: 110,
    /** Inner radius fully flattened (no falloff); outside this fades smoothly. */
    flattenFullRadius: 55,
    /**
     * Extra radius applied only to the visible GLB deformation. The heightmap
     * grid flattens exact cells, but model triangles can span across the pad
     * from just outside the disk; this pulls those border vertices down too so
     * the rendered surface does not sit above the collision plane.
     */
    visualMeshFlattenPadding: 28,
    /** Fallback pull attempts if ring sampling fails to find a suitable cell. */
    fallbackPullAttempts: 12,
    /** Per-attempt inward pull factor during fallback sampling. */
    fallbackPullFactor: 0.9,
    /** Decay applied across fallback pull attempts. */
    fallbackPullDecay: 0.9,
  },

  /**
   * Combat/objective blast presentation.
   *
   * Contact knockback is tuned larger than `FpsPlayerConfig.movement.maxSpeed`
   * so the shove is unmistakable instead of being snapped away on the next
   * walking-input frame.
   */
  combat: {
    contactKnockback: 26,
    /** Duration of the red damage vignette after the player takes a hit. */
    damageFlashDuration: 0.3,
    /** Strength of the random pitch/yaw camera flinch applied on every hit. */
    damageFlinchStrength: 80,
    /**
     * Camera flinch magnitude at the centre of an objective blast. Tuned
     * heavier than standard hit feedback since the blast outranges most weapons.
     */
    explosionFlinchStrength: 240,
    /** Maximum distance at which the player still feels camera/audio for an objective explosion. */
    explosionFeedbackRange: 90,
    /**
     * Impact speed passed to `LanderExplosion.explode` for objective
     * detonations so nest/virus blasts share the hard-crash particle budget.
     */
    objectiveExplosionImpact: 22,
  },

  /**
   * EVA fall-damage tuning.
   *
   * Fall damage is intentionally generous and never lethal:
   * - a normal jump impact (~12 units/s) -> 0 damage
   * - a hop off a small ledge (~22 units/s) -> 0 damage
   * - a fall from a real cliff (~30 units/s) -> ~1 damage
   * - terminal-velocity slam (~100 units/s) -> clamped to maxDamage
   */
  fallDamage: {
    /** Impact speed (units/s, magnitude) below which no fall damage is dealt. */
    safeSpeed: 28,
    /** HP lost per unit/s of impact speed above `safeSpeed`. */
    damagePerUnit: 0.55,
    /** Hard ceiling on a single fall-damage event. */
    maxDamage: 22,
    /** Floor for the player's HP after a fall-damage hit. */
    minHpAfter: 5,
    /** Lighter camera flinch than combat damage so it reads as a ground thud. */
    flinchStrength: 35,
  },

  /** Lander thrust rumble/shake tuning. */
  atmosphere: {
    /** Thrust vibration at ground level (liftoff rumble). */
    thrustVibrationMax: 1.2,
    /** Thrust vibration at high altitude (cruise hum). */
    thrustVibrationMin: 0.15,
    /** Altitude at which vibration fully fades to minimum. */
    thrustVibrationFadeAltitude: 80,
    /** Refresh duration re-applied every frame so vibration stays active while firing. */
    thrustVibrationDuration: 0.1,
  },

  /** Run-failure / adrift thresholds. */
  bounds: {
    adriftBoundsMargin: 24,
    adriftDepthMargin: 18,
  },

  /** Level-scene colliders shared by lander + shuttle interactions. */
  collision: {
    landerColliderId: 'lander',
    shuttleColliderId: 'shuttle',
    landerColliderMin: new Vector3(-9, -2, -9),
    landerColliderMax: new Vector3(9, 18, 9),
    shuttleColliderMin: new Vector3(-2.4, -0.9, -1.35),
    shuttleColliderMax: new Vector3(2.4, 0.9, 1.35),
  },
} as const
