/**
 * Tests for IPv4 parsing, formatting, subnet math, classification and
 * CIDR summarization. Anchor values were computed with an independent
 * closed-form script (not round-trip self-consistency).
 */

import { describe, expect, it } from 'vitest'
import {
  classifyV4,
  formatV4,
  ip4,
  mergeRanges,
  netmaskToPrefix,
  parseCidr,
  parseV4,
  rangeToCidrs,
  subnetOf,
  summarizeSpecs,
} from '../src/ipv4.ts'

describe('parseV4', () => {
  it('parses a normal dotted quad', () => {
    const parsed = parseV4('192.168.0.1')
    expect(parsed).not.toBeNull()
    expect(parsed!.octets).toEqual([192, 168, 0, 1])
    expect(parsed!.integer).toBe(3232235521)
    expect(parsed!.text).toBe('192.168.0.1')
  })

  it('accepts boundary octets', () => {
    expect(parseV4('0.0.0.0')!.integer).toBe(0)
    expect(parseV4('255.255.255.255')!.integer).toBe(4294967295)
  })

  it.each(['999.1.1.1', '256.1.1.1', '1.2.3', '1.2.3.4.5', '01.2.3.4', '', ' 1.2.3.4', '1.2.3.a', '-1.2.3.4', '+1.2.3.4', '1..2.3'])(
    'rejects %s',
    (text) => {
      expect(parseV4(text)).toBeNull()
    },
  )
})

describe('formatV4', () => {
  it('formats integers back to dotted quads', () => {
    expect(formatV4(3232235776)).toBe('192.168.1.0')
    expect(formatV4(0)).toBe('0.0.0.0')
    expect(formatV4(4294967295)).toBe('255.255.255.255')
    expect(formatV4(168430088)).toBe('10.10.10.8')
  })

  it('round-trips arbitrary addresses', () => {
    for (const text of ['8.8.8.8', '100.127.255.254', '203.0.113.77']) {
      const parsed = parseV4(text)!
      expect(formatV4(parsed.integer)).toBe(text)
    }
  })

  it('throws on out-of-range values', () => {
    expect(() => formatV4(-1)).toThrow()
    expect(() => formatV4(2 ** 32)).toThrow()
    expect(() => formatV4(1.5)).toThrow()
  })
})

describe('netmaskToPrefix', () => {
  it.each([
    ['255.255.255.0', 24],
    ['255.255.255.248', 29],
    ['0.0.0.0', 0],
    ['255.255.255.255', 32],
    ['255.255.255.254', 31],
    ['255.192.0.0', 10],
  ])('converts %s to /%i', (mask, prefix) => {
    expect(netmaskToPrefix(mask)).toBe(prefix)
  })

  it.each(['255.255.0.255', '255.0.255.0', 'x', '1.2.3'])('rejects non-contiguous %s', (mask) => {
    expect(netmaskToPrefix(mask)).toBeNull()
  })
})

describe('parseCidr', () => {
  it('parses numeric prefixes', () => {
    const spec = parseCidr('192.168.1.25/24')!
    expect(spec.prefix).toBe(24)
    expect(spec.ip.integer).toBe(ip4(192, 168, 1, 25))
  })

  it('parses dotted-mask form', () => {
    expect(parseCidr('10.10.10.10/255.255.255.248')!.prefix).toBe(29)
  })

  it('treats bare addresses as /32', () => {
    const spec = parseCidr('172.16.5.5')!
    expect(spec.prefix).toBe(32)
    expect(spec.ip.text).toBe('172.16.5.5')
  })

  it.each(['1.2.3.4/33', '1.2.3.4/-1', '1.2.3.4/', '/24', '', '1.2.3.4/255.255.0.255', '1.2.3.4/33/5'])(
    'rejects %s',
    (text) => {
      expect(parseCidr(text)).toBeNull()
    },
  )
})

