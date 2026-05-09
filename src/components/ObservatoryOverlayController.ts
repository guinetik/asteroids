/**
 * View-controller that orchestrates the {@link AladinAdapter}, the curated
 * targets manifest, and reactive UI state for {@link ObservatoryOverlay.vue}.
 *
 * @author guinetik
 * @date 2026-05-09
 * @spec docs/superpowers/specs/2026-05-09-habitat-observatory-design.md
 */

import { ref, type Ref } from 'vue'
import { AladinAdapter } from '@/lib/observatory/AladinAdapter'
import type { ObservatoryTarget } from '@/lib/observatory/types'
import targets from '@/data/observatory/targets.json'
import { uiAudio } from '@/audio/UiAudioDirector'

/** Discriminator for the loading lifecycle of the Aladin viewport. */
export type ObservatoryLoadingState = 'idle' | 'loading' | 'ready' | 'error'

/**
 * Reactive controller for the observatory overlay. One instance per Vue
 * component lifetime; constructed at `<script setup>` top-level.
 */
export class ObservatoryOverlayController {
  /** Static, ordered, frozen list backing the sidebar. */
  readonly targets: readonly ObservatoryTarget[] = targets as readonly ObservatoryTarget[]

  /** Currently selected target id. Defaults to the first manifest entry. */
  readonly currentTargetId: Ref<string>

  /** Lifecycle state used to swap the loading shimmer / error retry. */
  readonly loadingState: Ref<ObservatoryLoadingState> = ref('idle')

  /** Last error message, surfaced in the error overlay. */
  readonly errorMessage: Ref<string | null> = ref(null)

  private adapter: AladinAdapter | null = null

  constructor() {
    const first = this.targets[0]
    if (!first) throw new Error('observatory: targets manifest is empty')
    this.currentTargetId = ref(first.id)
  }

  /**
   * Resolve the {@link ObservatoryTarget} corresponding to {@link currentTargetId}.
   * Falls back to the first target if the id has somehow drifted.
   */
  getCurrentTarget(): ObservatoryTarget {
    const found = this.targets.find((t) => t.id === this.currentTargetId.value)
    return found ?? (this.targets[0] as ObservatoryTarget)
  }

  /**
   * Mount the adapter into {@link host} on first call; subsequent calls just
   * re-`goto()` the current target so reopening the dialog is instant.
   *
   * @param host - DOM element that will hold the Aladin viewport.
   */
  async onOpen(host: HTMLElement): Promise<void> {
    if (this.adapter) {
      this.adapter.goto(this.getCurrentTarget())
      this.loadingState.value = 'ready'
      return
    }
    this.loadingState.value = 'loading'
    this.errorMessage.value = null
    try {
      this.adapter = await AladinAdapter.create({
        hostElement: host,
        initialTarget: this.getCurrentTarget(),
      })
      this.loadingState.value = 'ready'
    } catch (err) {
      console.warn('[ObservatoryOverlay] init failed:', err)
      this.loadingState.value = 'error'
      this.errorMessage.value = err instanceof Error ? err.message : String(err)
    }
  }

  /**
   * Switch the active target. Plays the program-click chirp + delegates to
   * the adapter when ready.
   *
   * @param id - Target id from the manifest.
   */
  selectTarget(id: string): void {
    if (id === this.currentTargetId.value) return
    const next = this.targets.find((t) => t.id === id)
    if (!next) return
    uiAudio.notifyShuttleProgramClick()
    this.currentTargetId.value = id
    if (this.adapter && this.loadingState.value === 'ready') {
      this.adapter.goto(next)
    }
  }

  /**
   * Retry handler shown next to the error message. Clears state and resolves
   * back through {@link onOpen} on the same host element.
   *
   * @param host - DOM element that holds the Aladin viewport.
   */
  retry(host: HTMLElement): Promise<void> {
    this.adapter = null
    this.loadingState.value = 'idle'
    return this.onOpen(host)
  }

  /**
   * Tear down the adapter. Wired to `onBeforeUnmount` in the host component.
   */
  dispose(): void {
    this.adapter?.destroy()
    this.adapter = null
    this.loadingState.value = 'idle'
  }
}
