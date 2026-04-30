import { describe, expect, it } from 'vitest'
import {
  MAIL_AUTHOR_PORTRAIT_BY_FROM,
  resolveMailAuthorPortraitHref,
} from '@/lib/messages/mailAuthorPortraits'

describe('mailAuthorPortraits', () => {
  it('resolves known contract senders', () => {
    expect(resolveMailAuthorPortraitHref('Jay Mercer')).toBe('/portraits/jay.webp')
    expect(resolveMailAuthorPortraitHref('Mr. Finch, Saturn Ringside Estate')).toBe(
      '/portraits/finch.webp',
    )
    expect(resolveMailAuthorPortraitHref('Carmen Sedna-Deimos · Neptune Commune')).toBe(
      '/portraits/carmen.webp',
    )
  })

  it('returns null for unknown senders', () => {
    expect(resolveMailAuthorPortraitHref('Dispatcher')).toBeNull()
    expect(resolveMailAuthorPortraitHref('— — —')).toBeNull()
  })

  it('keeps map entries unique per key', () => {
    const keys = Object.keys(MAIL_AUTHOR_PORTRAIT_BY_FROM)
    expect(new Set(keys).size).toBe(keys.length)
  })
})
