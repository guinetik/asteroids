<script setup lang="ts">
defineProps<{
  visible: boolean
}>()

const emit = defineEmits<{
  close: []
}>()

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    emit('close')
  }
}
</script>

<template>
  <div v-if="visible" class="ship-message-dialog" @keydown="onKeydown" tabindex="0" ref="root">
    <div class="ship-message-card" style="max-width: 36rem;">
      <div class="ship-message-card__chrome">
        <span>Shuttle Control</span>
        <button
          type="button"
          class="ship-message-card__button"
          @click="$emit('close')"
        >
          Close
        </button>
      </div>
      <div class="ship-message-card__content" style="min-height: 12rem;">
        <div class="ship-message-card__copy">
          <!-- Placeholder for future shuttle control content -->
        </div>
      </div>
      <div class="ship-message-card__footer">
        <span class="ship-message-card__hint">ESC  Close</span>
      </div>
    </div>
  </div>
</template>
