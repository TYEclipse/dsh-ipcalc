/**
 * Tests for the planning tools — `ipv4_allocate` (VLSM allocation) and
 * `ipv4_exclude` (pool subtraction) — plus the placement and interval helpers
 * behind them (`prefixForHosts`, `packBlocks`, `subtractRanges`).
 *
 * ORACLE: test/oracle/anchors.py
 *
 * Every numeric anchor in this file is produced by the independent Python
 * implementation (stdlib `ipaddress` for CIDR formatting and `address_exclude`,
 * plus its own interval arithmetic) — reproduce with
 * `python3 test/oracle/anchors.py`, sections "R0"–"X". The oracle's own
 * `--check` re-derives those anchors against RFC identities, exhaustively
 * enumerates bounded placement families and compares the exclusion results with
 * both `address_exclude` and plain set arithmetic. Nothing here is guessed.
 */

import { describe, expect, it } from 'vitest'
import { MAX_REQUEST_HOSTS, packBlocks, prefixForHosts, subtractRanges } from '../src/ipv4.ts'
import { buildIpcalcTools } from '../src/tools.ts'
import { assertLossless } from './helpers/lossless-json.ts'

const tools = buildIpcalcTools()

describe('prefixForHosts', () => {
  it.each([
    [1, 30],
    [2, 30],
    [3, 29],
    [6, 29],
    [7, 28],
    [254, 24],
    [255, 23],
  ])('default: %i host(s) need a /%i', (hosts, prefix) => {
    expect(prefixForHosts(hosts, false)).toBe(prefix)
  })

  it.each([
    [1, 32],
    [2, 31],
    [3, 29],
  ])('point_to_point: %i host(s) need a /%i', (hosts, prefix) => {
    expect(prefixForHosts(hosts, true)).toBe(prefix)
  })

  it('rejects host counts outside 1..2^32-2', () => {
    expect(prefixForHosts(0, false)).toBeNull()
    expect(prefixForHosts(-1, false)).toBeNull()
    expect(prefixForHosts(1.5, false)).toBeNull()
    expect(prefixForHosts(MAX_REQUEST_HOSTS + 1, false)).toBeNull()
    expect(prefixForHosts(Number.NaN, false)).toBeNull()
  })
})

describe('packBlocks', () => {
  it('places aligned blocks in input order and reports the leftover space', () => {
    const packed = packBlocks(0, 256, [64, 128], false)
    expect(packed).not.toBeNull()
    expect(packed!.placements).toEqual([
      { index: 0, start: 0, size: 64 },
      { index: 1, start: 128, size: 128 },
    ])
    expect(packed!.free).toEqual([[64, 127]])
  })

  it('keeps request indices when the largest block goes first', () => {
    const packed = packBlocks(0, 256, [64, 128], true)
    expect(packed!.placements).toEqual([
      { index: 1, start: 0, size: 128 },
      { index: 0, start: 128, size: 64 },
    ])
    expect(packed!.free).toEqual([[192, 255]])
  })

  it('returns null when the blocks do not all fit', () => {
    expect(packBlocks(0, 256, [128, 128, 128], true)).toBeNull()
  })
})

describe('subtractRanges', () => {
  it('splits a range around two holes', () => {
    expect(subtractRanges(0, 255, [
      [64, 127],
      [192, 223],
    ])).toEqual([
      [0, 63],
      [128, 191],
      [224, 255],
    ])
  })

  it('merges overlapping cuts and ignores cuts outside the range', () => {
    expect(subtractRanges(10, 20, [
      [12, 15],
      [14, 17],
    ])).toEqual([
      [10, 11],
      [18, 20],
    ])
    expect(subtractRanges(10, 20, [[0, 5]])).toEqual([[10, 20]])
    expect(subtractRanges(10, 20, [[10, 20]])).toEqual([])
  })
})

