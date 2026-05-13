#!/usr/bin/env node
/**
 * Bakes the corner piece pivot so its bounding-box centre sits at the
 * world origin. The piece was exported from Blender with the original
 * world-space offset baked in, which breaks the room builder's per-corner
 * placement math.
 *
 * @author guinetik
 * @date 2026-05-13
 */
import { resolve } from 'node:path'
import { NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import { center } from '@gltf-transform/functions'
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer'

const INPUT = resolve('public/models/station/pieces/corner.glb')
const OUTPUT = resolve('public/models/station/pieces/corner.glb')

const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({
    'meshopt.decoder': MeshoptDecoder,
    'meshopt.encoder': MeshoptEncoder,
  })

await MeshoptDecoder.ready
await MeshoptEncoder.ready

const doc = await io.read(INPUT)
await doc.transform(center({ pivot: 'center' }))
await io.write(OUTPUT, doc)
console.info(`Centered → ${OUTPUT}`)
