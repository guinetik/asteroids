/**
 * Thin event-driven director for all UI audio cues in Asteroid Lander.
 *
 * Follows the same pattern as {@link LevelAudioDirector}: no update loop,
 * no internal state — just `notify*()` methods that delegate directly to the
 * shared {@link AudioManager}. Import the exported {@link uiAudio} singleton
 * wherever a UI event needs a sound.
 *
 * @author guinetik
 * @date 2026-04-22
 * @spec docs/superpowers/specs/2026-04-22-ui-audio-director-design.md
 */

import { useAudio } from './useAudio'

/** Volume for generic button click. */
const CLICK_VOLUME = 0.35
/** Volume for hover cue (kept subtle). */
const HOVER_VOLUME = 0.18
/** Volume for nav-item click using the hover sound (louder than passive hover). */
const NAV_CLICK_VOLUME = 0.35
/** Volume for confirm / accept actions. */
const CONFIRM_VOLUME = 0.45
/** Volume for cancel / dismiss actions (softer than confirm). */
const CANCEL_VOLUME = 0.3
/** Volume for error / blocked actions. */
const ERROR_VOLUME = 0.45
/** Volume for toggle / tab-switch cue. */
const SWITCH_VOLUME = 0.35
/** Volume for typewriter text tick. */
const TYPE_VOLUME = 0.25
/** Volume for processing / loading state start. */
const PROCESSING_VOLUME = 0.3
/** Volume for scan-complete / analysis-done cue. */
const SCAN_VOLUME = 0.45
/** Volume for item-collected chime. */
const COLLECT_VOLUME = 0.35
/** Volume for achievement-unlock fanfare. */
const ACHIEVEMENT_VOLUME = 0.6
/** Volume for mission-accepted confirmation. */
const MISSION_ACCEPT_VOLUME = 0.45
/** Volume for mission-complete stinger. */
const MISSION_COMPLETE_VOLUME = 0.6
/** Volume for reward-received chime. */
const REWARD_VOLUME = 0.6
/** Volume for laser-pulse SFX. */
const LASER_VOLUME = 0.5
/** Volume for upgrade installation fanfare. */
const UPGRADE_INSTALL_VOLUME = 0.7
/** Volume for shuttle control program tab click. */
const SHUTTLE_PROGRAM_CLICK_VOLUME = 0.4

/**
 * Audio orchestrator for UI events. Single-instance for the app lifetime;
 * use the exported {@link uiAudio} singleton — do not instantiate directly.
 */
export class UiAudioDirector {
  private readonly audio = useAudio()

  /**
   * Player pressed a primary button. Plays a short click cue.
   */
  notifyButtonClick(): void {
    this.audio.play('ui.click', { volume: CLICK_VOLUME })
  }

  /**
   * Cursor entered an interactive element. Rate-limited in the manifest
   * (80 ms cooldown) so rapid sweeps don't flood the channel.
   */
  notifyButtonHover(): void {
    this.audio.play('ui.hover', { volume: HOVER_VOLUME })
  }

  /**
   * Player clicked a nav item that uses the hover tone (e.g. manual chapter
   * index, pagination). Louder than passive hover so it reads as a click.
   */
  notifyNavClick(): void {
    this.audio.play('ui.hover', { volume: NAV_CLICK_VOLUME })
  }

  /**
   * Player confirmed an action (accept mission, dialog OK, etc.).
   */
  notifyConfirm(): void {
    this.audio.play('ui.confirm', { volume: CONFIRM_VOLUME })
  }

  /**
   * Player dismissed or cancelled (back, close, ESC).
   */
  notifyCancel(): void {
    this.audio.play('ui.click', { volume: CANCEL_VOLUME })
  }

  /**
   * An action was blocked or failed validation.
   */
  notifyError(): void {
    this.audio.play('ui.error', { volume: ERROR_VOLUME })
  }

  /**
   * Player switched a tab, toggled a mode, or changed a setting.
   */
  notifySwitch(): void {
    this.audio.play('ui.switch', { volume: SWITCH_VOLUME })
  }

  /**
   * One tick of typewriter text revealed. Rate-limited in manifest (60 ms).
   */
  notifyType(): void {
    this.audio.play('ui.type', { volume: TYPE_VOLUME })
  }

  /**
   * A loading or processing operation has started.
   */
  notifyProcessing(): void {
    this.audio.play('ui.processing', { volume: PROCESSING_VOLUME })
  }

  /**
   * A scan or analysis finished successfully.
   */
  notifyScanComplete(): void {
    this.audio.play('ui.scan', { volume: SCAN_VOLUME })
  }

  /**
   * An item (ore, cargo unit, resource) was collected into inventory.
   */
  notifyItemCollected(): void {
    this.audio.play('sfx.collect', { volume: COLLECT_VOLUME })
  }

  /**
   * An achievement was unlocked and the banner is about to appear.
   */
  notifyAchievementUnlocked(): void {
    this.audio.play('ui.achievement', { volume: ACHIEVEMENT_VOLUME })
  }

  /**
   * Player accepted a mission at the dock panel.
   */
  notifyMissionAccepted(): void {
    this.audio.play('ui.confirm', { volume: MISSION_ACCEPT_VOLUME })
  }

  /**
   * A mission was delivered / completed.
   */
  notifyMissionComplete(): void {
    this.audio.play('sfx.mission.shuttle.clear', { volume: MISSION_COMPLETE_VOLUME })
  }

  /**
   * XP or credits were awarded (fires immediately after
   * {@link notifyMissionComplete} at the same call site).
   */
  notifyRewardReceived(): void {
    this.audio.play('ui.achievement', { volume: REWARD_VOLUME })
  }

  /**
   * Turret or shuttle laser fired — plays on the rising edge of beam
   * activation, not every frame.
   */
  notifyLaserFire(): void {
    this.audio.play('sfx.laserPulse', { volume: LASER_VOLUME })
  }

  /**
   * An upgrade was successfully purchased and installed.
   */
  notifyUpgradeInstalled(): void {
    this.audio.play('sfx.upgrade.install', { volume: UPGRADE_INSTALL_VOLUME })
  }

  /**
   * Player clicked a program tab inside the shuttle control terminal.
   */
  notifyShuttleProgramClick(): void {
    this.audio.play('sfx.ui.shuttleprogram.click', { volume: SHUTTLE_PROGRAM_CLICK_VOLUME })
  }
}

/**
 * Shared singleton for the app lifetime. Import this directly in views and
 * components; do not instantiate {@link UiAudioDirector} yourself.
 */
export const uiAudio = new UiAudioDirector()