describe('ipv4_allocate', () => {
  it('plans the roadmap case: 10.0.0.0/16 for [100, 50, 20, 20, 5]', async () => {
    const result = await tools.ipv4_allocate.execute({ cidr: '10.0.0.0/16', hosts: [100, 50, 20, 20, 5] })
    assertLossless(result)
    expect(result.valid).toBe(true)
    expect(result.cidr).toBe('10.0.0.0/16')
    expect(result.order).toBe('largest_first')
    expect(result.count).toBe(5)
    expect(result.placement).toEqual([0, 1, 2, 3, 4])
    expect(result.requested_hosts).toBe(195)
    expect(result.allocated_addresses).toBe(264)
    expect(result.allocated_usable).toBe(254)
    expect(result.parent_addresses).toBe(65536)
    expect(result.wasted_addresses).toBe(69)
    expect(result.allocations?.[0]).toEqual({
      request_index: 0,
      requested_hosts: 100,
      prefix: 25,
      cidr: '10.0.0.0/25',
      network: '10.0.0.0',
      last: '10.0.0.127',
      addresses: 128,
      usable_hosts: 126,
      wasted: 28,
    })
    expect(result.allocations?.[1]?.cidr).toBe('10.0.0.128/26')
    expect(result.allocations?.[2]?.cidr).toBe('10.0.0.192/27')
    expect(result.allocations?.[3]?.cidr).toBe('10.0.0.224/27')
    expect(result.allocations?.[4]?.cidr).toBe('10.0.1.0/29')
    expect(result.allocations?.[4]?.usable_hosts).toBe(6)
    expect(result.free_count).toBe(12)
    expect(result.free_addresses).toBe(65272)
    expect(result.free_blocks?.[0]).toBe('10.0.1.8/29')
    expect(result.free_blocks?.[11]).toBe('10.0.128.0/17')
    expect(result.note).toBeUndefined()
  })

  it('keeps results in request order while largest_first places the big block first', async () => {
    const result = await tools.ipv4_allocate.execute({ cidr: '10.0.0.0/24', hosts: [5, 100] })
    assertLossless(result)
    expect(result.placement).toEqual([1, 0])
    expect(result.allocations?.[0]?.cidr).toBe('10.0.0.128/29')
    expect(result.allocations?.[1]?.cidr).toBe('10.0.0.0/25')
    expect(result.free_blocks).toEqual(['10.0.0.136/29', '10.0.0.144/28', '10.0.0.160/27', '10.0.0.192/26'])
  })

  it('lays the same requests out in input order when order is "given"', async () => {
    const result = await tools.ipv4_allocate.execute({ cidr: '10.0.0.0/24', hosts: [5, 100], order: 'given' })
    assertLossless(result)
    expect(result.order).toBe('given')
    expect(result.placement).toEqual([0, 1])
    expect(result.allocations?.[0]?.cidr).toBe('10.0.0.0/29')
    expect(result.allocations?.[1]?.cidr).toBe('10.0.0.128/25')
    expect(result.free_blocks?.[0]).toBe('10.0.0.8/29')
  })

  it('uses a /30 as the smallest subnet by default', async () => {
    const result = await tools.ipv4_allocate.execute({ cidr: '10.0.0.0/24', hosts: [1, 2] })
    assertLossless(result)
    expect(result.allocations?.[0]).toEqual({
      request_index: 0,
      requested_hosts: 1,
      prefix: 30,
      cidr: '10.0.0.0/30',
      network: '10.0.0.0',
      last: '10.0.0.3',
      addresses: 4,
      usable_hosts: 2,
      wasted: 3,
    })
    expect(result.allocations?.[1]?.cidr).toBe('10.0.0.4/30')
    expect(result.allocations?.[1]?.wasted).toBe(2)
    expect(result.allocated_usable).toBe(4)
    expect(result.free_count).toBe(5)
    expect(result.free_addresses).toBe(248)
  })

  it('honours the RFC 3021 shortcuts when point_to_point is true', async () => {
    const result = await tools.ipv4_allocate.execute({ cidr: '10.0.0.0/24', hosts: [1, 2], point_to_point: true })
    assertLossless(result)
    expect(result.placement).toEqual([1, 0])
    expect(result.allocations?.[0]?.cidr).toBe('10.0.0.2/32')
    expect(result.allocations?.[0]?.note).toBe('single host')
    expect(result.allocations?.[0]?.wasted).toBe(0)
    expect(result.allocations?.[1]?.cidr).toBe('10.0.0.0/31')
    expect(result.allocations?.[1]?.note).toContain('RFC 3021')
    expect(result.allocated_addresses).toBe(3)
    expect(result.wasted_addresses).toBe(0)
    expect(result.free_addresses).toBe(253)
  })

  it('packs a /24 down to two free blocks for [120, 60, 30, 14, 2]', async () => {
    const result = await tools.ipv4_allocate.execute({ cidr: '192.168.1.0/24', hosts: [120, 60, 30, 14, 2] })
    assertLossless(result)
    expect(result.allocations?.[0]?.cidr).toBe('192.168.1.0/25')
    expect(result.allocations?.[1]?.cidr).toBe('192.168.1.128/26')
    expect(result.allocations?.[2]?.cidr).toBe('192.168.1.192/27')
    expect(result.allocations?.[3]?.cidr).toBe('192.168.1.224/28')
    expect(result.allocations?.[3]?.last).toBe('192.168.1.239')
    expect(result.allocations?.[4]?.cidr).toBe('192.168.1.240/30')
    expect(result.wasted_addresses).toBe(18)
    expect(result.free_count).toBe(2)
    expect(result.free_blocks).toEqual(['192.168.1.244/30', '192.168.1.248/29'])
    expect(result.free_addresses).toBe(12)
  })

  it('reports a capacity error instead of a partial layout', async () => {
    const result = await tools.ipv4_allocate.execute({ cidr: '10.0.0.0/24', hosts: [200, 100] })
    assertLossless(result)
    expect(result.valid).toBe(false)
    expect(result.cidr).toBe('10.0.0.0/24')
    expect(result.reason).toContain('need 384 addresses')
    expect(result.reason).toContain('only has 256')
    expect(result.allocations).toBeUndefined()
  })

  it('notes when the parent CIDR had host bits', async () => {
    const result = await tools.ipv4_allocate.execute({ cidr: '10.0.0.7/24', hosts: [10] })
    assertLossless(result)
    expect(result.cidr).toBe('10.0.0.0/24')
    expect(result.note).toContain('normalized')
    expect(result.allocations?.[0]?.cidr).toBe('10.0.0.0/28')
    expect(result.free_count).toBe(4)
  })

  it('rejects malformed requests with a reason', async () => {
    const bad = await tools.ipv4_allocate.execute({ cidr: 'not-a-cidr', hosts: [10] })
    expect(bad.valid).toBe(false)
    expect(bad.reason).toContain('not a valid IPv4 CIDR')

    const none = await tools.ipv4_allocate.execute({ cidr: '10.0.0.0/24', hosts: [] })
    expect(none.valid).toBe(false)
    expect(none.reason).toContain('at least one entry')

    const many = await tools.ipv4_allocate.execute({ cidr: '10.0.0.0/24', hosts: Array.from({ length: 65 }, () => 2) })
    expect(many.valid).toBe(false)
    expect(many.reason).toContain('limited to 64 entries')

    const zero = await tools.ipv4_allocate.execute({ cidr: '10.0.0.0/24', hosts: [0] })
    expect(zero.valid).toBe(false)
    expect(zero.reason).toContain('entry #1')

    const fractional = await tools.ipv4_allocate.execute({ cidr: '10.0.0.0/24', hosts: [1.5] })
    expect(fractional.valid).toBe(false)
    expect(fractional.reason).toContain('entry #1')

    const huge = await tools.ipv4_allocate.execute({ cidr: '10.0.0.0/24', hosts: [MAX_REQUEST_HOSTS + 1] })
    expect(huge.valid).toBe(false)
    expect(huge.reason).toContain('entry #1')
  })

  it('renders a plan as readable text', async () => {
    const result = await tools.ipv4_allocate.execute({ cidr: '10.0.0.0/16', hosts: [100, 50, 20, 20, 5] })
    const block = tools.ipv4_allocate.output.render({ cidr: '10.0.0.0/16', hosts: [100, 50, 20, 20, 5] }, result)
    expect(block[0]?.type).toBe('text')
    expect(block[0]?.text).toContain('10.0.0.0/16 → 5 subnet(s) placed')
    expect(block[0]?.text).toContain('#1 needs 100 → 10.0.0.0/25 (126 usable, 28 wasted)')
    expect(block[0]?.text).toContain('free: 12 block(s)')
  })

  it('elides long allocation and free lists in the renderer', async () => {
    const hosts = Array.from({ length: 18 }, () => 20)
    const result = await tools.ipv4_allocate.execute({ cidr: '10.0.0.0/16', hosts })
    expect(result.valid).toBe(true)
    expect(result.count).toBe(hosts.length)
    const block = tools.ipv4_allocate.output.render({ cidr: '10.0.0.0/16', hosts }, result)
    expect(block[0]?.text).toContain('… and 2 more')
    expect(block[0]?.text).toContain('free:')
  })

  it('renders a failure as a reason line', () => {
    const block = tools.ipv4_allocate.output.render(
      { cidr: '10.0.0.0/24', hosts: [200] },
      { valid: false, input: '10.0.0.0/24', reason: 'requests need 512 addresses' },
    )
    expect(block[0]?.text).toBe('invalid input: requests need 512 addresses')
  })
})

