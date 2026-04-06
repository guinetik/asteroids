<script setup lang="ts">
import type { ActiveShipMessage } from '@/lib/messages/messageTypes'

const props = defineProps<{
  message: ActiveShipMessage
}>()

const subjectId = `ship-message-subject-${props.message.id}`

const emit = defineEmits<{
  dismiss: []
}>()
</script>

<template>
  <div class="ship-message-dialog">
    <section
      class="ship-message-card"
      role="dialog"
      aria-modal="true"
      :aria-labelledby="subjectId"
    >
      <header class="ship-message-card__chrome">
        <span>ShipNet / Stored Message</span>
        <span>Link Stable</span>
      </header>

      <div class="ship-message-card__body">
        <aside class="ship-message-card__meta">
          <div class="ship-message-card__meta-row">
            <div class="ship-message-card__meta-label">From</div>
            <div class="ship-message-card__meta-value">{{ props.message.from }}</div>
          </div>

          <div class="ship-message-card__meta-row">
            <div class="ship-message-card__meta-label">Date</div>
            <div class="ship-message-card__meta-value">{{ props.message.sentAt }}</div>
          </div>

          <div class="ship-message-card__meta-row">
            <div class="ship-message-card__meta-label">Status</div>
            <div class="ship-message-card__meta-value">{{ props.message.status }}</div>
          </div>
        </aside>

        <div class="ship-message-card__content">
          <h2 :id="subjectId" class="ship-message-card__subject">{{ props.message.subject }}</h2>

          <div class="ship-message-card__copy">
            <p
              v-for="(paragraph, index) in props.message.body"
              :key="`${props.message.id}-${index}`"
            >
              {{ paragraph }}
            </p>
          </div>

          <footer class="ship-message-card__footer">
            <span class="ship-message-card__hint">Stored aboard habitat shuttle memory</span>
            <button
              type="button"
              class="ship-message-card__button"
              @click="emit('dismiss')"
            >
              Dismiss
            </button>
          </footer>
        </div>
      </div>
    </section>
  </div>
</template>
