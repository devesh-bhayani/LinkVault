import { describe, it, expect } from 'vitest'
import { normalizeUrl } from './url-normalize'

describe('normalizeUrl', () => {
  it('strips utm_* tracking params', () => {
    expect(normalizeUrl('https://example.com/p?utm_source=ig&utm_medium=dm')).toBe(
      'https://example.com/p',
    )
  })

  it('strips known click-id params (fbclid, igshid, etc.)', () => {
    expect(normalizeUrl('https://example.com/p?fbclid=123&igshid=xyz')).toBe(
      'https://example.com/p',
    )
  })

  it('keeps meaningful query params but sorts them for stable equality', () => {
    expect(normalizeUrl('https://example.com/p?b=2&a=1')).toBe(
      'https://example.com/p?a=1&b=2',
    )
  })

  it('drops the www prefix and lowercases the host', () => {
    expect(normalizeUrl('https://WWW.Example.com/Path')).toBe('https://example.com/Path')
  })

  it('removes the fragment', () => {
    expect(normalizeUrl('https://example.com/p#section')).toBe('https://example.com/p')
  })

  it('trims a trailing slash from the path', () => {
    expect(normalizeUrl('https://example.com/path/')).toBe('https://example.com/path')
  })

  it('treats tracking-only variants of the same link as equal', () => {
    const a = normalizeUrl('https://www.example.com/guide/?utm_source=ig#top')
    const b = normalizeUrl('https://example.com/guide')
    expect(a).toBe(b)
  })

  it('falls back to a lowercased, slash-trimmed string for malformed input', () => {
    expect(normalizeUrl('not a url/')).toBe('not a url')
  })
})
