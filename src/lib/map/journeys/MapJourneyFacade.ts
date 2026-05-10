/**
 * Coordinates all per-session journey UI and announcement flow for the map view.
 *
 * Extracted responsibilities:
 *   - `journeyUiArmed` gate + `interludeTimer` (5s quiet window between the COMPLETE banner
 *     and the next BEGINS banner).
 *   - `notifyTrigger` — apply a journey trigger, persist the profile, fire the completion
 *     banners, and either schedule the next start announcement or reveal the tracker.
 *   - `tryAnnounceNextStart` — walk the profile's pending-start queue and fire one banner.
 *   - `canLeaveHabitat` / `buildLeaveBlockedPrompt` — journey-gated habitat exit.
 *
 * The facade does NOT own the player profile; it pulls + writes via the `getProfile` /
 * `setProfile` / `persistProfile` callbacks so the controller remains the single source of
 * truth for the profile (shop / missions / respawn all continue to mutate it directly).
 *
 * @author guinetik
 * @date 2026-04-24
 * @spec docs/superpowers/specs/2026-04-05-map-shuttle-player-design.md
 */
import { Timer, type TimerHandle } from '@/lib/Timer'
import type { PlayerProfile } from '@/lib/player/types'
import {
  applyJourneyTrigger,
  buildActiveJourneyTracker,
  getActiveJourneyNextStepLabel,
  getJourneyDisplay,
  getJourneyPendingStartAnnouncement,
  hasCompletedJourney,
  markJourneyStartAnnounced,
  WELCOME_JOURNEY_ID,
  type JourneyId,
  type JourneyTrackerState,
  type JourneyTriggerId,
} from '@/lib/journeys'

/**
 * Seconds of quiet between a journey's "COMPLETE" banner dismissing and the next journey's
 * "BEGINS" banner opening — avoids banner whiplash.
 */
export const JOURNEY_INTERLUDE_SEC = 5

/** Callbacks the facade invokes when it needs to sync Vue HUD state. */
export interface MapJourneyCallbacks {
  /** Tracker card state — `null` when no active journey. */
  onJourneyTracker?: (state: JourneyTrackerState | null) => void
  /** Tracker card visibility toggle (separate from state so interludes can hide without clearing). */
  onJourneyTrackerVisible?: (visible: boolean) => void
  /** Fired when a journey completes; amber completion banner. */
  onJourneyCompletedAnnouncement?: (
    eyebrow: string,
    title: string,
    metaText: string,
    journeyId: JourneyId,
  ) => void
  /** Fired when a new journey begins; amber "BEGINS" banner. */
  onJourneyStartedAnnouncement?: (eyebrow: string, title: string, metaText: string) => void
}

/** Dependencies the facade needs to read + mutate profile + react to journey state changes. */
export interface MapJourneyFacadeDeps {
  /** Returns the current (controller-owned) player profile. */
  getProfile: () => PlayerProfile
  /** Writes an updated profile back into the controller. */
  setProfile: (profile: PlayerProfile) => void
  /** Ask the controller to write profile + inventory to localStorage. */
  persistProfile: () => void
  /** Forwarded to `MapMessageFacade.setTutorialMessagesUnlocked` when the welcome journey completes. */
  setTutorialMessagesUnlocked: (unlocked: boolean) => void
  /** HUD callbacks; invoked with `?.` inside the facade so unset entries are no-ops. */
  callbacks: MapJourneyCallbacks
}

/**
 * Stateful facade. `attach` is idempotent for the deps reference — re-attaching replaces it.
 */
export class MapJourneyFacade {
  /** Pre-habitat the tracker + begin banners stay hidden. Set by `armUiFromHabitatEntry`. */
  private uiArmed = false
  /** Interlude timer between a COMPLETE banner and the next BEGINS banner. */
  private interludeTimer: TimerHandle | null = null
  private deps: MapJourneyFacadeDeps | null = null

  /** Wire the facade to the controller. Call once during `init`. */
  attach(deps: MapJourneyFacadeDeps): void {
    this.deps = deps
  }

  /** Exposed so `replayAct1JourneyTriggers` can force-arm when returning to a saved session. */
  set armed(value: boolean) {
    this.uiArmed = value
  }

  get armed(): boolean {
    return this.uiArmed
  }

  /** Apply a journey trigger and run the full UI fan-out (tracker + banners). */
  notifyTrigger(trigger: JourneyTriggerId): void {
    const deps = this.deps
    if (!deps) return
    const result = applyJourneyTrigger(deps.getProfile(), trigger)
    if (!result.changed) return
    deps.setProfile(result.profile)
    deps.persistProfile()
    deps.setTutorialMessagesUnlocked(hasCompletedJourney(result.profile, WELCOME_JOURNEY_ID))

    for (const journeyId of result.completedJourneyIds) {
      const display = getJourneyDisplay(journeyId)
      if (!display) continue
      deps.callbacks.onJourneyCompletedAnnouncement?.(
        display.eyebrow,
        display.title,
        display.objectiveLabel,
        journeyId,
      )
    }
    this.emitTracker()
    if (result.completedJourneyIds.length > 0) {
      this.hideTrackerAndScheduleNextStart()
    } else if (result.newlyStartReadyJourneyIds.length > 0) {
      // A journey's start gate just opened mid-session (e.g. player accepted the USC
      // contract). Fire its "JOURNEY BEGINS" banner now.
      this.tryAnnounceNextStart()
    }
  }

