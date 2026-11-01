/**
 * Tests for the ipv6_summarize tool (IPv6 route aggregation, roadmap B).
 *
 * ORACLE: test/oracle/anchors.py
 *
 * Every numeric expectation below is produced by the independent Python
 * oracle (stdlib `ipaddress.collapse_addresses`, sections K1–K8) — never by
 * mental arithmetic. Reproduce with: `python3 test/oracle/anchors.py`.
 */

import { describe, expect, it } from 'vitest'
import { buildIpcalcTools, PLAN_RENDER_CAP } from '../src/tools.ts'
import { assertLossless } from './helpers/lossless-json.ts'

const tools = buildIpcalcTools()

describe('ipv6_summarize — merging adjacent blocks', () => {
  it('merges the two /33 halves of 2001:db8::/32 back into one /32 (oracle K1)', async () => {
    const result = await tools.ipv6_summarize.execute({ networks: ['2001:db8::/33', '2001:db8:8000::/33'] })
    assertLossless(result)
    expect(result.valid).toBe(true)
    expect(result.cidrs).toEqual(['2001:db8::/32'])
    expect(result.input_count).toBe(2)
    expect(result.output_count).toBe(1)
    expect(result.input_addresses).toBe('79228162514264337593543950336')
    expect(result.addresses_covered).toBe('79228162514264337593543950336')
    expect(result.overlapping_addresses).toBe('0')
    expect(result.note).toBeUndefined()
  })

  it('merges adjacent /48s into one /47 (oracle K2)', async () => {
    const result = await tools.ipv6_summarize.execute({ networks: ['2001:db8:0::/48', '2001:db8:1::/48'] })
    assertLossless(result)
    expect(result.cidrs).toEqual(['2001:db8::/47'])
    expect(result.output_count).toBe(1)
    expect(result.addresses_covered).toBe('2417851639229258349412352')
    expect(result.overlapping_addresses).toBe('0')
  })

  it('merges two adjacent bare addresses into a /127 (oracle K4)', async () => {
    const result = await tools.ipv6_summarize.execute({ networks: ['2001:db8::', '2001:db8::1'] })
    assertLossless(result)
    // a bare address is a /128, so two of them are the smallest mergeable pair
    expect(result.cidrs).toEqual(['2001:db8::/127'])
    expect(result.addresses_covered).toBe('2')
  })

  it('covers the whole IPv6 space with ::/0 (oracle K5)', async () => {
    const result = await tools.ipv6_summarize.execute({ networks: ['::/1', '8000::/1'] })
    assertLossless(result)
    expect(result.cidrs).toEqual(['::/0'])
    expect(result.addresses_covered).toBe('340282366920938463463374607431768211456')
  })
})

describe('ipv6_summarize — gaps, nesting and normalization', () => {
  it('keeps a genuine gap as two blocks (oracle K6)', async () => {
    const result = await tools.ipv6_summarize.execute({ networks: ['2001:db8:0::/48', '2001:db8:2::/48'] })
    assertLossless(result)
    expect(result.cidrs).toEqual(['2001:db8::/48', '2001:db8:2::/48'])
    expect(result.output_count).toBe(2)
    expect(result.addresses_covered).toBe('2417851639229258349412352')
  })

  it('folds a nested /48 into the covering /32 and reports the overlap (oracle K3)', async () => {
    const result = await tools.ipv6_summarize.execute({ networks: ['2001:db8::/32', '2001:db8::/48'] })
    assertLossless(result)
    expect(result.cidrs).toEqual(['2001:db8::/32'])
    expect(result.input_addresses).toBe('79229371440083952222718656512')
    expect(result.addresses_covered).toBe('79228162514264337593543950336')
    expect(result.overlapping_addresses).toBe('1208925819614629174706176')
    expect(result.note).toContain('overlap')
  })

  it('masks host bits away and says so (oracle K7)', async () => {
    const result = await tools.ipv6_summarize.execute({ networks: ['2001:db8::1/64'] })
    assertLossless(result)
    expect(result.cidrs).toEqual(['2001:db8::/64'])
    expect(result.note).toContain('host bits')
  })

  it('treats 2001:db8:0:1::/48 as 2001:db8::/48 — a /48 cannot tell the 4th hextet apart (oracle K8)', async () => {
    const result = await tools.ipv6_summarize.execute({ networks: ['2001:db8:0:1::/48'] })
    assertLossless(result)
    expect(result.cidrs).toEqual(['2001:db8::/48'])
    expect(result.addresses_covered).toBe('1208925819614629174706176')
    expect(result.note).toContain('host bits')
  })
})

describe('ipv6_summarize — exact counts and rejections', () => {
  it('reports a /64 count exactly as a decimal string (beyond Number.MAX_SAFE_INTEGER)', async () => {
    const result = await tools.ipv6_summarize.execute({ networks: ['2001:db8::/64'] })
    assertLossless(result)
    expect(result.addresses_covered).toBe('18446744073709551616')
    expect(typeof result.addresses_covered).toBe('string')
  })

  it('rejects an empty list', async () => {
    const result = await tools.ipv6_summarize.execute({ networks: [] })
    expect(result.valid).toBe(false)
    expect(result.reason).toContain('at least one')
  })

  it('rejects more than 1000 entries', async () => {
    const networks = Array.from({ length: 1001 }, (_, index) => `2001:db8::${index.toString(16)}`)
    const result = await tools.ipv6_summarize.execute({ networks })
    expect(result.valid).toBe(false)
    expect(result.reason).toContain('1000')
  })

  it('names the offending entry when it is not IPv6', async () => {
    const bad = await tools.ipv6_summarize.execute({ networks: ['2001:db8::/129'] })
    expect(bad.valid).toBe(false)
    expect(bad.reason).toContain('#1')
    const second = await tools.ipv6_summarize.execute({ networks: ['2001:db8::', '10.0.0.0/8'] })
    expect(second.valid).toBe(false)
    expect(second.reason).toContain('#2')
  })

  it('renders the CIDR list and elides long answers', async () => {
    const result = await tools.ipv6_summarize.execute({ networks: ['2001:db8:0::/48', '2001:db8:2::/48'] })
    const block = tools.ipv6_summarize.output.render({ networks: [] }, result)
    const text = (block as Array<{ text: string }>)[0]!.text
    expect(text).toContain('2 input(s) → 2 IPv6 CIDR(s)')
    expect(text).toContain('2001:db8::/48')
    expect(text).toContain('2001:db8:2::/48')

    const many = Array.from({ length: PLAN_RENDER_CAP + 4 }, (_, index) => `2001:db8:${index * 2}::/48`)
    const longResult = await tools.ipv6_summarize.execute({ networks: many })
    expect(longResult.output_count).toBe(many.length)
    const longBlock = tools.ipv6_summarize.output.render({ networks: [] }, longResult)
    const longText = (longBlock as Array<{ text: string }>)[0]!.text
    expect(longText).toContain(`… and ${many.length - PLAN_RENDER_CAP} more`)
  })
})
