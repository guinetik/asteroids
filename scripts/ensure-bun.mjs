/**
 * Fail fast when `npm install` / `pnpm install` / `yarn` is used.
 * This repo expects `bun install` only.
 *
 * @see https://bun.sh/docs/cli/install
 */
const execPath = String(process.env.npm_execpath ?? '')
const normalized = execPath.replaceAll('\\', '/')
if (execPath && !/\/bun(\.exe)?$/i.test(normalized)) {
  console.error(
    '[asteroids] Install dependencies with Bun only: bun install\n'
      + '  (https://bun.sh — npm/pnpm/yarn are not supported for this project.)',
  )
  process.exit(1)
}
