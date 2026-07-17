import { describe, it, expect } from 'vitest'
import { isPrivateIp } from './fetch-metadata-server'

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
