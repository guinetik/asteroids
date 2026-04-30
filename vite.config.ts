import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'
import tailwindcss from '@tailwindcss/vite'

/** Local dev server port (`bun dev`). */
const DEV_SERVER_PORT = 9988

// https://vite.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    port: DEV_SERVER_PORT,
  },
  plugins: [
    tailwindcss(),
    vue(),
    ...(mode === 'development' ? [vueDevTools()] : []),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    },
  },
  build: {
    /** Map + post-processing stack intentionally exceed defaults; gzipped payloads stay ~177–180 kB each. */
    chunkSizeWarningLimit: 800,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/vue-router/')) return 'vendor-vue-router'
          if (id.includes('node_modules/pinia/')) return 'vendor-pinia'
          if (id.includes('node_modules/howler/')) return 'vendor-howler'
          if (id.includes('node_modules/three/')) return 'vendor-three'
          if (id.includes('node_modules/postprocessing/')) return 'vendor-postprocessing'
          if (
            id.includes('node_modules/vue/') ||
            id.includes('node_modules/@vue/') ||
            id.includes('node_modules/vue-demi/')
          ) {
            return 'vendor-vue'
          }
        },
      },
    },
  },
}))
