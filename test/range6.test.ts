/**
 * Tests for the ipv6_range tool (arbitrary IPv6 range → minimal CIDR cover, roadmap A).
 *
 * ORACLE: test/oracle/anchors.py
 *
 * Every numeric expectation below is produced by the independent Python
 * oracle (stdlib `ipaddress.summarize_address_range`, sections V1–V9) — never
 * by mental arithmetic. Reproduce with: `python3 test/oracle/anchors.py`.
 */

import { describe, expect, it } from 'vitest'
import { buildIpcalcTools, PLAN_RENDER_CAP } from '../src/tools.ts'
import { assertLossless } from './helpers/lossless-json.ts'

const tools = buildIpcalcTools()

describe('ipv6_range — minimal exact cover', () => {
  it('covers an unaligned range inside one /120 with 5 blocks (oracle V1)', async () => {
    const result = await tools.ipv6_range.execute({ start: '2001:db8::1', end: '2001:db8::1f' })
    assertLossless(result)
    expect(result.valid).toBe(true)
    expect(result.start).toBe('2001:db8::1')
    expect(result.end).toBe('2001:db8::1f')
    expect(result.cidrs).toEqual([
      '2001:db8::1/128',
      '2001:db8::2/127',
      '2001:db8::4/126',
      '2001:db8::8/125',
      '2001:db8::10/124',
    ])
    expect(result.count).toBe(5)
    expect(result.addresses_covered).toBe('31')
    expect(result.note).toBeUndefined()
  })

  it('returns one /128 for a single address and says so (oracle V2)', async () => {
    const result = await tools.ipv6_range.execute({ start: '2001:db8::5', end: '2001:db8::5' })
    assertLossless(result)
    expect(result.cidrs).toEqual(['2001:db8::5/128'])
    expect(result.count).toBe(1)
    expect(result.addresses_covered).toBe('1')
    expect(result.note).toBe('single address (one /128)')
  })

  it('collapses a whole /64 written as a range into one block (oracle V3)', async () => {
    const result = await tools.ipv6_range.execute({
      start: '2001:db8:1::',
      end: '2001:db8:1:0:ffff:ffff:ffff:ffff',
    })
    assertLossless(result)
    expect(result.cidrs).toEqual(['2001:db8:1::/64'])
    // a /64 is 2^64 addresses — a Number could not hold this exactly
    expect(result.addresses_covered).toBe('18446744073709551616')
  })

  it('keeps adjacent-but-unaligned blocks apart: 3 blocks, not 2 (oracle V4)', async () => {
    // 2001:db8::ffff:ffff:ffff:fff0/124 and 2001:db8:0:1::/124 are adjacent and
    // equally sized, yet the span starts unaligned to /123 — so the minimal
    // cover needs three blocks. This is the case a naive "adjacent ⇒ merge" rule
    // would get wrong, and it is exactly why the oracle checks alignment too.
    const result = await tools.ipv6_range.execute({
      start: '2001:db8::ffff:ffff:ffff:fff0',
      end: '2001:db8:0:1::10',
    })
    assertLossless(result)
    expect(result.cidrs).toEqual([
      '2001:db8::ffff:ffff:ffff:fff0/124',
      '2001:db8:0:1::/124',
      '2001:db8:0:1::10/128',
    ])
    expect(result.count).toBe(3)
    expect(result.addresses_covered).toBe('33')
  })

  it('covers the whole IPv6 address space with ::/0 (oracle V5)', async () => {
    const result = await tools.ipv6_range.execute({
      start: '::',
      end: 'ffff:ffff:ffff:ffff:ffff:ffff:ffff:ffff',
    })
    assertLossless(result)
    expect(result.cidrs).toEqual(['::/0'])
    expect(result.addresses_covered).toBe('340282366920938463463374607431768211456')
  })

  it('returns one /120 for a full /120 span (oracle V8)', async () => {
    const result = await tools.ipv6_range.execute({ start: 'fd00::', end: 'fd00::ff' })
    assertLossless(result)
    expect(result.cidrs).toEqual(['fd00::/120'])
    expect(result.addresses_covered).toBe('256')
  })

  it('collapses unaligned ends into a single /47 (oracle V9)', async () => {
    const result = await tools.ipv6_range.execute({
      start: '2001:db8:aaaa::',
      end: '2001:db8:aaab:ffff:ffff:ffff:ffff:ffff',
    })
    assertLossless(result)
    expect(result.cidrs).toEqual(['2001:db8:aaaa::/47'])
    expect(result.addresses_covered).toBe('2417851639229258349412352')
  })

  it('normalizes both ends per RFC 5952 before answering (oracle V1)', async () => {
    const result = await tools.ipv6_range.execute({ start: '2001:0DB8:0000:0000:0000:0000:0000:0001', end: '2001:db8::1f' })
    assertLossless(result)
    expect(result.start).toBe('2001:db8::1')
    expect(result.end).toBe('2001:db8::1f')
    expect(result.count).toBe(5)
  })
})

