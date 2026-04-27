import { join, normalize } from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  formatBytes,
  outputPathForInput,
  presetForFileName,
  shouldUseOptimizedCandidate,
} from '../optimize-sound.mjs'

describe('optimize sound helpers', () => {
  it('selects stereo music presets for ambient, level, and theme files', () => {
    expect(presetForFileName('ambient.space.mp3')).toEqual({ bitrate: '128k', channels: 2 })
    expect(presetForFileName('level_rescue.mp3')).toEqual({ bitrate: '128k', channels: 2 })
    expect(presetForFileName('theme.mp3')).toEqual({ bitrate: '128k', channels: 2 })
  })

  it('selects mono voice presets for named voice files', () => {
    expect(presetForFileName('jay-001.mp3')).toEqual({ bitrate: '96k', channels: 1 })
    expect(presetForFileName('marta-001.mp3')).toEqual({ bitrate: '96k', channels: 1 })
  })

  it('selects compact mono presets for UI and SFX files', () => {
    expect(presetForFileName('ui.click.mp3')).toEqual({ bitrate: '64k', channels: 1 })
    expect(presetForFileName('sfx.collect.mp3')).toEqual({ bitrate: '64k', channels: 1 })
  })

  it('falls back to mono dialogue quality for unknown MP3 names', () => {
    expect(presetForFileName('mission-briefing.mp3')).toEqual({ bitrate: '96k', channels: 1 })
  })

  it('maps source paths under sound to matching public sound paths', () => {
    const sourceDir = normalize('repo/sound')
    const outputDir = normalize('repo/public/sound')
    const inputPath = join(sourceDir, 'ui', 'click.mp3')

    expect(outputPathForInput(inputPath, sourceDir, outputDir)).toBe(
      join(outputDir, 'ui', 'click.mp3'),
    )
  })

  it('formats byte counts for human-readable reports', () => {
    expect(formatBytes(500)).toBe('500 B')
    expect(formatBytes(1536)).toBe('1.5 KB')
    expect(formatBytes(1048576)).toBe('1.0 MB')
  })

  it('keeps the source file when an optimized candidate would be larger', () => {
    expect(shouldUseOptimizedCandidate(1000, 999)).toBe(true)
    expect(shouldUseOptimizedCandidate(1000, 1000)).toBe(false)
    expect(shouldUseOptimizedCandidate(1000, 1001)).toBe(false)
  })
})