describe('ipv4_exclude', () => {
  it('carves two reservations out of a /16', async () => {
    const result = await tools.ipv4_exclude.execute({ cidr: '10.0.0.0/16', exclude: ['10.0.0.0/24', '10.0.8.0/22'] })
    assertLossless(result)
    expect(result.valid).toBe(true)
    expect(result.cidr).toBe('10.0.0.0/16')
    expect(result.removed_addresses).toBe(1280)
    expect(result.outside_addresses).toBe(0)
    expect(result.free_count).toBe(8)
    expect(result.free_addresses).toBe(64256)
    expect(result.free).toEqual([
      '10.0.1.0/24',
      '10.0.2.0/23',
      '10.0.4.0/22',
      '10.0.12.0/22',
      '10.0.16.0/20',
      '10.0.32.0/19',
      '10.0.64.0/18',
      '10.0.128.0/17',
    ])
    expect(result.excluded?.[1]).toEqual({
      input: '10.0.8.0/22',
      cidr: '10.0.8.0/22',
      addresses: 1024,
      removed: 1024,
      fully_inside: true,
    })
    expect(result.note).toBeUndefined()
  })

  it('removes overlapping exclusions only once', async () => {
    const result = await tools.ipv4_exclude.execute({ cidr: '10.0.0.0/16', exclude: ['10.0.0.0/23', '10.0.0.0/24'] })
    assertLossless(result)
    expect(result.removed_addresses).toBe(512)
    expect(result.free_addresses).toBe(65024)
    expect(result.free_count).toBe(7)
    expect(result.excluded?.[1]?.removed).toBe(256)
    expect(result.outside_addresses).toBe(0)
  })

  it('reports an exclusion that lies outside the pool', async () => {
    const result = await tools.ipv4_exclude.execute({ cidr: '10.0.0.0/16', exclude: ['192.168.0.0/24'] })
    assertLossless(result)
    expect(result.removed_addresses).toBe(0)
    expect(result.outside_addresses).toBe(256)
    expect(result.free_count).toBe(1)
    expect(result.free_addresses).toBe(65536)
    expect(result.free).toEqual(['10.0.0.0/16'])
    expect(result.excluded?.[0]?.fully_inside).toBe(false)
    expect(result.note).toContain('reach outside the pool')
  })

  it('says so when the pool ends up fully excluded', async () => {
    const result = await tools.ipv4_exclude.execute({ cidr: '10.0.0.0/25', exclude: ['10.0.0.0/24'] })
    assertLossless(result)
    expect(result.free).toEqual([])
    expect(result.free_count).toBe(0)
    expect(result.free_addresses).toBe(0)
    expect(result.removed_addresses).toBe(128)
    expect(result.outside_addresses).toBe(128)
    expect(result.note).toContain('nothing is left')
  })

  it('handles ragged gaps inside a /24', async () => {
    const result = await tools.ipv4_exclude.execute({ cidr: '10.0.0.0/24', exclude: ['10.0.0.64/26', '10.0.0.192/27'] })
    assertLossless(result)
    expect(result.free).toEqual(['10.0.0.0/26', '10.0.0.128/26', '10.0.0.224/27'])
    expect(result.free_count).toBe(3)
    expect(result.free_addresses).toBe(160)
    expect(result.removed_addresses).toBe(96)
  })

  it('notes a parent with host bits', async () => {
    const result = await tools.ipv4_exclude.execute({ cidr: '10.0.0.7/24', exclude: ['10.0.0.0/26'] })
    assertLossless(result)
    expect(result.cidr).toBe('10.0.0.0/24')
    expect(result.note).toContain('normalized')
    expect(result.free_count).toBe(2)
    expect(result.free_addresses).toBe(192)
    expect(result.free).toEqual(['10.0.0.64/26', '10.0.0.128/25'])
  })

  it('rejects malformed input with a reason', async () => {
    const badPool = await tools.ipv4_exclude.execute({ cidr: 'nope', exclude: ['10.0.0.0/24'] })
    expect(badPool.valid).toBe(false)
    expect(badPool.reason).toContain('not a valid IPv4 CIDR')

    const empty = await tools.ipv4_exclude.execute({ cidr: '10.0.0.0/16', exclude: [] })
    expect(empty.valid).toBe(false)
    expect(empty.reason).toContain('at least one CIDR')

    const many = await tools.ipv4_exclude.execute({
      cidr: '10.0.0.0/16',
      exclude: Array.from({ length: 65 }, (_, index) => `10.0.${index}.0/24`),
    })
    expect(many.valid).toBe(false)
    expect(many.reason).toContain('limited to 64 entries')

    const badEntry = await tools.ipv4_exclude.execute({ cidr: '10.0.0.0/16', exclude: ['10.0.0.0/24', 'oops'] })
    expect(badEntry.valid).toBe(false)
    expect(badEntry.reason).toContain('#2')
  })

  it('renders the free space as readable text', async () => {
    const args = { cidr: '10.0.0.0/16', exclude: ['10.0.0.0/24', '10.0.8.0/22'] }
    const result = await tools.ipv4_exclude.execute(args)
    const block = tools.ipv4_exclude.output.render(args, result)
    expect(block[0]?.text).toContain('10.0.0.0/16 minus 2 exclusion(s) → 8 free block(s) covering 64256 address(es)')
    expect(block[0]?.text).toContain('10.0.128.0/17')
  })

  it('elides a long free list and reports exclusions that fall outside', async () => {
    const exclude = Array.from({ length: 20 }, (_, index) => `10.0.${index * 2}.0/24`)
    const args = { cidr: '10.0.0.0/16', exclude }
    const result = await tools.ipv4_exclude.execute(args)
    expect(result.valid).toBe(true)
    expect(result.free_count).toBeGreaterThan(16)
    const block = tools.ipv4_exclude.output.render(args, result)
    expect(block[0]?.text).toContain('… and ')

    const outside = await tools.ipv4_exclude.execute({ cidr: '10.0.0.0/24', exclude: ['172.16.0.0/30'] })
    const outsideBlock = tools.ipv4_exclude.output.render(
      { cidr: '10.0.0.0/24', exclude: ['172.16.0.0/30'] },
      outside,
    )
    expect(outsideBlock[0]?.text).toContain('outside the pool: 4 address(es)')
  })

  it('renders a failure as a reason line', () => {
    const block = tools.ipv4_exclude.output.render(
      { cidr: '10.0.0.0/16', exclude: ['oops'] },
      { valid: false, input: '10.0.0.0/16', reason: 'entry #1 ("oops") is not a valid IPv4 address or CIDR' },
    )
    expect(block[0]?.text).toBe('invalid input: entry #1 ("oops") is not a valid IPv4 address or CIDR')
  })
})
