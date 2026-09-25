/**
 * Tests for the ipv4_split tool (subnet planning).
 *
 * ORACLE: test/oracle/anchors.py
 *
 * Every numeric expectation below is produced by the independent Python
 * oracle (stdlib `ipaddress`, sections A–H) — never by mental arithmetic.
 * Reproduce with: `python3 test/oracle/anchors.py`.
 */

import { describe, expect, it } from 'vitest'
import { buildIpcalcTools, SPLIT_LIMIT, SPLIT_RENDER_CAP } from '../src/tools.ts'

const tools = buildIpcalcTools()

/** Recursive lossless-JSON guard: no key may hold undefined (R7/R18 discipline). */
function assertNoUndefined(value: unknown, path: string): void {
  if (value === undefined) throw new Error(`undefined value at ${path}`)
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertNoUndefined(item, `${path}[${index}]`))
    return
  }
  if (typeof value === 'object' && value !== null) {
    for (const [key, item] of Object.entries(value)) assertNoUndefined(item, `${path}.${key}`)
  }
}

describe('ipv4_split — split by part count', () => {
  it('splits a /24 into 4 × /26 (oracle section A)', async () => {
    const result = await tools.ipv4_split.execute({ cidr: '10.0.0.0/24', parts: 4 })
    assertNoUndefined(result, 'result')
    expect(result.valid).toBe(true)
    expect(result.cidr).toBe('10.0.0.0/24')
    expect(result.source_prefix).toBe(24)
    expect(result.new_prefix).toBe(26)
    expect(result.count).toBe(4)
    expect(result.addresses_each).toBe(64)
    expect(result.usable_each).toBe(62)
    expect(result.first).toBe('10.0.0.0/26')
    expect(result.last).toBe('10.0.0.192/26')
    expect(result.cidrs).toEqual(['10.0.0.0/26', '10.0.0.64/26', '10.0.0.128/26', '10.0.0.192/26'])
  })

  it('treats a /30 split in two as an RFC 3021 pair (oracle section H)', async () => {
    const result = await tools.ipv4_split.execute({ cidr: '10.0.0.0/30', parts: 2 })
    assertNoUndefined(result, 'result')
    expect(result.new_prefix).toBe(31)
    expect(result.count).toBe(2)
    expect(result.addresses_each).toBe(2)
    expect(result.usable_each).toBe(2)
    expect(result.cidrs).toEqual(['10.0.0.0/31', '10.0.0.2/31'])
    expect(result.note).toContain('RFC 3021')
  })

  it('produces single hosts when the parts need a /32 (oracle section D)', async () => {
    const result = await tools.ipv4_split.execute({ cidr: '10.1.1.0/30', parts: 4 })
    assertNoUndefined(result, 'result')
    expect(result.new_prefix).toBe(32)
    expect(result.count).toBe(4)
    expect(result.addresses_each).toBe(1)
    expect(result.usable_each).toBe(1)
    expect(result.first).toBe('10.1.1.0/32')
    expect(result.last).toBe('10.1.1.3/32')
    expect(result.note).toContain('single host')
  })

  it('splits a /22 into 8 × /25 inside a documentation block (oracle section F)', async () => {
    const result = await tools.ipv4_split.execute({ cidr: '198.51.100.0/22', parts: 8 })
    assertNoUndefined(result, 'result')
    expect(result.new_prefix).toBe(25)
    expect(result.count).toBe(8)
    expect(result.addresses_each).toBe(128)
    expect(result.usable_each).toBe(126)
    expect(result.first).toBe('198.51.100.0/25')
    expect(result.last).toBe('198.51.103.128/25')
  })
})

describe('ipv4_split — split by target prefix', () => {
  it('masks host bits away before splitting (oracle section B)', async () => {
    const result = await tools.ipv4_split.execute({ cidr: '192.168.1.77/24', prefix: 30 })
    assertNoUndefined(result, 'result')
    expect(result.cidr).toBe('192.168.1.0/24')
    expect(result.source_prefix).toBe(24)
    expect(result.new_prefix).toBe(30)
    expect(result.count).toBe(64)
    expect(result.addresses_each).toBe(4)
    expect(result.usable_each).toBe(2)
    expect(result.first).toBe('192.168.1.0/30')
    expect(result.last).toBe('192.168.1.252/30')
    expect(result.cidrs?.length).toBe(64)
  })

  it('accepts a dotted netmask as the source and notes the /31 convention (oracle section C)', async () => {
    const result = await tools.ipv4_split.execute({ cidr: '172.16.0.0/255.255.255.252', prefix: 31 })
    assertNoUndefined(result, 'result')
    expect(result.cidr).toBe('172.16.0.0/30')
    expect(result.source_prefix).toBe(30)
    expect(result.count).toBe(2)
    expect(result.usable_each).toBe(2)
    expect(result.cidrs).toEqual(['172.16.0.0/31', '172.16.0.2/31'])
    expect(result.note).toContain('RFC 3021')
  })

  it('allows exactly the 256-subnet limit (oracle section E)', async () => {
    const result = await tools.ipv4_split.execute({ cidr: '10.0.0.0/16', prefix: 24 })
    assertNoUndefined(result, 'result')
    expect(result.valid).toBe(true)
    expect(result.count).toBe(256)
    expect(result.addresses_each).toBe(256)
    expect(result.usable_each).toBe(254)
    expect(result.first).toBe('10.0.0.0/24')
    expect(result.last).toBe('10.0.255.0/24')
    expect(result.cidrs?.length).toBe(256)
  })
})