describe('ipv6_range — rejected input', () => {
  it('rejects reversed bounds and names both ends', async () => {
    const result = await tools.ipv6_range.execute({ start: '2001:db8::10', end: '2001:db8::1' })
    expect(result.valid).toBe(false)
    expect(result.reason).toContain('greater than')
    expect(result.reason).toContain('2001:db8::10')
  })

  it('rejects CIDR notation on either end', async () => {
    const first = await tools.ipv6_range.execute({ start: '2001:db8::/64', end: '2001:db8::1' })
    expect(first.valid).toBe(false)
    expect(first.reason).toContain('CIDR notation is not allowed')
    const second = await tools.ipv6_range.execute({ start: '2001:db8::1', end: '2001:db8::/64' })
    expect(second.valid).toBe(false)
    expect(second.reason).toContain('CIDR notation is not allowed')
  })

  it('rejects IPv4 and garbage with the offending text', async () => {
    const v4 = await tools.ipv6_range.execute({ start: '10.0.0.1', end: '2001:db8::1' })
    expect(v4.valid).toBe(false)
    expect(v4.reason).toContain('10.0.0.1')
    const junk = await tools.ipv6_range.execute({ start: '2001:db8::1', end: 'nope' })
    expect(junk.valid).toBe(false)
    expect(junk.reason).toContain('nope')
  })
})

describe('ipv6_range — rendering', () => {
  it('renders the block list with the exact address count', async () => {
    const result = await tools.ipv6_range.execute({ start: '2001:db8::1', end: '2001:db8::1f' })
    const block = tools.ipv6_range.output.render({ start: '', end: '' }, result)
    const text = (block as Array<{ text: string }>)[0]!.text
    expect(text).toContain('2001:db8::1 – 2001:db8::1f → 5 CIDR(s) covering 31 address(es)')
    expect(text).toContain('2001:db8::10/124')
  })

  it('prints the single-address note', async () => {
    const result = await tools.ipv6_range.execute({ start: '2001:db8::5', end: '2001:db8::5' })
    const block = tools.ipv6_range.output.render({ start: '', end: '' }, result)
    const text = (block as Array<{ text: string }>)[0]!.text
    expect(text).toContain('note: single address (one /128)')
  })

  it('elides long answers at the render cap (oracle V7: 49 blocks)', async () => {
    const result = await tools.ipv6_range.execute({ start: '2001:db8::1', end: '2001:db8:0:0:1:0:0:1' })
    expect(result.count).toBe(49)
    const block = tools.ipv6_range.output.render({ start: '', end: '' }, result)
    const text = (block as Array<{ text: string }>)[0]!.text
    expect(text).toContain(`… and ${49 - PLAN_RENDER_CAP} more`)
    expect(text).not.toContain('2001:db8::1:0:0:1/128')
  })

  it('renders rejections as an invalid-input line', async () => {
    const result = await tools.ipv6_range.execute({ start: '2001:db8::10', end: '2001:db8::1' })
    const block = tools.ipv6_range.output.render({ start: '', end: '' }, result)
    const text = (block as Array<{ text: string }>)[0]!.text
    expect(text.startsWith('invalid input:')).toBe(true)
  })
})
