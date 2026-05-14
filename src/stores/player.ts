/**
 * Player profile Pinia store.
 *
 * Thin reactive wrapper around the pure profile functions in
 * src/lib/player/profile.ts. Auto-saves to localStorage after
 * every mutation.
 *
 * @author guinetik
 * @date 2026-04-03
 * @spec docs/superpowers/specs/2026-04-03-player-profile-design.md
 */
import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import type { PlayerProfile } from '@/lib/player/types'
import { uiAudio } from '@/audio/UiAudioDirector'
import {
  createProfile,
  loadProfile,
  saveProfile,
  addCredits as addCreditsToProfile,
  spendCredits as spendCreditsFromProfile,
  recordMissionComplete as recordMissionCompleteOnProfile,
  recordAsteroidVisit as recordAsteroidVisitOnProfile,
} from '@/lib/player/profile'

/** Reactive player profile store with auto-save to localStorage. */
export const usePlayerStore = defineStore('player', () => {
  const profile = ref<PlayerProfile | null>(loadProfile())

  /** Whether a player profile exists. */
  const hasProfile = computed(() => profile.value !== null)

  /** Check if the player can afford a given amount. */
  function canAfford(amount: number): boolean {
    return profile.value !== null && profile.value.credits >= amount
  }

  /** Create a new profile with the given name and save it. */
  function create(name: string) {
    profile.value = createProfile(name)
    saveProfile(profile.value)
  }

  /** Add credits to the player's balance. */
  function addCredits(amount: number) {
    if (!profile.value) return
    profile.value = addCreditsToProfile(profile.value, amount)
    saveProfile(profile.value)
    uiAudio.notifyCreditsAwarded()
  }

  /** Spend credits. Returns false if insufficient balance. */
  function spendCredits(amount: number): boolean {
    if (!profile.value) return false
    const updated = spendCreditsFromProfile(profile.value, amount)
    if (!updated) return false
    profile.value = updated
    saveProfile(profile.value)
    return true
  }

  /** Record a completed mission. */
  function recordMissionComplete() {
    if (!profile.value) return
    profile.value = recordMissionCompleteOnProfile(profile.value)
    saveProfile(profile.value)
  }

  /** Record an asteroid visit (once per mission, not per landing). */
  function recordAsteroidVisit(asteroidId: string) {
    if (!profile.value) return
    profile.value = recordAsteroidVisitOnProfile(profile.value, asteroidId)
    saveProfile(profile.value)
  }

  return {
    profile,
    hasProfile,
    canAfford,
    create,
    addCredits,
    spendCredits,
    recordMissionComplete,
    recordAsteroidVisit,
  }
})
