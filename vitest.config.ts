import { fileURLToPath } from 'node:url'
import type { ConfigEnv } from 'vite'
import { mergeConfig, defineConfig, configDefaults } from 'vitest/config'
import viteConfig from './vite.config'

const vitestResolvedEnv: ConfigEnv = { command: 'serve', mode: 'test' }
const viteBase = typeof viteConfig === 'function' ? viteConfig(vitestResolvedEnv) : viteConfig

export default mergeConfig(
  viteBase,
  defineConfig({
    test: {
      environment: 'jsdom',
      exclude: [...configDefaults.exclude, 'e2e/**'],
      root: fileURLToPath(new URL('./', import.meta.url)),
      setupFiles: ['./src/test-setup.ts'],
    },
  }),
)
