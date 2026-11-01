/**
 * Tests for the ip_overlaps tool (conflicting CIDR pairs, roadmap D).
 *
 * ORACLE: test/oracle/anchors.py
 *
 * Every numeric expectation below is produced by the independent Python
 * oracle (stdlib `ipaddress` `.overlaps()` / `.subnet_of()`, sections L1–L7) —
 * never by mental arithmetic. Reproduce with: `python3 test/oracle/anchors.py`.
 */

import { describe, expect, it } from 'vitest'
import { buildIpcalcTools, OVERLAP_LIMIT } from '../src/tools.ts'
import { assertLossless } from './helpers/lossless-json.ts'

const tools = buildIpcalcTools()

describe('ip_overlaps — IPv4 conflicts', () => {
  it('reports a /24 containing a /25 as one conflict (oracle L1)', async () => {
    const result = await tools.ip_overlaps.execute({ networks: ['10.0.0.0/24', '10.0.0.128/25'] })
    assertLossless(result)
    expect(result.valid).toBe(true)
    expect(result.clean).toBe(false)
    expect(result.conflict_count).toBe(1)
    expect(result.pair_count).toBe(1)
    expect(result.ipv4_count).toBe(2)
    expect(result.ipv6_count).toBe(0)
    expect(result.conflicts).toHaveLength(1)
    const conflict = result.conflicts![0]!
    expect(conflict.relation).toBe('a_contains_b')
    expect(conflict.intersection).toBe('10.0.0.128/25')
    expect(conflict.addresses).toBe('128')
    expect(conflict.a_index).toBe(0)
    expect(conflict.b_index).toBe(1)
  })

  it('accepts two sibling /25s as disjoint (oracle L2)', async () => {
    const result = await tools.ip_overlaps.execute({ networks: ['10.0.0.0/25', '10.0.0.128/25'] })
    assertLossless(result)
    expect(result.clean).toBe(true)
    expect(result.conflict_count).toBe(0)
    expect(result.conflicts).toEqual([])
    expect(result.pair_count).toBe(1)
  })

  it('treats 10.0.0.5/24 as a duplicate of 10.0.0.0/24 and says why (oracle L3)', async () => {
    const result = await tools.ip_overlaps.execute({ networks: ['10.0.0.0/24', '10.0.0.5/24'] })
    assertLossless(result)
    expect(result.conflict_count).toBe(1)
    expect(result.conflicts![0]!.relation).toBe('duplicate')
    expect(result.conflicts![0]!.intersection).toBe('10.0.0.0/24')
    expect(result.conflicts![0]!.addresses).toBe('256')
    expect(result.note).toContain('host bits')
  })

  it('finds one conflict per pair when a parent and two children are listed (oracle L6)', async () => {
    const result = await tools.ip_overlaps.execute({ networks: ['10.0.0.0/8', '10.0.0.0/16', '10.1.0.0/16'] })
    assertLossless(result)
    expect(result.pair_count).toBe(3)
    expect(result.conflict_count).toBe(2)
    expect(result.conflicts!.map((conflict) => conflict.relation)).toEqual(['a_contains_b', 'a_contains_b'])
    expect(result.conflicts!.map((conflict) => conflict.intersection)).toEqual(['10.0.0.0/16', '10.1.0.0/16'])
    expect(result.conflicts!.map((conflict) => conflict.addresses)).toEqual(['65536', '65536'])
  })

  it('reports clean for two private blocks that do not touch (oracle L7)', async () => {
    const result = await tools.ip_overlaps.execute({ networks: ['192.168.0.0/16', '172.16.0.0/12'] })
    assertLossless(result)
    expect(result.clean).toBe(true)
    expect(result.pair_count).toBe(1)
  })
})

describe('ip_overlaps — IPv6 and mixed families', () => {
  it('counts 2^80 overlapping addresses inside a /32 (oracle L5)', async () => {
    const result = await tools.ip_overlaps.execute({ networks: ['2001:db8::/32', '2001:db8:1::/48'] })
    assertLossless(result)
    expect(result.ipv6_count).toBe(2)
    expect(result.ipv4_count).toBe(0)
    expect(result.conflict_count).toBe(1)
    expect(result.conflicts![0]!.relation).toBe('a_contains_b')
    expect(result.conflicts![0]!.intersection).toBe('2001:db8:1::/48')
    expect(result.conflicts![0]!.addresses).toBe('1208925819614629174706176')
  })

  it('never compares an IPv4 block against an IPv6 block, but counts the pair (oracle L4)', async () => {
    const result = await tools.ip_overlaps.execute({ networks: ['10.0.0.0/24', '2001:db8::/32'] })
    assertLossless(result)
    expect(result.valid).toBe(true)
    expect(result.clean).toBe(true)
    expect(result.pair_count).toBe(0)
    expect(result.mixed_family_pairs).toBe(1)
    expect(result.ipv4_count).toBe(1)
    expect(result.ipv6_count).toBe(1)
    expect(result.note).toContain('cross-family')
  })
})

describe('ip_overlaps — limits, rejections and rendering', () => {
  it('rejects an empty list', async () => {
    const result = await tools.ip_overlaps.execute({ networks: [] })
    expect(result.valid).toBe(false)
    expect(result.reason).toContain('at least one')
  })

  it(`rejects more than ${OVERLAP_LIMIT} entries`, async () => {
    const networks = Array.from({ length: OVERLAP_LIMIT + 1 }, (_, index) => `10.${index}.0.0/24`)
    const result = await tools.ip_overlaps.execute({ networks })
    expect(result.valid).toBe(false)
    expect(result.reason).toContain(String(OVERLAP_LIMIT))
  })

  it('names the offending entry when it is not an address', async () => {
    const bad = await tools.ip_overlaps.execute({ networks: ['10.0.0.0/24', '10.0.0.256'] })
    expect(bad.valid).toBe(false)
    expect(bad.reason).toContain('#2')
  })

  it('renders the clean case without a conflict list', async () => {
    const result = await tools.ip_overlaps.execute({ networks: ['10.0.0.0/25', '10.0.0.128/25'] })
    const block = tools.ip_overlaps.output.render({ networks: [] }, result)
    const text = (block as Array<{ text: string }>)[0]!.text
    expect(text).toContain('no overlaps')
    expect(text).toContain('1 same-family pair(s) checked')
  })

  it('renders each conflict with its indices and address count', async () => {
    const result = await tools.ip_overlaps.execute({ networks: ['10.0.0.0/24', '10.0.0.128/25'] })
    const block = tools.ip_overlaps.output.render({ networks: [] }, result)
    const text = (block as Array<{ text: string }>)[0]!.text
    expect(text).toContain('1 conflicting pair(s) of 1 same-family pair(s)')
    expect(text).toContain('10.0.0.128/25')
    expect(text).toContain('128 address(es) overlapping')
  })
})
