/**
 * Publishes `dist/` to the `gh-pages` branch without per-file `git rm` argv.
 *
 * The `gh-pages` npm package calls `git rm -- ...` with one path per asset; on
 * Windows the command line exceeds {@link https://learn.microsoft.com/en-us/troubleshoot/windows-client/shell-experience/command-line-string-limitation | CreateProcess limits}
 * (`ENAMETOOLONG`). This script replaces the tree by deleting files in the
 * worktree (except `.git`) and copying `dist/` in, then `git add -A`.
 *
 * @author guinetik
 * @date 2026-04-30
 */

import { spawnSync } from 'node:child_process'
import {
  existsSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  cpSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

/** Remote branch that GitHub Pages serves when using “Deploy from branch”. */
const GH_PAGES_BRANCH = 'gh-pages'

/** Commit message for production deploys. */
const DEPLOY_COMMIT_MESSAGE = 'chore: deploy'

const repoRoot = fileURLToPath(new URL('..', import.meta.url))
const distDir = join(repoRoot, 'dist')

/**
 * Runs a command; throws if the process fails.
 *
 * @param {string} command Executable (e.g. `git`).
 * @param {string[]} args Argument list.
 * @param {string} cwd Working directory.
 * @param {'inherit' | 'pipe'} stdio Stdio mode.
 * @returns {import('node:child_process').SpawnSyncReturns<string | Buffer>} Result.
 */
function run(command, args, cwd, stdio = 'inherit') {
  const result = spawnSync(command, args, {
    cwd,
    stdio,
    encoding: stdio === 'pipe' ? 'utf8' : undefined,
  })
  if (result.error) {
    throw result.error
  }
  if (result.status !== 0 && result.status !== null) {
    const hint = stdio === 'pipe' ? `${result.stdout}\n${result.stderr}` : ''
    throw new Error(
      `${command} ${args.join(' ')} exited with ${result.status}${hint ? `: ${hint}` : ''}`,
    )
  }
  return result
}

/**
 * @param {string} cwd Repo root (main project).
 * @returns {string} `origin` URL.
 */
function getOriginUrl(cwd) {
  const r = run('git', ['remote', 'get-url', 'origin'], cwd, 'pipe')
  return (r.stdout ?? '').trim()
}

/**
 * @param {string} cwd Repo root (main project).
 * @returns {boolean} Whether `origin` has `gh-pages`.
 */
function remoteHasGhPages(cwd) {
  const r = spawnSync('git', ['ls-remote', '--heads', 'origin', GH_PAGES_BRANCH], {
    cwd,
    encoding: 'utf8',
  })
  return r.status === 0 && (r.stdout ?? '').trim().length > 0
}

/**
 * Removes every path in `dir` except the `.git` directory.
 *
 * @param {string} dir Git worktree root.
 */
function emptyWorktreeExceptGit(dir) {
  for (const name of readdirSync(dir)) {
    if (name === '.git') continue
    rmSync(join(dir, name), { recursive: true, force: true })
  }
}

/**
 * Validates inputs, clones or initializes `gh-pages`, copies `dist/`, commits, and pushes.
 */
function main() {
  if (!existsSync(join(distDir, 'index.html'))) {
    console.error('deploy-gh-pages: dist/index.html missing. Run `bun run build` first.')
    process.exit(1)
  }

  const originUrl = getOriginUrl(repoRoot)
  if (!originUrl) {
    console.error('deploy-gh-pages: no `origin` remote URL.')
    process.exit(1)
  }

  const tmpRoot = tmpdir()
  /** @type {string | undefined} */
  let workDir

  try {
    workDir = mkdtempSync(join(tmpRoot, 'asteroids-gh-pages-'))

    if (remoteHasGhPages(repoRoot)) {
      run(
        'git',
        ['clone', '--depth', '1', '--single-branch', '--branch', GH_PAGES_BRANCH, originUrl, workDir],
        repoRoot,
      )
    } else {
      run('git', ['init'], workDir)
      run('git', ['remote', 'add', 'origin', originUrl], workDir)
      run('git', ['checkout', '--orphan', GH_PAGES_BRANCH], workDir)
    }

    emptyWorktreeExceptGit(workDir)

    cpSync(distDir, workDir, { recursive: true })

    run('git', ['add', '-A'], workDir)

    const staged = spawnSync('git', ['diff', '--staged', '--quiet'], { cwd: workDir })
    if (staged.status === 0) {
      console.log('deploy-gh-pages: no changes; skipping commit.')
    } else {
      run('git', ['commit', '-m', DEPLOY_COMMIT_MESSAGE], workDir)
    }

    run('git', ['push', 'origin', GH_PAGES_BRANCH], workDir)
    console.log('deploy-gh-pages: pushed', GH_PAGES_BRANCH)
  } catch (err) {
    console.error(err)
    process.exit(1)
  } finally {
    if (workDir) rmSync(workDir, { recursive: true, force: true })
  }
}

main()
