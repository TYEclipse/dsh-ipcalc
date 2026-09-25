/**
 * Tests for the ipv4_range tool (arbitrary address range → minimal CIDR list).
 *
 * ORACLE: test/oracle/anchors.py
 *
 * Every numeric expectation below is produced by the independent Python
 * oracle (stdlib `ipaddress.summarize_address_range`, sections I–N) — never by
 * mental arithmetic. Reproduce with: `python3 test/oracle/anchors.py`.
 */

import { describe, expect, it } from 'vitest'
import { buildIpcalcTools } from '../src/tools.ts'

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

describe('ipv4_range — minimal CIDR cover', () => {
  it('covers a messy ACL range with 13 blocks (oracle section I)', async () => {
    const result = await tools.ipv4_range.execute({ start: '10.0.5.3', end: '10.0.9.200' })
    assertNoUndefined(result, 'result')
    expect(result.valid).toBe(true)
    expect(result.start).toBe('10.0.5.3')
    expect(result.end).toBe('10.0.9.200')
    expect(result.count).toBe(13)
    expect(result.addresses_covered).toBe(1222)
    expect(result.cidrs).toEqual([
      '10.0.5.3/32', '10.0.5.4/30', '10.0.5.8/29', '10.0.5.16/28', '10.0.5.32/27',
      '10.0.5.64/26', '10.0.5.128/25', '10.0.6.0/23', '10.0.8.0/24', '10.0.9.0/25',
      '10.0.9.128/26', '10.0.9.192/29', '10.0.9.200/32',
    ])
  })

  it('collapses an already aligned range to a single block (oracle section J)', async () => {
    const result = await tools.ipv4_range.execute({ start: '192.168.0.0', end: '192.168.0.255' })
    assertNoUndefined(result, 'result')
    expect(result.count).toBe(1)
    expect(result.addresses_covered).toBe(256)
    expect(result.cidrs).toEqual(['192.168.0.0/24'])
  })

  it('reports a single address as one /32 (oracle section K)', async () => {
    const result = await tools.ipv4_range.execute({ start: '10.0.0.7', end: '10.0.0.7' })
    assertNoUndefined(result, 'result')
    expect(result.count).toBe(1)
    expect(result.addresses_covered).toBe(1)
    expect(result.cidrs).toEqual(['10.0.0.7/32'])
    expect(result.note).toContain('single address')
  })

  it('covers the whole IPv4 space with 0.0.0.0/0 (oracle section L)', async () => {
    const result = await tools.ipv4_range.execute({ start: '0.0.0.0', end: '255.255.255.255' })
    assertNoUndefined(result, 'result')
    expect(result.count).toBe(1)
    expect(result.addresses_covered).toBe(4294967296)
    expect(result.cidrs).toEqual(['0.0.0.0/0'])
  })

  it('brackets a /12 range with 30 blocks (oracle section M)', async () => {
    const result = await tools.ipv4_range.execute({ start: '172.16.0.1', end: '172.16.255.254' })
    assertNoUndefined(result, 'result')
    expect(result.count).toBe(30)
    expect(result.addresses_covered).toBe(65534)
    expect(result.cidrs?.length).toBe(30)
    expect(result.cidrs?.[0]).toBe('172.16.0.1/32')
    expect(result.cidrs?.[29]).toBe('172.16.255.254/32')
  })

  it('keeps an aligned /29 tail as one block (oracle section N)', async () => {
    const result = await tools.ipv4_range.execute({ start: '203.0.113.8', end: '203.0.113.15' })
    assertNoUndefined(result, 'result')
    expect(result.count).toBe(1)
    expect(result.addresses_covered).toBe(8)
    expect(result.cidrs).toEqual(['203.0.113.8/29'])
  })

  it('trims surrounding whitespace on both ends', async () => {
    const result = await tools.ipv4_range.execute({ start: '  10.0.0.7 ', end: '10.0.0.7  ' })
    assertNoUndefined(result, 'result')
    expect(result.valid).toBe(true)
    expect(result.start).toBe('10.0.0.7')
    expect(result.end).toBe('10.0.0.7')
  })
})

