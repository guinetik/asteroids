<template>
  <Teleport to="body">
    <TransitionGroup
      name="achievement-slide"
      tag="div"
      class="achievement-stack"
      aria-live="polite"
      aria-relevant="additions"
    >
      <div
        v-for="item in visible"
        :key="item.id"
        class="achievement-banner"
        role="status"
      >
        <div class="achievement-banner__strip">
          <span class="achievement-banner__mark" aria-hidden="true">🏆</span>
          <span class="achievement-banner__label">Achievement unlocked</span>
        </div>
        <div class="achievement-banner__main">
          <div class="achievement-banner__icon">{{ item.icon }}</div>
          <div class="achievement-banner__body">
            <div class="achievement-banner__title">{{ item.title }}</div>
            <div class="achievement-banner__description">{{ item.description }}</div>
          </div>
          <div class="achievement-banner__type">{{ item.type }}</div>
        </div>
      </div>
    </TransitionGroup>
  </Teleport>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useAudio } from '@/audio/useAudio'

interface AchievementBannerItem {
  id: string
  icon: string
  title: string
  description: string
  type: string
}

const visible = ref<AchievementBannerItem[]>([])
const DURATION_MS = 4500

function show(icon: string, title: string, description: string, type = 'ACHIEVEMENT'): void {
  useAudio().play('ui.confirm')
  const id = `achievement-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
  visible.value.push({ id, icon, title, description, type })
  window.setTimeout(() => {
    const index = visible.value.findIndex((item) => item.id === id)
    if (index >= 0) visible.value.splice(index, 1)
  }, DURATION_MS)
}

defineExpose({ show })
</script>

<style scoped>
.achievement-stack {
  position: fixed;
  top: 88px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  flex-direction: column;
  gap: 10px;
  align-items: center;
  z-index: 120;
  pointer-events: none;
}

.achievement-banner {
  min-width: 340px;
  max-width: 520px;
  overflow: hidden;
  border: 1px solid rgba(245, 196, 92, 0.3);
  border-radius: 10px;
  background:
    linear-gradient(135deg, rgba(28, 18, 4, 0.98), rgba(13, 9, 3, 0.97));
  box-shadow:
    0 0 0 1px rgba(245, 196, 92, 0.08),
    0 14px 38px rgba(0, 0, 0, 0.45);
  backdrop-filter: blur(10px);
}

.achievement-banner__strip {
  display: flex;
  gap: 8px;
  align-items: center;
  padding: 8px 14px;
  border-bottom: 1px solid rgba(245, 196, 92, 0.18);
  background: linear-gradient(90deg, rgba(245, 196, 92, 0.22), rgba(255, 214, 120, 0.06));
}

.achievement-banner__mark {
  line-height: 1;
  font-size: 15px;
}

.achievement-banner__label {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.22em;
  color: rgba(255, 229, 153, 0.98);
  text-transform: uppercase;
}

.achievement-banner__main {
  display: flex;
  gap: 12px;
  align-items: center;
  padding: 12px 16px;
}

.achievement-banner__icon {
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid rgba(245, 196, 92, 0.22);
  border-radius: 8px;
  background: rgba(245, 196, 92, 0.08);
  font-size: 22px;
  flex-shrink: 0;
}

.achievement-banner__body {
  min-width: 0;
  flex: 1;
}

.achievement-banner__title {
  color: rgba(255, 242, 205, 0.98);
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.12em;
  margin-bottom: 4px;
}

.achievement-banner__description {
  color: rgba(233, 212, 158, 0.78);
  font-size: 11px;
  line-height: 1.45;
}

.achievement-banner__type {
  color: rgba(245, 196, 92, 0.5);
  font-size: 9px;
  letter-spacing: 0.14em;
  writing-mode: vertical-rl;
  text-orientation: mixed;
  flex-shrink: 0;
}

.achievement-slide-enter-active,
.achievement-slide-leave-active {
  transition: all 0.32s ease;
}

.achievement-slide-enter-from,
.achievement-slide-leave-to {
  opacity: 0;
  transform: translateY(-14px) scale(0.96);
}
</style>
