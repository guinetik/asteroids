import { createRouter, createWebHistory } from 'vue-router'
import HomeView from '@/views/HomeView.vue'
import { canAccessLevelRoute } from '@/lib/level/levelRouteAccess'
import { canAccessMapRoute } from '@/lib/map/mapRouteAccess'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'home',
      component: HomeView,
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
      path: '/map',
      name: 'map',
      component: () => import('@/views/MapView.vue'),
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
  if (to.name === 'map' && !canAccessMapRoute()) {
    return { name: 'home' }
  }
  if (to.name !== 'level') return true
  if (canAccessLevelRoute(to.query)) return true
  return { name: 'map' }
})

export default router
