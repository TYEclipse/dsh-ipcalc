/**
 * Tests for IPv6 parsing, RFC 5952 normalization and classification.
 * Anchor values were computed with an independent closed-form script.
 */

import { describe, expect, it } from 'vitest'
import {
  bigIntToHextets,
  classifyV6,
  normalizeV6,
  parseV6,
  parseV6Cidr,
  v6SubnetOf,
  v6ToBigInt,
} from '../src/ipv6.ts'

describe('parseV6', () => {
  it('parses the loopback address', () => {
    const parsed = parseV6('::1')!
    expect(parsed.hextets).toEqual([0, 0, 0, 0, 0, 0, 0, 1])
    expect(parsed.full).toBe('0000:0000:0000:0000:0000:0000:0000:0001')
    expect(parsed.normalized).toBe('::1')
    expect(parsed.class).toBe('loopback')
  })

  it('parses a documentation address', () => {
    const parsed = parseV6('2001:db8::1')!
    expect(parsed.normalized).toBe('2001:db8::1')
    expect(parsed.class).toBe('documentation')
    expect(parsed.hex128).toBe('20010db8000000000000000000000001')
  })

  it.each([
    ['fe80::1', 'link_local'],
    ['fd12:3456::1', 'unique_local'],
    ['fc00::1', 'unique_local'],
    ['fdff::1', 'unique_local'],
    ['ff02::1', 'multicast'],
    ['ff00::', 'multicast'],
    ['2001:4860:4860::8888', 'global'],
    ['::', 'unspecified'],
    ['fe7f::1', 'global'],
    ['fec0::1', 'global'],
  ])('classifies %s as %s', (text, expected) => {
    expect(parseV6(text)!.class).toBe(expected)
  })

  it('parses IPv4-mapped addresses with the embedded address', () => {
    const parsed = parseV6('::ffff:192.168.1.1')!
    expect(parsed.class).toBe('ipv4_mapped')
    expect(parsed.embeddedIpv4).toBe('192.168.1.1')
    expect(parsed.full).toBe('0000:0000:0000:0000:0000:ffff:c0a8:0101')
    expect(parsed.normalized).toBe('::ffff:c0a8:101')
  })

  it('parses IPv4-compatible addresses', () => {
    const parsed = parseV6('::192.168.1.1')!
    expect(parsed.class).toBe('ipv4_compatible')
    expect(parsed.embeddedIpv4).toBe('192.168.1.1')
  })

  it('compresses the longest zero run and keeps ties leftmost', () => {
    const parsed = parseV6('2001:0db8:0:0:1:0:0:1')!
    expect(parsed.full).toBe('2001:0db8:0000:0000:0001:0000:0000:0001')
    expect(parsed.normalized).toBe('2001:db8::1:0:0:1')
  })

  it('compresses only runs of two or more zeros', () => {
    expect(parseV6('2001:db8:0:1::1')!.normalized).toBe('2001:db8:0:1::1')
  })

  it('expands full-form addresses without change', () => {
    const parsed = parseV6('2001:4860:4860:0000:0000:0000:0000:8888')!
    expect(parsed.normalized).toBe('2001:4860:4860::8888')
  })

  it('normalizes the unspecified address to ::', () => {
    const parsed = parseV6('::')!
    expect(parsed.normalized).toBe('::')
    expect(parsed.hex128).toBe('00000000000000000000000000000000')
  })

  it.each([
    'gg::1',
    '1::2::3',
    ':::',
    '',
    '1.2.3.4',
    '1:2',
    '1:2:3:4:5:6:7:8:9',
    '2001:db8::1%eth0',
    '::1.2.3.999',
    '12345::1',
  ])('rejects %s', (text) => {
    expect(parseV6(text)).toBeNull()
  })
})