describe('ipv4_range — rejected inputs', () => {
  it('rejects a reversed range with a reason', async () => {
    const result = await tools.ipv4_range.execute({ start: '10.0.0.9', end: '10.0.0.1' })
    expect(result.valid).toBe(false)
    expect(result.reason).toContain('greater than end')
  })

  it('rejects CIDR notation for both ends', async () => {
    const startCidr = await tools.ipv4_range.execute({ start: '10.0.0.0/24', end: '10.0.0.255' })
    expect(startCidr.valid).toBe(false)
    expect(startCidr.reason).toContain('bare')
    const endCidr = await tools.ipv4_range.execute({ start: '10.0.0.0', end: '10.0.0.255/24' })
    expect(endCidr.valid).toBe(false)
    expect(endCidr.reason).toContain('bare')
  })

  it('rejects addresses that are not valid dotted quads', async () => {
    const bad = await tools.ipv4_range.execute({ start: '999.1.1.1', end: '10.0.0.1' })
    expect(bad.valid).toBe(false)
    expect(bad.reason).toContain('not a valid')
    const empty = await tools.ipv4_range.execute({ start: '', end: '10.0.0.1' })
    expect(empty.valid).toBe(false)
    expect(empty.reason).toContain('not a valid')
  })
})

describe('ipv4_range — text rendering', () => {
  it('renders the cover with a header line', async () => {
    const result = await tools.ipv4_range.execute({ start: '10.0.5.3', end: '10.0.9.200' })
    const block = tools.ipv4_range.output.render({ start: '10.0.5.3', end: '10.0.9.200' }, result)
    expect(block[0]?.type).toBe('text')
    expect(block[0]?.text).toContain('10.0.5.3 – 10.0.9.200 → 13 CIDR(s) covering 1222 address(es)')
    expect(block[0]?.text).toContain('10.0.9.200/32')
  })

  it('renders the single-address note', async () => {
    const result = await tools.ipv4_range.execute({ start: '10.0.0.7', end: '10.0.0.7' })
    const block = tools.ipv4_range.output.render({ start: '10.0.0.7', end: '10.0.0.7' }, result)
    expect(block[0]?.text).toContain('note: single address (one /32)')
  })

  it('renders an invalid range as a reason line', () => {
    const block = tools.ipv4_range.output.render(
      { start: 'b', end: 'a' },
      { valid: false, reason: 'start (10.0.0.9) is greater than end (10.0.0.1)' },
    )
    expect(block[0]?.text).toBe('invalid input: start (10.0.0.9) is greater than end (10.0.0.1)')
  })
})

describe('ipv4_range — cross-tool invariants', () => {
  it('agrees with ipv4_summarize on the generated cover', async () => {
    const ranged = await tools.ipv4_range.execute({ start: '10.0.5.3', end: '10.0.9.200' })
    const summarized = await tools.ipv4_summarize.execute({ networks: ranged.cidrs ?? [] })
    expect(summarized.valid).toBe(true)
    expect(summarized.output_count).toBe(ranged.count)
    expect(summarized.addresses_covered).toBe(ranged.addresses_covered)
    expect(summarized.cidrs).toEqual(ranged.cidrs)
  })

  it('every generated block stays inside the requested range', async () => {
    const ranged = await tools.ipv4_range.execute({ start: '10.0.5.3', end: '10.0.9.200' })
    const from = await tools.ip_parse.execute({ ip: '10.0.5.3' })
    const to = await tools.ip_parse.execute({ ip: '10.0.9.200' })
    expect(ranged.cidrs?.length).toBeGreaterThan(0)
    for (const cidr of ranged.cidrs ?? []) {
      const block = await tools.ipv4_subnet.execute({ cidr })
      expect(block.valid).toBe(true)
      expect(block.network_integer! >= from.integer!).toBe(true)
      expect(block.broadcast_integer! <= to.integer!).toBe(true)
    }
  })
})
