/**
 * Copies `dist/index.html` to `dist/404.html` after a production build.
 *
 * GitHub Pages serves `404.html` for unknown paths. Using the same shell as
 * `index.html` lets the client router handle deep links (Vue history mode).
 *
 * @author guinetik
 * @date 2026-04-30
 */

import { copyFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = fileURLToPath(new URL('..', import.meta.url))
const distIndex = join(repoRoot, 'dist', 'index.html')
const dist404 = join(repoRoot, 'dist', '404.html')

if (!existsSync(distIndex)) {
  console.error('copy-spa-fallback: dist/index.html not found. Run `bun run build-only` first.')
  process.exit(1)
}

copyFileSync(distIndex, dist404)
console.log('copy-spa-fallback: wrote dist/404.html')