describe('normalizeV6', () => {
  it('handles a zero run at the start', () => {
    expect(normalizeV6([0, 0, 0, 0, 0, 1, 2, 3])).toBe('::1:2:3')
  })

  it('handles a zero run at the end', () => {
    expect(normalizeV6([1, 2, 3, 0, 0, 0, 0, 0])).toBe('1:2:3::')
  })

  it('handles no zeros and single zeros without compressing', () => {
    expect(normalizeV6([1, 2, 3, 4, 5, 6, 7, 8])).toBe('1:2:3:4:5:6:7:8')
    expect(normalizeV6([1, 0, 2, 3, 4, 5, 6, 7])).toBe('1:0:2:3:4:5:6:7')
  })
})

describe('classifyV6', () => {
  it('uses the IPv4-mapped pattern for ::ffff:x.x.x.x', () => {
    const hextets = [0, 0, 0, 0, 0, 0xffff, 0xc0a8, 0x0101]
    expect(classifyV6(hextets)).toBe('ipv4_mapped')
  })

  it('treats non-mapped all-zero prefixes as IPv4-compatible', () => {
    expect(classifyV6([0, 0, 0, 0, 0, 0, 0xc0a8, 0x0101])).toBe('ipv4_compatible')
  })
})

describe('v6 BigInt conversion', () => {
  it('round-trips hextets through 128-bit integers', () => {
    const hextets = [0x2001, 0x0db8, 0xffff, 0x0000, 0x1234, 0x5678, 0x9abc, 0xdef0]
    expect(bigIntToHextets(v6ToBigInt(hextets))).toEqual(hextets)
    expect(v6ToBigInt([0, 0, 0, 0, 0, 0, 0, 1])).toBe(1n)
    expect(v6ToBigInt([0, 0, 0, 0, 0, 0, 0, 0])).toBe(0n)
    expect(bigIntToHextets(1n)).toEqual([0, 0, 0, 0, 0, 0, 0, 1])
  })

  it('handles the all-ones value', () => {
    const max = (1n << 128n) - 1n
    expect(bigIntToHextets(max)).toEqual([0xffff, 0xffff, 0xffff, 0xffff, 0xffff, 0xffff, 0xffff, 0xffff])
  })
})

describe('parseV6Cidr', () => {
  it('parses addr/prefix notation', () => {
    const spec = parseV6Cidr('2001:db8::1/64')!
    expect(spec.prefix).toBe(64)
    expect(spec.parsed.normalized).toBe('2001:db8::1')
  })

  it('treats a bare address as /128', () => {
    const spec = parseV6Cidr('fe80::1')!
    expect(spec.prefix).toBe(128)
  })

  it('rejects malformed input', () => {
    expect(parseV6Cidr('2001:db8::/129')).toBeNull()
    expect(parseV6Cidr('2001:db8::/x')).toBeNull()
    expect(parseV6Cidr('2001:db8::/64/3')).toBeNull()
    expect(parseV6Cidr('')).toBeNull()
    expect(parseV6Cidr('/64')).toBeNull()
    expect(parseV6Cidr('192.168.1.0/24')).toBeNull()
  })
})

describe('v6SubnetOf', () => {
  it('computes a /64 layout (oracle anchor)', () => {
    const spec = parseV6Cidr('2001:db8:1234:5678::1/64')!
    const info = v6SubnetOf(spec)
    expect(info.cidr).toBe('2001:db8:1234:5678::/64')
    expect(info.network).toBe('2001:db8:1234:5678::')
    expect(info.last).toBe('2001:db8:1234:5678:ffff:ffff:ffff:ffff')
    expect(info.first_host).toBe('2001:db8:1234:5678::1')
    expect(info.addresses).toBe('18446744073709551616')
    expect(info.usable_hosts).toBe('18446744073709551614')
    expect(info.network_class).toBe('documentation')
  })

  it('treats /128 as a single host and /127 per RFC 6164', () => {
    const single = v6SubnetOf(parseV6Cidr('::1/128')!)
    expect(single.addresses).toBe('1')
    expect(single.usable_hosts).toBe('1')
    expect(single.first_host).toBe('::1')
    expect(single.note).toContain('single host')
    const p2p = v6SubnetOf(parseV6Cidr('fe80::1/127')!)
    expect(p2p.addresses).toBe('2')
    expect(p2p.usable_hosts).toBe('2')
    expect(p2p.note).toContain('RFC 6164')
  })
})
