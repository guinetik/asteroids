#!/usr/bin/env node
/**
 * Bakes the virus mesh pivot so the scene bounding-box center sits at the world origin.
 * Use after export or on `public/models/virus.glb` when the source asset is off-center.
 *
 * @author guinetik
 * @date 2026-04-08
 */

import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { NodeIO } from '@gltf-transform/core'
import { center } from '@gltf-transform/functions'

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const DEFAULT_PATH = resolve(REPO_ROOT, 'public', 'models', 'virus.glb')

const inputPath = process.argv[2] ? resolve(REPO_ROOT, process.argv[2]) : DEFAULT_PATH
const outputPath = process.argv[3] ? resolve(REPO_ROOT, process.argv[3]) : inputPath

const io = new NodeIO()
const document = await io.read(inputPath)
await document.transform(center({ pivot: 'center' }))
await io.write(outputPath, document)
console.info(`Centered at origin → ${outputPath}`)
