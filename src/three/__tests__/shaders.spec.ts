import { readFileSync, readdirSync } from 'node:fs'
import { dirname, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import glslx from 'glslx'
import { describe, expect, it } from 'vitest'

const __dirname = dirname(fileURLToPath(import.meta.url))
const projectRoot = resolve(__dirname, '../../..')
const shaderRoot = resolve(projectRoot, 'src/three/shaders')

const threeJsStubs = readFileSync(resolve(shaderRoot, 'threejs-stubs.glsl'), 'utf-8')
const commonShader = readFileSync(resolve(shaderRoot, 'common.glsl'), 'utf-8')
const fragmentShadersWithCommon = new Set([
  'gasGiant.frag.glsl',
  'rockyPlanet.frag.glsl',
  'star.frag.glsl',
  'corona.frag.glsl',
])

/**
 * Expand simple #define NAME value macros (glslx does not support preprocessor directives).
 * Conditional directives are stripped so both branches are compiled together.
 *
 * @param source - Raw shader source.
 * @returns Source compatible with glslx parsing.
 */
function expandDefines(source: string): string {
  const defines: Array<[RegExp, string]> = []
  const output: string[] = []
  const lines = source.split('\n')

  for (const line of lines) {
    const trimmed = line.trim()
    if (/^\s*#(ifndef|ifdef|if|elif|else|endif)\b/.test(trimmed)) {
      continue
    }
    const match = line.match(/^\s*#define\s+(\w+)\s+(.+)$/)
    if (match) {
      const defineName = match[1]
      const defineValue = match[2]
      if (!defineName || !defineValue) {
        continue
      }
      defines.push([new RegExp(`\\b${defineName}\\b`, 'g'), defineValue.trim()])
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
 * @param filePath - Absolute shader path.
 * @returns Source ready for glslx compilation.
 */
function resolveSource(filePath: string): string {
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
 * @param dir - Directory to scan.
 * @returns Absolute shader file paths.
 */
function collectShaderFiles(dir: string): string[] {
  const files: string[] = []
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

describe('GLSL shader compilation', () => {
  it.each(shaderFiles.map((filePath) => [relative(projectRoot, filePath), filePath]))(
    '%s compiles',
    (_label, filePath) => {
      const source = resolveSource(filePath)
      const result = glslx.compile(source, { format: 'json', renaming: 'none' })

      if (result.output === null) {
        throw new Error(`Shader compilation failed:\n${result.log}`)
      }

      expect(result.output).not.toBeNull()
    },
  )
})
