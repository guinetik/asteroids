import { readdirSync, readFileSync } from 'node:fs'
import { dirname, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import glslx from 'glslx'

const __dirname = dirname(fileURLToPath(import.meta.url))
const projectRoot = resolve(__dirname, '..')
const shaderRoot = resolve(projectRoot, 'src/three/shaders')
const stubsPath = resolve(shaderRoot, 'threejs-stubs.glsl')
const commonPath = resolve(shaderRoot, 'common.glsl')

const threeJsStubs = readFileSync(stubsPath, 'utf-8')
const commonShader = readFileSync(commonPath, 'utf-8')
const fragmentShadersWithCommon = new Set([
  'gasGiant.frag.glsl',
  'rockyPlanet.frag.glsl',
  'star.frag.glsl',
])

/**
 * Expand simple #define NAME value macros (glslx does not support preprocessor directives).
 * Conditional directives are stripped so both branches are compiled together.
 *
 * @param {string} source - Raw shader source.
 * @returns {string} Source compatible with glslx parsing.
 */
function expandDefines(source) {
  /** @type {Array<[RegExp, string]>} */
  const defines = []
  /** @type {string[]} */
  const output = []
  const lines = source.split('\n')

  for (const line of lines) {
    const trimmed = line.trim()
    if (/^\s*#(ifndef|ifdef|if|elif|else|endif)\b/.test(trimmed)) {
      continue
    }
    const match = line.match(/^\s*#define\s+(\w+)\s+(.+)$/)
    if (match) {
      defines.push([new RegExp(`\\b${match[1]}\\b`, 'g'), match[2].trim()])
      continue
    }
    output.push(line)
  }

  let result = output.join('\n')
  for (const [pattern, value] of defines) {
    result = result.replace(pattern, value)
  }
  return result
}

/**
 * Compose shader source with the minimum required library chunks for compilation.
 *
 * @param {string} filePath - Absolute shader path.
 * @returns {string} Source ready for glslx compilation.
 */
function resolveSource(filePath) {
  const source = readFileSync(filePath, 'utf-8')
  const isFragment = filePath.endsWith('.frag.glsl')
  const fileName = filePath.replace(/\\/g, '/').split('/').pop()

  const chunks = [threeJsStubs]
  if (isFragment && fileName && fragmentShadersWithCommon.has(fileName)) {
    chunks.push(commonShader)
  }
  chunks.push(source)

  return expandDefines(chunks.join('\n'))
}

/**
 * Recursively collect .vert.glsl and .frag.glsl files.
 *
 * @param {string} dir - Directory to scan.
 * @returns {string[]} Absolute shader file paths.
 */
function collectShaderFiles(dir) {
  /** @type {string[]} */
  const files = []
  const entries = readdirSync(dir, { withFileTypes: true })
  for (const entry of entries) {
    const absolute = resolve(dir, entry.name)
    if (entry.isDirectory()) {
      files.push(...collectShaderFiles(absolute))
      continue
    }
    const isCompilableShader = absolute.endsWith('.vert.glsl') || absolute.endsWith('.frag.glsl')
    if (isCompilableShader) {
      files.push(absolute)
    }
  }
  return files
}

const shaderFiles = collectShaderFiles(shaderRoot)

const green = (value) => `\x1b[32m${value}\x1b[0m`
const red = (value) => `\x1b[31m${value}\x1b[0m`
const bold = (value) => `\x1b[1m${value}\x1b[0m`

let failures = 0

console.log(bold(`\nLinting ${shaderFiles.length} GLSL shaders...\n`))

for (const filePath of shaderFiles) {
  const label = relative(projectRoot, filePath)
  const source = resolveSource(filePath)
  const result = glslx.compile(source, { format: 'json', renaming: 'none' })

  if (result.output !== null) {
    console.log(`  ${green('PASS')}  ${label}`)
    continue
  }

  failures++
  console.log(`  ${red('FAIL')}  ${label}`)
  console.log(`        ${result.log.trim().split('\n').join('\n        ')}`)
}

console.log()
if (failures > 0) {
  console.log(red(bold(`${failures} shader(s) failed.\n`)))
  process.exit(1)
}

console.log(green(bold(`All ${shaderFiles.length} shaders passed.\n`)))
