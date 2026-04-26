<template>
  <Teleport to="body">
    <Transition name="achievement-dialog-fade">
      <div v-if="open" class="achievement-dialog-overlay" @click.self="emitClose">
        <div
          class="achievement-dialog"
          role="dialog"
          aria-modal="true"
          aria-labelledby="achievement-dialog-title"
        >
          <div class="achievement-dialog__header">
            <div>
              <h2 id="achievement-dialog-title" class="achievement-dialog__title">ACHIEVEMENTS</h2>
              <p class="achievement-dialog__summary">
                {{ unlockedIds.length }}/{{ totalCount }} unlocked
              </p>
            </div>
            <button
              type="button"
              class="achievement-dialog__close"
              aria-label="Close"
              @click="emitClose"
            >
              &times;
            </button>
          </div>
          <div class="achievement-dialog__body">
            <section
              v-for="group in groups"
              :key="group.category"
              class="achievement-dialog__section"
            >
              <h3 class="achievement-dialog__section-title">{{ group.label }}</h3>
              <ul class="achievement-dialog__list" role="list">
                <li
                  v-for="item in group.items"
                  :key="item.id"
                  class="achievement-dialog__row"
                  :class="{ 'achievement-dialog__row--locked': !isUnlocked(item.id) }"
                >
                  <div class="achievement-dialog__icon" aria-hidden="true">
                    {{ isUnlocked(item.id) ? item.icon : '?' }}
                  </div>
                  <div class="achievement-dialog__text">
                    <div class="achievement-dialog__row-title">{{ item.title }}</div>
                    <div class="achievement-dialog__row-subtitle">{{ item.subtitle }}</div>
                    <div class="achievement-dialog__row-description">
                      {{
                        isUnlocked(item.id)
                          ? item.description
                          : getAchievementLockedHint(item, progress)
                      }}
                    </div>
                  </div>
                  <div class="achievement-dialog__meta">
                    {{ item.type }} · +{{ item.rewardCredits.toLocaleString() }} CR
                  </div>
                </li>
              </ul>
            </section>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useAudio } from '@/audio/useAudio'
import {
  getAchievementGroups,
  getAchievementLockedHint,
  type AchievementGroup,
} from '@/lib/achievements'
import type { AchievementProgress } from '@/data/achievements'

const props = defineProps<{
  open: boolean
  progress: AchievementProgress
  unlockedIds: string[]
}>()

const emit = defineEmits<{
  close: []
}>()

const groups = computed<AchievementGroup[]>(() => getAchievementGroups())
const totalCount = computed(() => groups.value.reduce((sum, group) => sum + group.items.length, 0))

function isUnlocked(id: string): boolean {
  return props.unlockedIds.includes(id)
}

function emitClose(): void {
  useAudio().play('ui.confirm')
  emit('close')
}
</script>

<style scoped>
.achievement-dialog-overlay {
  position: fixed;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: rgba(0, 8, 10, 0.72);
  backdrop-filter: blur(8px);
  z-index: 160;
}

.achievement-dialog {
  width: min(720px, 100%);
  max-height: min(82vh, 760px);
  display: flex;
  flex-direction: column;
  border: 1px solid rgba(245, 196, 92, 0.2);
  border-radius: 14px;
  overflow: hidden;
  background:
    radial-gradient(circle at top, rgba(80, 53, 10, 0.38), transparent 35%),
    linear-gradient(180deg, rgba(18, 12, 3, 0.985), rgba(10, 7, 2, 0.985));
  box-shadow: 0 24px 70px rgba(0, 0, 0, 0.5);
}

.achievement-dialog__header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
  padding: 18px 20px 14px;
  border-bottom: 1px solid rgba(245, 196, 92, 0.14);
}

.achievement-dialog__title {
  margin: 0;
  font-size: 15px;
  letter-spacing: 0.24em;
  color: rgba(255, 229, 153, 0.98);
}

.achievement-dialog__summary {
  margin: 6px 0 0;
  font-size: 11px;
  color: rgba(245, 196, 92, 0.68);
  letter-spacing: 0.08em;
}

.achievement-dialog__close {
  border: none;
  background: transparent;
  color: rgba(245, 196, 92, 0.55);
  font-size: 26px;
  line-height: 1;
  cursor: pointer;
}

.achievement-dialog__body {
  overflow-y: auto;
  padding: 16px 20px 20px;
  scrollbar-width: thin;
  scrollbar-color: rgba(245, 196, 92, 0.42) rgba(34, 22, 6, 0.95);
}

.achievement-dialog__body::-webkit-scrollbar {
  width: 12px;
}

.achievement-dialog__body::-webkit-scrollbar-track {
  background: rgba(34, 22, 6, 0.95);
  border-left: 1px solid rgba(245, 196, 92, 0.08);
}

.achievement-dialog__body::-webkit-scrollbar-thumb {
  background: linear-gradient(180deg, rgba(245, 196, 92, 0.6), rgba(201, 144, 44, 0.7));
  border: 2px solid rgba(34, 22, 6, 0.95);
  border-radius: 999px;
}

.achievement-dialog__body::-webkit-scrollbar-thumb:hover {
  background: linear-gradient(180deg, rgba(255, 214, 120, 0.78), rgba(214, 154, 50, 0.88));
}

.achievement-dialog__section + .achievement-dialog__section {
  margin-top: 18px;
}

.achievement-dialog__section-title {
  margin: 0 0 8px;
  color: rgba(245, 196, 92, 0.72);
  font-size: 10px;
  letter-spacing: 0.18em;
  text-transform: uppercase;
}

.achievement-dialog__list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.achievement-dialog__row {
  display: flex;
  gap: 12px;
  align-items: center;
  padding: 12px 14px;
  border: 1px solid rgba(245, 196, 92, 0.14);
  border-radius: 10px;
  background: rgba(25, 16, 4, 0.82);
}

.achievement-dialog__row--locked {
  opacity: 0.72;
  border-style: dashed;
}

.achievement-dialog__icon {
  width: 38px;
  height: 38px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
  border: 1px solid rgba(245, 196, 92, 0.14);
  background: rgba(245, 196, 92, 0.08);
  flex-shrink: 0;
  font-size: 20px;
}

.achievement-dialog__text {
  min-width: 0;
  flex: 1;
}

.achievement-dialog__row-title {
  margin-bottom: 2px;
  color: rgba(255, 242, 205, 0.98);
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.1em;
}

.achievement-dialog__row-subtitle {
  margin-bottom: 6px;
  color: rgba(245, 196, 92, 0.72);
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.06em;
  line-height: 1.35;
}

.achievement-dialog__row-description {
  color: rgba(230, 209, 158, 0.8);
  font-size: 11px;
  line-height: 1.45;
}

.achievement-dialog__meta {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0.35rem 0.55rem;
  border: 1px solid rgba(245, 196, 92, 0.14);
  border-radius: 999px;
  background: rgba(245, 196, 92, 0.06);
  color: rgba(247, 238, 216, 0.78);
  font-size: 9px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  white-space: nowrap;
  flex-shrink: 0;
}

.achievement-dialog-fade-enter-active,
.achievement-dialog-fade-leave-active {
  transition: opacity 0.2s ease;
}

.achievement-dialog-fade-enter-from,
.achievement-dialog-fade-leave-to {
  opacity: 0;
}
</style>
