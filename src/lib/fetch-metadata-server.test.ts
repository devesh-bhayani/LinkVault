import { describe, it, expect } from 'vitest'
import { isPrivateIp, decodeEntities, getMeta } from './fetch-metadata-server'

describe('isPrivateIp', () => {
  it('blocks IPv4 loopback and unspecified', () => {
    expect(isPrivateIp('127.0.0.1')).toBe(true)
    expect(isPrivateIp('127.255.255.254')).toBe(true)
    expect(isPrivateIp('0.0.0.0')).toBe(true)
  })

  it('blocks RFC1918 private ranges', () => {
    expect(isPrivateIp('10.0.0.1')).toBe(true)
    expect(isPrivateIp('172.16.0.1')).toBe(true)
    expect(isPrivateIp('172.31.255.255')).toBe(true)
    expect(isPrivateIp('192.168.1.1')).toBe(true)
  })

  it('blocks link-local (cloud metadata) and CGNAT', () => {
    expect(isPrivateIp('169.254.169.254')).toBe(true)
    expect(isPrivateIp('100.64.0.1')).toBe(true)
    expect(isPrivateIp('100.127.255.255')).toBe(true)
  })

  it('blocks multicast and reserved', () => {
    expect(isPrivateIp('224.0.0.1')).toBe(true)
    expect(isPrivateIp('255.255.255.255')).toBe(true)
  })

  it('allows public IPv4', () => {
    expect(isPrivateIp('8.8.8.8')).toBe(false)
    expect(isPrivateIp('93.184.216.34')).toBe(false)
    expect(isPrivateIp('172.15.0.1')).toBe(false) // just outside 172.16/12
    expect(isPrivateIp('172.32.0.1')).toBe(false)
    expect(isPrivateIp('100.63.255.255')).toBe(false) // just outside CGNAT
    expect(isPrivateIp('9.255.255.255')).toBe(false)
  })

  it('blocks IPv6 loopback, unspecified, unique-local, link-local', () => {
    expect(isPrivateIp('::1')).toBe(true)
    expect(isPrivateIp('::')).toBe(true)
    expect(isPrivateIp('fc00::1')).toBe(true)
    expect(isPrivateIp('fd12:3456::1')).toBe(true)
    expect(isPrivateIp('fe80::1')).toBe(true)
    expect(isPrivateIp('febf::1')).toBe(true)
  })

  it('blocks IPv4-mapped IPv6 forms of private addresses', () => {
    expect(isPrivateIp('::ffff:127.0.0.1')).toBe(true)
    expect(isPrivateIp('::ffff:192.168.1.1')).toBe(true)
    expect(isPrivateIp('::ffff:8.8.8.8')).toBe(false)
  })

  it('allows public IPv6', () => {
    expect(isPrivateIp('2606:4700:4700::1111')).toBe(false)
    expect(isPrivateIp('fec0::1')).toBe(false) // deprecated site-local, outside fe80::/10
  })
})

describe('decodeEntities', () => {
  it('decodes the named entities sites actually emit', () => {
    expect(decodeEntities('Tom &amp; Jerry')).toBe('Tom & Jerry')
    expect(decodeEntities('&lt;tag&gt;')).toBe('<tag>')
    expect(decodeEntities('&quot;quoted&quot;')).toBe('"quoted"')
    expect(decodeEntities('it&#039;s')).toBe("it's")
    expect(decodeEntities('it&apos;s')).toBe("it's")
  })

  it('decodes decimal and hex numeric entities', () => {
    expect(decodeEntities('caf&#233;')).toBe('café')
    expect(decodeEntities('caf&#xe9;')).toBe('café')
  })

  it('decodes astral code points to a single emoji, not two broken halves', () => {
    // Regression: String.fromCharCode truncated these (GAPS #14).
    expect(decodeEntities('&#128512;')).toBe('😀')
    expect(decodeEntities('&#x1F600;')).toBe('😀')
  })

  it('leaves out-of-range numeric entities as literal text', () => {
    expect(decodeEntities('&#99999999;')).toBe('&#99999999;')
  })

  it('trims surrounding whitespace', () => {
    expect(decodeEntities('  padded  ')).toBe('padded')
  })
})

describe('getMeta', () => {
  it('reads content when the name attribute comes first', () => {
    expect(getMeta('<meta property="og:title" content="Hello">', 'og:title')).toBe('Hello')
  })

  it('reads content when the content attribute comes first', () => {
    expect(getMeta('<meta content="Hello" property="og:title">', 'og:title')).toBe('Hello')
  })

  it('accepts name= as well as property=', () => {
    expect(getMeta('<meta name="description" content="Desc">', 'description')).toBe('Desc')
  })

  it('decodes entities inside the extracted value', () => {
    expect(getMeta('<meta name="description" content="A &amp; B">', 'description')).toBe('A & B')
  })

  it('returns null when the tag is absent', () => {
    expect(getMeta('<meta name="other" content="x">', 'og:title')).toBeNull()
  })
})