describe('subnetOf', () => {
  it('computes 192.168.1.25/24 exactly', () => {
    const info = subnetOf(parseCidr('192.168.1.25/24')!)
    expect(info.cidr).toBe('192.168.1.0/24')
    expect(info.network).toBe('192.168.1.0')
    expect(info.broadcast).toBe('192.168.1.255')
    expect(info.netmask).toBe('255.255.255.0')
    expect(info.wildcard).toBe('0.0.0.255')
    expect(info.first_host).toBe('192.168.1.1')
    expect(info.last_host).toBe('192.168.1.254')
    expect(info.addresses).toBe(256)
    expect(info.usable_hosts).toBe(254)
    expect(info.network_integer).toBe(3232235776)
    expect(info.broadcast_integer).toBe(3232236031)
    expect(info.network_class).toBe('private')
    expect(info.host_class).toBe('private')
    expect(info.note).toBeUndefined()
  })

  it('computes 10.10.10.10/255.255.255.248 exactly', () => {
    const info = subnetOf(parseCidr('10.10.10.10/255.255.255.248')!)
    expect(info.cidr).toBe('10.10.10.8/29')
    expect(info.broadcast).toBe('10.10.10.15')
    expect(info.first_host).toBe('10.10.10.9')
    expect(info.last_host).toBe('10.10.10.14')
    expect(info.usable_hosts).toBe(6)
    expect(info.network_integer).toBe(168430088)
    expect(info.broadcast_integer).toBe(168430095)
  })

  it('handles /32 as a single host', () => {
    const info = subnetOf(parseCidr('172.16.5.5')!)
    expect(info.network).toBe('172.16.5.5')
    expect(info.broadcast).toBe('172.16.5.5')
    expect(info.first_host).toBe('172.16.5.5')
    expect(info.last_host).toBe('172.16.5.5')
    expect(info.usable_hosts).toBe(1)
    expect(info.addresses).toBe(1)
    expect(info.network_integer).toBe(2886731013)
    expect(info.note).toBe('single host')
  })

  it('handles /31 per RFC 3021', () => {
    const info = subnetOf(parseCidr('192.168.1.1/31')!)
    expect(info.cidr).toBe('192.168.1.0/31')
    expect(info.first_host).toBe('192.168.1.0')
    expect(info.last_host).toBe('192.168.1.1')
    expect(info.usable_hosts).toBe(2)
    expect(info.note).toContain('RFC 3021')
  })

  it('computes the full IPv4 space for 0.0.0.0/0', () => {
    const info = subnetOf(parseCidr('0.0.0.0/0')!)
    expect(info.network).toBe('0.0.0.0')
    expect(info.broadcast).toBe('255.255.255.255')
    expect(info.netmask).toBe('0.0.0.0')
    expect(info.wildcard).toBe('255.255.255.255')
    expect(info.first_host).toBe('0.0.0.1')
    expect(info.last_host).toBe('255.255.255.254')
    expect(info.addresses).toBe(4294967296)
    expect(info.usable_hosts).toBe(4294967294)
    expect(info.broadcast_integer).toBe(4294967295)
    expect(info.network_class).toBe('unspecified')
  })

  it('classifies the CGNAT range', () => {
    const info = subnetOf(parseCidr('100.64.0.1/10')!)
    expect(info.network).toBe('100.64.0.0')
    expect(info.broadcast).toBe('100.127.255.255')
    expect(info.usable_hosts).toBe(4194302)
    expect(info.network_class).toBe('cgnat')
    expect(info.host_class).toBe('cgnat')
  })

  it('classifies broadcast and documentation networks', () => {
    expect(subnetOf(parseCidr('255.255.255.255')!).network_class).toBe('broadcast')
    expect(subnetOf(parseCidr('203.0.113.77/24')!).network_class).toBe('documentation')
    expect(subnetOf(parseCidr('8.8.8.8/24')!).network_class).toBe('global')
  })
})

