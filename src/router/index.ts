import { createRouter, createWebHistory } from 'vue-router'
import HomeView from '@/views/HomeView.vue'
import ShuttleView from '@/views/ShuttleView.vue'
import LanderView from '@/views/LanderView.vue'
import FpsView from '@/views/FpsView.vue'
import LevelView from '@/views/LevelView.vue'

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
      component: ShuttleView,
    },
    {
      path: '/lander',
      name: 'lander',
      component: LanderView,
    },
    {
      path: '/map',
      name: 'map',
      component: () => import('@/views/MapView.vue'),
    },
    {
      path: '/fps',
      name: 'fps',
      component: FpsView,
    },
    {
      path: '/level',
      name: 'level',
      component: LevelView,
    },
  ],
})

export default router