describe('ipv4_split — rejected inputs', () => {
  it('refuses a split above the subnet limit (oracle section G)', async () => {
    const result = await tools.ipv4_split.execute({ cidr: '10.0.0.0/8', prefix: 24 })
    expect(result.valid).toBe(false)
    expect(result.reason).toContain('65536')
    expect(result.reason).toContain('256')
  })

  it('requires exactly one of parts or prefix', async () => {
    const both = await tools.ipv4_split.execute({ cidr: '10.0.0.0/24', parts: 2, prefix: 26 })
    expect(both.valid).toBe(false)
    expect(both.reason).toContain('exactly one')
    const neither = await tools.ipv4_split.execute({ cidr: '10.0.0.0/24' })
    expect(neither.valid).toBe(false)
    expect(neither.reason).toContain('exactly one')
  })

  it('rejects non-power-of-two and out-of-range part counts', async () => {
    const three = await tools.ipv4_split.execute({ cidr: '10.0.0.0/24', parts: 3 })
    expect(three.valid).toBe(false)
    expect(three.reason).toContain('power of two')
    const one = await tools.ipv4_split.execute({ cidr: '10.0.0.0/24', parts: 1 })
    expect(one.valid).toBe(false)
    expect(one.reason).toContain('>= 2')
    const huge = await tools.ipv4_split.execute({ cidr: '10.0.0.0/24', parts: 512 })
    expect(huge.valid).toBe(false)
    expect(huge.reason).toContain('limited to 256')
  })

  it('refuses a prefix that would not create subnets', async () => {
    const same = await tools.ipv4_split.execute({ cidr: '10.0.0.0/24', prefix: 24 })
    expect(same.valid).toBe(false)
    expect(same.reason).toContain('greater than the source prefix')
    const wider = await tools.ipv4_split.execute({ cidr: '10.0.0.0/24', prefix: 16 })
    expect(wider.valid).toBe(false)
    expect(wider.reason).toContain('greater than the source prefix')
  })

  it('rejects an out-of-range prefix and an invalid CIDR', async () => {
    const high = await tools.ipv4_split.execute({ cidr: '10.0.0.0/24', prefix: 33 })
    expect(high.valid).toBe(false)
    expect(high.reason).toContain('between 0 and 32')
    const bad = await tools.ipv4_split.execute({ cidr: '10.0.0.256/24', parts: 2 })
    expect(bad.valid).toBe(false)
    expect(bad.reason).toContain('not a valid IPv4 CIDR')
  })

  it('refuses a parts count that cannot fit into /32', async () => {
    const result = await tools.ipv4_split.execute({ cidr: '10.0.0.0/31', parts: 4 })
    expect(result.valid).toBe(false)
    expect(result.reason).toContain('exceeds /32')
  })
})

describe('ipv4_split — text rendering', () => {
  it('renders every subnet when the list is short', async () => {
    const result = await tools.ipv4_split.execute({ cidr: '10.0.0.0/24', parts: 4 })
    const block = tools.ipv4_split.output.render({ cidr: '10.0.0.0/24' }, result)
    expect(block[0]?.type).toBe('text')
    expect(block[0]?.text).toContain('10.0.0.0/24 → 4 × /26 subnet(s), 62 usable host(s) each')
    expect(block[0]?.text).toContain('10.0.0.192/26')
  })

  it('elides the tail of a long subnet list', async () => {
    const result = await tools.ipv4_split.execute({ cidr: '10.0.0.0/16', prefix: 24 })
    const block = tools.ipv4_split.output.render({ cidr: '10.0.0.0/16' }, result)
    expect(SPLIT_RENDER_CAP).toBe(12)
    expect(SPLIT_LIMIT).toBe(256)
    expect(block[0]?.text).toContain('… and 244 more')
    expect(block[0]?.text).not.toContain('10.0.255.0/24')
  })

  it('renders an invalid split as a reason line', () => {
    const block = tools.ipv4_split.output.render(
      { cidr: 'x' },
      { valid: false, input: 'x', reason: 'parts must be a power of two' },
    )
    expect(block[0]?.text).toBe('invalid input: parts must be a power of two')
  })
})
