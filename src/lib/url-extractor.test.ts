import { describe, it, expect } from 'vitest'
import { extractUrls } from './url-extractor'

describe('extractUrls', () => {
  it('returns an empty array when there are no URLs', () => {
    expect(extractUrls('just some plain text, no links here')).toEqual([])
  })

  it('extracts a single http(s) URL from surrounding text', () => {
    expect(extractUrls('grab it here https://example.com/resource.pdf thanks')).toEqual([
      'https://example.com/resource.pdf',
    ])
  })

  it('extracts multiple URLs in one string', () => {
    const urls = extractUrls('one https://a.com and two http://b.org/path?q=1')
    expect(urls).toEqual(['https://a.com', 'http://b.org/path?q=1'])
  })

  it('keeps query strings and paths intact', () => {
    expect(extractUrls('https://notion.so/some-template-12345?v=abc')).toEqual([
      'https://notion.so/some-template-12345?v=abc',
    ])
  })

  it('does not match bare domains without a scheme', () => {
    expect(extractUrls('visit example.com for more')).toEqual([])
  })
})
