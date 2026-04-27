<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { uiAudio } from '@/audio/UiAudioDirector'
import type {
  TutorialProgramCard,
  TutorialProgramChapter,
  TutorialProgramManualModel,
} from './tutorialProgramTypes'

const props = defineProps<{
  manual: TutorialProgramManualModel
}>()

const emit = defineEmits<{
  'switch-to-upgrades': []
}>()

const CHAPTER_HEIGHT_TRANSITION_MS = 220

const currentChapterIndex = ref(0)
let previousChapterPanelHeight = 0
let chapterHeightFrame: number | null = null
let chapterHeightResetTimer: number | null = null

const chapterCount = computed(() => props.manual.chapters.length)
const currentChapter = computed<TutorialProgramChapter | undefined>(
  () => props.manual.chapters[currentChapterIndex.value],
)
const currentChapterNumber = computed(() => currentChapterIndex.value + 1)
const currentCards = computed(() => currentChapter.value?.cards ?? [])
const currentReadouts = computed(() => currentChapter.value?.readouts ?? [])
const currentChecklist = computed(() => currentChapter.value?.checklist ?? [])
const currentCertificate = computed(() => currentChapter.value?.certificate)
const progressDots = computed(() => props.manual.chapters.map((chapter) => chapter.id))

watch(
  () => [props.manual.documentCode, props.manual.title] as const,
  () => {
    currentChapterIndex.value = 0
  },
)

watch(
  chapterCount,
  (count) => {
    if (count === 0) {
      currentChapterIndex.value = 0
      return
    }

    if (currentChapterIndex.value >= count) {
      currentChapterIndex.value = count - 1
    }
  },
  { immediate: true },
)

const formatChapterNumber = (index: number) => String(index + 1).padStart(2, '0')

const cardToneClass = (card: TutorialProgramCard) =>
  `tutorial-program-card--${card.tone ?? 'neutral'}`

const setChapterIndex = (nextIndex: number) => {
  if (nextIndex === currentChapterIndex.value) return
  if (nextIndex < 0 || nextIndex >= chapterCount.value) return

  currentChapterIndex.value = nextIndex
  uiAudio.notifyNavClick()
}

const goToPreviousChapter = () => {
  setChapterIndex(currentChapterIndex.value - 1)
}

const goToNextChapter = () => {
  setChapterIndex(currentChapterIndex.value + 1)
}

const switchToUpgrades = () => {
  emit('switch-to-upgrades')
}

function cancelChapterHeightReset(): void {
  if (chapterHeightFrame !== null) {
    window.cancelAnimationFrame(chapterHeightFrame)
    chapterHeightFrame = null
  }

  if (chapterHeightResetTimer !== null) {
    window.clearTimeout(chapterHeightResetTimer)
    chapterHeightResetTimer = null
  }
}

function prepareChapterPanelLeave(element: Element): void {
  const panel = element as HTMLElement
  cancelChapterHeightReset()
  previousChapterPanelHeight = panel.getBoundingClientRect().height
}

function animateChapterPanelEnter(element: Element): void {
  const panel = element as HTMLElement
  const startHeight = previousChapterPanelHeight || panel.getBoundingClientRect().height
  panel.style.overflow = 'hidden'
  panel.style.blockSize = `${startHeight}px`

  // Force layout so the browser interpolates from the previous chapter height.
  void panel.offsetHeight

  chapterHeightFrame = window.requestAnimationFrame(() => {
    chapterHeightFrame = null
    panel.style.blockSize = `${panel.scrollHeight}px`
    chapterHeightResetTimer = window.setTimeout(() => {
      releaseChapterPanelHeight(panel)
    }, CHAPTER_HEIGHT_TRANSITION_MS)
  })
}

function releaseChapterPanelHeight(element: Element): void {
  cancelChapterHeightReset()
  const panel = element as HTMLElement
  panel.style.blockSize = ''
  panel.style.overflow = ''
}

onBeforeUnmount(cancelChapterHeightReset)
</script>

