import { createRouter, createWebHistory } from 'vue-router'
import { canAccessLevelRoute } from '@/lib/level/levelRouteAccess'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'map',
      component: () => import('@/views/MapView.vue'),
    },
    {
      path: '/shuttle',
      name: 'shuttle',
      component: () => import('@/views/ShuttleView.vue'),
    },
    {
      path: '/lander',
      name: 'lander',
      component: () => import('@/views/LanderView.vue'),
    },
    {
      path: '/fps',
      name: 'fps',
      component: () => import('@/views/FpsView.vue'),
    },
    {
      path: '/level',
      name: 'level',
      component: () => import('@/views/LevelView.vue'),
    },
  ],
})

router.beforeEach((to) => {
  if (to.name !== 'level') return true
  if (canAccessLevelRoute(to.query)) return true
  return { name: 'map' }
})

export default router