describe('classifyV4', () => {
  it.each([
    ['127.0.0.1', 'loopback'],
    ['10.0.0.1', 'private'],
    ['172.16.0.1', 'private'],
    ['172.31.255.255', 'private'],
    ['172.32.0.1', 'global'],
    ['192.168.0.1', 'private'],
    ['100.64.0.1', 'cgnat'],
    ['100.127.255.254', 'cgnat'],
    ['100.128.0.1', 'global'],
    ['169.254.1.1', 'link_local'],
    ['224.0.0.1', 'multicast'],
    ['239.255.255.255', 'multicast'],
    ['240.0.0.1', 'reserved'],
    ['8.8.8.8', 'global'],
    ['198.51.100.7', 'documentation'],
    ['192.0.2.1', 'documentation'],
    ['203.0.113.1', 'documentation'],
    ['0.0.0.0', 'unspecified'],
    ['255.255.255.255', 'broadcast'],
  ])('classifies %s as %s', (text, expected) => {
    expect(classifyV4(parseV4(text)!.integer)).toBe(expected)
  })
})

describe('mergeRanges', () => {
  it('merges overlapping and adjacent ranges', () => {
    const merged = mergeRanges([
      [10, 20],
      [21, 30],
      [5, 12],
    ])
    expect(merged).toEqual([[5, 30]])
  })

  it('keeps separated ranges apart', () => {
    const merged = mergeRanges([
      [1, 2],
      [4, 5],
    ])
    expect(merged).toEqual([
      [1, 2],
      [4, 5],
    ])
  })
})

describe('rangeToCidrs', () => {
  it('covers an aligned /24 with one CIDR', () => {
    expect(rangeToCidrs(3232235776, 3232236031)).toEqual(['192.168.1.0/24'])
  })

  it('splits an unaligned trio of hosts', () => {
    expect(rangeToCidrs(3232235777, 3232235779)).toEqual(['192.168.1.1/32', '192.168.1.2/31'])
  })
})

describe('summarizeSpecs', () => {
  it('merges two adjacent /24s into a /23', () => {
    const specs = ['192.168.0.0/24', '192.168.1.0/24'].map((text) => parseCidr(text)!)
    expect(summarizeSpecs(specs)).toEqual(['192.168.0.0/23'])
  })

  it('leaves non-mergeable /24s alone', () => {
    const specs = ['192.168.1.0/24', '192.168.2.0/24'].map((text) => parseCidr(text)!)
    expect(summarizeSpecs(specs)).toEqual(['192.168.1.0/24', '192.168.2.0/24'])
  })

  it('aggregates four /24s into a /22', () => {
    const specs = ['10.0.0.0/24', '10.0.1.0/24', '10.0.2.0/24', '10.0.3.0/24'].map((text) => parseCidr(text)!)
    expect(summarizeSpecs(specs)).toEqual(['10.0.0.0/22'])
  })

  it('summarizes bare hosts', () => {
    const specs = ['192.168.1.1', '192.168.1.2', '192.168.1.3'].map((text) => parseCidr(text)!)
    expect(summarizeSpecs(specs)).toEqual(['192.168.1.1/32', '192.168.1.2/31'])
  })

  it('deduplicates identical entries', () => {
    const specs = ['10.0.0.0/24', '10.0.0.0/24'].map((text) => parseCidr(text)!)
    expect(summarizeSpecs(specs)).toEqual(['10.0.0.0/24'])
  })

  it('handles the whole IPv4 space', () => {
    const specs = ['0.0.0.0/0'].map((text) => parseCidr(text)!)
    expect(summarizeSpecs(specs)).toEqual(['0.0.0.0/0'])
  })

  it('keeps disjoint entries as separate CIDRs', () => {
    const specs = ['192.168.1.4', '192.168.1.0/30'].map((text) => parseCidr(text)!)
    expect(summarizeSpecs(specs)).toEqual(['192.168.1.0/30', '192.168.1.4/32'])
  })
})