<template>
  <section :class="['tutorial-program', `tutorial-program--${manual.accent}`]">
    <header class="tutorial-program-header">
      <div class="tutorial-program-header__identity">
        <p class="tutorial-program-header__issuer">{{ manual.issuer }}</p>
        <h2 class="tutorial-program-header__title">{{ manual.title }}</h2>
        <p class="tutorial-program-header__document">{{ manual.documentCode }}</p>
      </div>

      <dl v-if="manual.badges.length > 0" class="tutorial-program-badges">
        <div
          v-for="badge in manual.badges"
          :key="`${badge.label}:${badge.value}`"
          :class="['tutorial-program-badge', { 'tutorial-program-badge--warning': badge.warning }]"
        >
          <dt class="tutorial-program-badge__label">{{ badge.label }}</dt>
          <dd class="tutorial-program-badge__value">{{ badge.value }}</dd>
        </div>
      </dl>
    </header>

    <div class="tutorial-program-layout">
      <nav class="tutorial-program-rail" aria-label="Tutorial program chapters">
        <p class="tutorial-program-rail__label">Chapter Index</p>
        <button
          v-for="(chapter, index) in manual.chapters"
          :key="chapter.id"
          type="button"
          :class="[
            'tutorial-program-rail__button',
            { 'tutorial-program-rail__button--active': index === currentChapterIndex },
          ]"
          :aria-current="index === currentChapterIndex ? 'step' : undefined"
          @click="setChapterIndex(index)"
        >
          <span class="tutorial-program-rail__number">{{ formatChapterNumber(index) }}</span>
          <span class="tutorial-program-rail__title">{{ chapter.navLabel }}</span>
        </button>
      </nav>

      <Transition
        name="tutorial-chapter-swap"
        mode="out-in"
        @before-leave="prepareChapterPanelLeave"
        @enter="animateChapterPanelEnter"
        @after-enter="releaseChapterPanelHeight"
        @enter-cancelled="releaseChapterPanelHeight"
      >
        <article v-if="currentChapter" :key="currentChapter.id" class="tutorial-program-content">
          <p class="tutorial-program-content__kicker">
            Chapter {{ formatChapterNumber(currentChapterIndex) }} / {{ currentChapter.navLabel }}
          </p>
          <div class="tutorial-program-content__heading">
            <h3 class="tutorial-program-content__title">{{ currentChapter.title }}</h3>
            <p v-if="currentChapter.subtitle" class="tutorial-program-content__subtitle">
              {{ currentChapter.subtitle }}
            </p>
          </div>

          <dl v-if="currentReadouts.length > 0" class="tutorial-program-readouts">
            <div
              v-for="readout in currentReadouts"
              :key="`${readout.label}:${readout.value}`"
              class="tutorial-program-readout"
            >
              <dt class="tutorial-program-readout__label">{{ readout.label }}</dt>
              <dd class="tutorial-program-readout__value">{{ readout.value }}</dd>
              <dd v-if="readout.caption" class="tutorial-program-readout__caption">
                {{ readout.caption }}
              </dd>
            </div>
          </dl>

          <div v-if="currentCards.length > 0" class="tutorial-program-card-grid">
            <section
              v-for="card in currentCards"
              :key="`${card.label ?? 'card'}:${card.title}`"
              :class="['tutorial-program-card', cardToneClass(card)]"
            >
              <p v-if="card.label" class="tutorial-program-card__label">{{ card.label }}</p>
              <h4 class="tutorial-program-card__title">{{ card.title }}</h4>
              <p class="tutorial-program-card__body">{{ card.body }}</p>
            </section>
          </div>

          <aside v-if="currentChapter.note" class="tutorial-program-note">
            <p class="tutorial-program-note__label">Issuer Note</p>
            <p class="tutorial-program-note__body">{{ currentChapter.note }}</p>
          </aside>

          <ol v-if="currentChecklist.length > 0" class="tutorial-program-checklist">
            <li
              v-for="(item, index) in currentChecklist"
              :key="`${item.title}:${index}`"
              class="tutorial-program-checklist__item"
            >
              <span class="tutorial-program-checklist__mark">{{ formatChapterNumber(index) }}</span>
              <span class="tutorial-program-checklist__copy">
                <strong class="tutorial-program-checklist__title">{{ item.title }}</strong>
                <span class="tutorial-program-checklist__body">{{ item.body }}</span>
              </span>
            </li>
          </ol>

          <section v-if="currentCertificate" class="tutorial-program-certificate">
            <div class="tutorial-program-certificate__header">
              <p class="tutorial-program-certificate__seal">{{ currentCertificate.seal }}</p>
              <h4 class="tutorial-program-certificate__title">{{ currentCertificate.title }}</h4>
            </div>

            <div class="tutorial-program-certificate__body">
              <p>{{ currentCertificate.body }}</p>
              <p class="tutorial-program-certificate__owner">{{ currentCertificate.ownerName }}</p>
              <p class="tutorial-program-certificate__fine-print">
                {{ currentCertificate.finePrint }}
              </p>
            </div>

            <footer class="tutorial-program-certificate__footer">
              <div class="tutorial-program-certificate__signature">
                <span>{{ currentCertificate.signatureName }}</span>
                <small>{{ currentCertificate.signatureTitle }}</small>
              </div>
              <p v-if="currentCertificate.quote" class="tutorial-program-certificate__quote">
                {{ currentCertificate.quote }}
              </p>
            </footer>
          </section>

          <button
            v-if="currentChapter.showUpgradeAction"
            type="button"
            class="tutorial-program-upgrade-action"
            @click="switchToUpgrades"
          >
            Open Engineering Bay Upgrades
          </button>
        </article>

        <article v-else key="empty" class="tutorial-program-content tutorial-program-content--empty">
          <p class="tutorial-program-content__kicker">No chapters loaded</p>
          <h3 class="tutorial-program-content__title">Manual data unavailable</h3>
        </article>
      </Transition>
    </div>

    <footer v-if="chapterCount > 0" class="tutorial-program-footer">
      <div class="tutorial-program-progress" aria-label="Chapter progress">
        <button
          v-for="(chapterId, index) in progressDots"
          :key="chapterId"
          type="button"
          :class="[
            'tutorial-program-progress__dot',
            { 'tutorial-program-progress__dot--active': index === currentChapterIndex },
          ]"
          :aria-label="`Go to chapter ${index + 1}`"
          :aria-current="index === currentChapterIndex ? 'step' : undefined"
          @click="setChapterIndex(index)"
        />
      </div>

      <div class="tutorial-program-footer__nav">
        <button
          type="button"
          class="tutorial-program-footer__button"
          :disabled="currentChapterIndex === 0"
          @click="goToPreviousChapter"
        >
          Previous
        </button>
        <span class="tutorial-program-footer__count">
          {{ currentChapterNumber }} / {{ chapterCount }}
        </span>
        <button
          type="button"
          class="tutorial-program-footer__button"
          :disabled="currentChapterIndex >= chapterCount - 1"
          @click="goToNextChapter"
        >
          Next
        </button>
      </div>
    </footer>
  </section>
</template>