  /** Push the active-journey tracker state to the HUD (current profile snapshot). */
  emitTracker(): void {
    const deps = this.deps
    if (!deps) return
    deps.callbacks.onJourneyTracker?.(buildActiveJourneyTracker(deps.getProfile()))
  }

  /**
   * Hide the tracker card, let the completion banner finish, wait a beat, then fire the
   * next journey's "JOURNEY BEGINS" banner (if any).
   *
   * Timing: completion banner is ~4.6s total (0.6s open + 3.2s hold + 0.8s close). The
   * interlude gives ~5s of quiet after it dismisses before the next banner opens.
   */
  hideTrackerAndScheduleNextStart(): void {
    const deps = this.deps
    if (!deps) return
    deps.callbacks.onJourneyTrackerVisible?.(false)
    this.clearInterludeTimer()
    this.interludeTimer = Timer.after(JOURNEY_INTERLUDE_SEC, () => {
      this.interludeTimer = null
      this.tryAnnounceNextStart()
    })
  }

  /** Cancel any pending interlude timer. */
  clearInterludeTimer(): void {
    if (this.interludeTimer !== null) {
      Timer.cancel(this.interludeTimer)
      this.interludeTimer = null
    }
  }

  /**
   * Fire the pending "JOURNEY BEGINS" banner for the next un-announced active journey,
   * or just reveal the tracker when there is no pending announcement. No-op when the
   * journey UI has not yet been armed (pre-intro or pre-habitat).
   */
  tryAnnounceNextStart(): void {
    const deps = this.deps
    if (!deps || !this.uiArmed) return
    const profile = deps.getProfile()
    const pendingId = getJourneyPendingStartAnnouncement(profile)
    if (pendingId === null) {
      deps.callbacks.onJourneyTrackerVisible?.(true)
      return
    }
    const display = getJourneyDisplay(pendingId)
    if (!display) {
      deps.callbacks.onJourneyTrackerVisible?.(true)
      return
    }
    const updated = markJourneyStartAnnounced(profile, pendingId)
    deps.setProfile(updated)
    deps.persistProfile()
    deps.callbacks.onJourneyStartedAnnouncement?.(
      display.eyebrow,
      display.title,
      display.objectiveLabel,
    )
    deps.callbacks.onJourneyTrackerVisible?.(true)
  }

  /**
   * Arm the journey UI. Called the first time the player enters the habitat post-intro.
   * Idempotent — re-arming is a no-op.
   */
  armUiFromHabitatEntry(): void {
    if (this.uiArmed) return
    this.uiArmed = true
    this.tryAnnounceNextStart()
  }

  /**
   * Whether the habitat exit action is allowed right now.
   *
   * The journey-driven exit gate is **onboarding-only** — the {@link WELCOME_JOURNEY_ID}
   * journey ends with a "Leave the Habitat" step, so during onboarding the exit is held
   * back until the player has worked through the prior steps. Every other journey
   * (Act 1, Act 2, …) is mid-game progress and must **never** block leaving the habitat,
   * even when their next step is something like "Complete Jovian Society Prospection".
   */
  canLeaveHabitat(): boolean {
    const deps = this.deps
    if (!deps) return true
    const profile = deps.getProfile()
    if (hasCompletedJourney(profile, WELCOME_JOURNEY_ID)) return true
    const nextLabel = getActiveJourneyNextStepLabel(profile)
    return nextLabel === null || nextLabel === 'Leave the Habitat'
  }

  /**
   * Build the habitat-exit-blocked prompt string. Returns `null` when there is no active
   * onboarding step to display. Caller forwards to the habitat prompt HUD.
   *
   * Mirrors the gating in {@link canLeaveHabitat}: post-welcome journeys never produce a
   * blocked prompt because they never block the exit.
   */
  buildLeaveBlockedPrompt(): string | null {
    const deps = this.deps
    if (!deps) return null
    const profile = deps.getProfile()
    if (hasCompletedJourney(profile, WELCOME_JOURNEY_ID)) return null
    const nextLabel = getActiveJourneyNextStepLabel(profile)
    if (!nextLabel) return null
    return `Complete Journey first: ${nextLabel}`
  }

  /** Release the interlude timer; deps are cleared so post-dispose callbacks are no-ops. */
  dispose(): void {
    this.clearInterludeTimer()
    this.deps = null
  }
}
