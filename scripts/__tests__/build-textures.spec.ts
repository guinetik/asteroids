import { join, normalize } from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  formatBytes,
  lossyWebpQualityLadder,
  outputWebpPathForSource,
  pickPreferredRasterPath,
  rasterExtensionRank,
  rasterGroupKey,
  shouldRebuildTextureWebp,
} from '../build-textures.mjs'

describe('texture webp helpers', () => {
  it('prioritizes JPG over PNG extensions for same asset base name', () => {
    const dir = normalize('repo/image/foo')
    const jpgPath = join(dir, 'n.jpg')
    const pngPath = join(dir, 'n.png')
    expect(pickPreferredRasterPath([pngPath, jpgPath])).toBe(jpgPath)

    expect(pickPreferredRasterPath([jpgPath])).toBe(jpgPath)

    expect(pickPreferredRasterPath([join(dir, 'a.jpeg'), join(dir, 'a.jpg')])).toBe(
      join(dir, 'a.jpg'),
    )
    expect(pickPreferredRasterPath([join(dir, 'x.avif'), join(dir, 'x.jpg')])).toBe(
      join(dir, 'x.jpg'),
    )
    expect(rasterExtensionRank('.jpg')).toBeLessThan(rasterExtensionRank('.png'))
    expect(rasterExtensionRank('.png')).toBeLessThan(rasterExtensionRank('.webp'))
    expect(rasterExtensionRank('.webp')).toBeLessThan(rasterExtensionRank('.avif'))
  })

  it('maps source image paths onto mirrored public `.webp` paths', () => {
    const repo = normalize('/app')
    const imageRoot = join(repo, 'image')
    const pub = join(repo, 'public')
    expect(
      outputWebpPathForSource(join(imageRoot, 'textures', 'a', 'color.jpg'), imageRoot, pub),
    ).toBe(join(pub, 'textures', 'a', 'color.webp'))

    expect(outputWebpPathForSource(join(imageRoot, 'texture.jpg'), imageRoot, pub)).toBe(
      join(pub, 'texture.webp'),
    )
  })

  it('builds deterministic duplicate-group keys', () => {
    expect(rasterGroupKey('/proj/image/x', 'map')).toBe('/proj/image/x::map')
  })

  it('formats byte counts for CLI output', () => {
    expect(formatBytes(500)).toBe('500 B')
    expect(formatBytes(1536)).toBe('1.5 KB')
    expect(formatBytes(1048576)).toBe('1.0 MB')
  })

  it('enumerates descending lossy WebP qualities for the adaptive size cap loop', () => {
    const ladder = lossyWebpQualityLadder(85, 10, 5)

    expect(ladder[0]).toBe(85)
    expect(ladder[ladder.length - 1]).toBe(10)
    expect(ladder.length).toBe(16)

    /** @type {readonly number[]} */
    const short = lossyWebpQualityLadder(82, 80, 1)
    expect(short).toEqual([82, 81, 80])
  })

  it('rebuild decision prefers skipping fresh webp but catches newer sources', () => {
    expect(shouldRebuildTextureWebp(300, 400, false)).toBe(false)
    expect(shouldRebuildTextureWebp(400, 400, false)).toBe(false)
    expect(shouldRebuildTextureWebp(500, 400, false)).toBe(true)
    expect(shouldRebuildTextureWebp(100, null, false)).toBe(true)
    expect(shouldRebuildTextureWebp(100, 900, true)).toBe(true)
  })
})
