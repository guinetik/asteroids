<script setup lang="ts">
/**
 * Scramble/reveal text effect. Each character cycles through random glyphs
 * for a few frames before locking to the target character, with a stagger
 * delay between adjacent characters to produce a left-to-right typing feel.
 *
 * Ported from the irover project's ScrambleText component, adapted to use
 * {@link uiAudio.notifyType} for the per-character typing cue.
 *
 * @author guinetik
 * @date 2026-05-01
 */
import { onMounted, onUnmounted, ref, watch } from 'vue'
import { uiAudio } from '@/audio/UiAudioDirector'

const props = withDefaults(
  defineProps<{
    /** Final text to reveal once all characters have locked in. */
    text: string
    /** When false, jump straight to the final text and stop animating. */
    play?: boolean
    /** Pool of glyphs sampled while a character is still scrambling. */
    chars?: string
    /** Milliseconds between animation frames (lower = faster). */
    speed?: number
    /** How many frames a character scrambles before locking to its target. */
    scrambleFrames?: number
    /** Frames of delay between adjacent characters starting to animate. */
    stagger?: number
    /** When true, plays the UI typing cue while characters reveal. */
    playSound?: boolean
    /** Milliseconds to wait before the animation begins. */
    delay?: number
  }>(),
  {
    play: true,
    chars: '!<>-_\\/[]{}—=+*^?#________',
    speed: 30,
    scrambleFrames: 8,
    stagger: 2,
    playSound: false,
    delay: 0,
  },
)

const emit = defineEmits<{
  (e: 'complete'): void
}>()

const displayText = ref('')
let frame = 0
let animationFrameId: number | null = null
let timeoutId: number | null = null
let lastTime = 0

function randomChar(): string {
  return props.chars[Math.floor(Math.random() * props.chars.length)] ?? ''
}

function update(time: number): void {
  if (!lastTime) lastTime = time
  const delta = time - lastTime

  if (delta >= props.speed) {
    lastTime = time - (delta % props.speed)
    frame++

    let output = ''
    let allLocked = true

    for (let i = 0; i < props.text.length; i++) {
      const char = props.text[i] ?? ''

      if (char === ' ' || char === '\n') {
        if (frame >= i * props.stagger) {
          output += char
        } else {
          allLocked = false
        }
        continue
      }

      const startFrame = i * props.stagger
      const lockFrame = startFrame + props.scrambleFrames

      if (frame >= lockFrame) {
        output += char
      } else if (frame >= startFrame) {
        output += randomChar()
        allLocked = false
      } else {
        allLocked = false
      }
    }

    displayText.value = output

    if (props.playSound && !allLocked && frame % Math.max(1, props.stagger) === 0) {
      uiAudio.notifyType()
    }

    if (allLocked && frame > 0) {
      if (animationFrameId !== null) {
        cancelAnimationFrame(animationFrameId)
        animationFrameId = null
      }
      emit('complete')
      return
    }
  }

  animationFrameId = requestAnimationFrame(update)
}

function start(): void {
  if (animationFrameId !== null) cancelAnimationFrame(animationFrameId)
  if (timeoutId !== null) clearTimeout(timeoutId)

  frame = 0
  lastTime = 0
  displayText.value = ''

  if (props.delay > 0) {
    timeoutId = window.setTimeout(() => {
      animationFrameId = requestAnimationFrame(update)
    }, props.delay)
  } else {
    animationFrameId = requestAnimationFrame(update)
  }
}

watch(
  () => props.play,
  (newVal) => {
    if (newVal) {
      start()
    } else {
      displayText.value = props.text
      if (animationFrameId !== null) {
        cancelAnimationFrame(animationFrameId)
        animationFrameId = null
      }
      if (timeoutId !== null) {
        clearTimeout(timeoutId)
        timeoutId = null
      }
    }
  },
)

watch(
  () => props.text,
  () => {
    if (props.play) {
      start()
    } else {
      displayText.value = props.text
    }
  },
)

onMounted(() => {
  if (props.play) {
    start()
  } else {
    displayText.value = props.text
  }
})

onUnmounted(() => {
  if (animationFrameId !== null) {
    cancelAnimationFrame(animationFrameId)
  }
  if (timeoutId !== null) {
    clearTimeout(timeoutId)
  }
})
</script>

<template>
  <span class="scramble-text">{{ displayText }}</span>
</template>

<style scoped>
.scramble-text {
  display: inline;
  white-space: pre-wrap;
}
</style>
