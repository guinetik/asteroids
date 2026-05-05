<script setup lang="ts">
/**
 * Standardized on-screen key-press prompt. Replaces the ad-hoc
 * exit-prompt / habitat-prompt / mission-focus-prompt / inline EVA
 * action pill markup that was previously sprinkled across views.
 *
 * Tones color-code the *context* of the action so players learn
 * meaning from color: cyan = EVA/suit, amber = vehicle, magenta =
 * risky one-way commit (exfil), green = terminal/data/mission,
 * slate = low-stakes hint.
 *
 * @author guinetik
 * @date 2026-05-04
 * @spec docs/superpowers/specs/2026-05-04-key-prompt-standardization.md
 */
import { computed } from 'vue'

/** Available context-color tones. */
export type KeyPromptTone = 'cyan' | 'amber' | 'magenta' | 'green' | 'slate'

/** Where on the screen the prompt anchors. */
export type KeyPromptPosition =
  | 'inline'
  | 'bottom'
  | 'bottom-low'
  | 'bottom-mid'
  | 'bottom-high'
  | 'top'

/** Layout of the key vs label inside the pill. */
export type KeyPromptVariant = 'inline' | 'split'

/** Props accepted by {@link KeyPrompt}. */
interface Props {
  /** Key cap text, e.g. `V`, `F`, `ESC`, `Hold E`. */
  keyLabel: string
  /** Human-readable action label, e.g. `START MAINTENANCE`. */
  action: string
  /** Context tone — defaults to cyan (EVA / suit). */
  tone?: KeyPromptTone
  /** Screen anchor — defaults to `bottom`. */
  position?: KeyPromptPosition
  /** `inline` puts `ACTION [KEY]`; `split` puts `[KEY] ACTION`. Default `inline`. */
  variant?: KeyPromptVariant
  /** When true the prompt becomes a `<button>` and emits `click`. */
  clickable?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  tone: 'cyan',
  position: 'bottom',
  variant: 'inline',
  clickable: false,
})

const emit = defineEmits<{
  /** Emitted when the prompt is clicked (only fires when `clickable`). */
  click: []
}>()

/** Composed CSS class list for the outer element. */
const classes = computed(() => [
  'key-prompt',
  `key-prompt--${props.tone}`,
  `key-prompt--${props.position}`,
  props.clickable ? 'key-prompt--clickable' : null,
])

/** Forward click events when in clickable mode. */
function onClick(): void {
  if (props.clickable) emit('click')
}
</script>

<template>
  <button v-if="clickable" type="button" :class="classes" @click="onClick">
    <span class="key-prompt__pill">
      <template v-if="variant === 'split'">
        <span class="key-prompt__cap">{{ keyLabel }}</span>
        <span class="key-prompt__label">{{ action }}</span>
      </template>
      <template v-else>
        <span class="key-prompt__label">{{ action }}</span>
        <span class="key-prompt__cap">{{ keyLabel }}</span>
      </template>
    </span>
  </button>
  <div v-else :class="classes">
    <span class="key-prompt__pill">
      <template v-if="variant === 'split'">
        <span class="key-prompt__cap">{{ keyLabel }}</span>
        <span class="key-prompt__label">{{ action }}</span>
      </template>
      <template v-else>
        <span class="key-prompt__label">{{ action }}</span>
        <span class="key-prompt__cap">{{ keyLabel }}</span>
      </template>
    </span>
  </div>
</template>
