<script setup lang="ts">
/**
 * Shown after a Vibe Jam portal arrival completes docking to Earth orbit.
 * Welcomes the player by name and, for first-time visitors, offers a choice
 * between watching the opening cinematic or jumping straight into the game.
 */
const props = defineProps<{
  /** Whether the dialog is visible. */
  visible: boolean
  /** Player's display name — seeded from the portal `username` param. */
  playerName: string
  /** True when the player has never seen the intro cinematic. */
  isFirstVisit: boolean
}>()

const emit = defineEmits<{
  /** Player chose to watch the intro cinematic. */
  'watch-intro': []
  /** Player chose to skip straight to free play. */
  skip: []
}>()
</script>

<template>
  <Transition name="portal-welcome">
    <div v-if="props.visible" class="portal-welcome-backdrop" role="dialog" aria-modal="true" aria-label="Portal arrival welcome">
      <div class="portal-welcome-card">

        <header class="portal-welcome-card__chrome">
          <span class="portal-welcome-card__chrome-tag">Vibe Jam 2026 · Inter-Game Portal</span>
          <span class="portal-welcome-card__chrome-status">
            <span class="portal-welcome-card__status-dot" />
            Docked
          </span>
        </header>

        <div class="portal-welcome-card__body">
          <div class="portal-welcome-card__icon" aria-hidden="true">◈</div>

          <h1 class="portal-welcome-card__title">
            Welcome, <span class="portal-welcome-card__name">{{ props.playerName }}</span>
          </h1>

          <p class="portal-welcome-card__subtitle">
            You have arrived via inter-game portal and are now in orbit above Earth.
          </p>

          <template v-if="props.isFirstVisit">
            <p class="portal-welcome-card__prompt">
              This is your first time here. Would you like to watch the opening briefing?
            </p>
            <div class="portal-welcome-card__actions">
              <button
                type="button"
                class="portal-welcome-card__btn portal-welcome-card__btn--primary"
                @click="emit('watch-intro')"
              >
                Watch Briefing
              </button>
              <button
                type="button"
                class="portal-welcome-card__btn portal-welcome-card__btn--secondary"
                @click="emit('skip')"
              >
                Skip — Explore Now
              </button>
            </div>
          </template>

          <template v-else>
            <p class="portal-welcome-card__prompt">
              Your ship is secured in Earth orbit. Controls are ready.
            </p>
            <div class="portal-welcome-card__actions">
              <button
                type="button"
                class="portal-welcome-card__btn portal-welcome-card__btn--primary"
                @click="emit('skip')"
              >
                Continue
              </button>
            </div>
          </template>
        </div>

        <footer class="portal-welcome-card__footer">
          <span class="portal-welcome-card__footer-hint">Press E to launch from orbit · M to open star map</span>
        </footer>

      </div>
    </div>
  </Transition>
</template>
