/**
 * dsh-ipcalc — pure IPv6 parsing, normalization (RFC 5952) and
 * classification. No network I/O; all logic is local string and
 * arithmetic math.
 *
 * @module dsh-ipcalc/ipv6
 */

import { parseV4 } from './ipv4.ts'

/** IPv6 address classes (subset of the IANA IPv6 special-purpose registry). */
export type V6Class =
  | 'unspecified'
  | 'loopback'
  | 'ipv4_mapped'
  | 'ipv4_compatible'
  | 'documentation'
  | 'link_local'
  | 'multicast'
  | 'unique_local'
  | 'global'

/** A parsed IPv6 address: eight 16-bit hextets plus renderings. */
export interface ParsedV6 {
  hextets: [number, number, number, number, number, number, number, number]
  normalized: string
  full: string
  hex128: string
  class: V6Class
  embeddedIpv4?: string
}

const HEXTET_RE = /^[0-9a-f]{1,4}$/

function hex2(value: number): string {
  return value.toString(16).padStart(4, '0')
}

/** Find the longest run of zero hextets; leftmost wins ties. */
function bestZeroRun(hextets: number[]): { start: number; len: number } {
  let bestStart = -1
  let bestLen = 0
  let i = 0
  while (i < 8) {
    if (hextets[i] === 0) {
      let j = i
      while (j < 8 && hextets[j] === 0) j++
      const len = j - i
      if (len > bestLen) {
        bestLen = len
        bestStart = i
      }
      i = j
    } else {
      i++
    }
  }
  return { start: bestStart, len: bestLen }
}

/** Render eight hextets in RFC 5952 canonical form. */
export function normalizeV6(hextets: number[]): string {
  const pieces = hextets.map((h) => h.toString(16))
  const run = bestZeroRun(hextets)
  if (run.len < 2) return pieces.join(':')
  const left = pieces.slice(0, run.start).join(':')
  const right = pieces.slice(run.start + run.len).join(':')
  if (left === '') return `::${right}`
  if (right === '') return `${left}::`
  return `${left}::${right}`
}

/**
 * Parse an IPv6 address text form: hex hextets with optional "::"
 * compression and an optional embedded dotted-quad IPv4 tail
 * (::ffff:a.b.c.d and ::a.b.c.d forms). Zone ids ("%eth0") are rejected.
 * Returns null when invalid.
 */
export function parseV6(text: string): ParsedV6 | null {
  let body = text.trim().toLowerCase()
  if (body === '' || body.includes('%')) return null

  let embedded: string | undefined
  if (body.includes('.')) {
    const idx = body.lastIndexOf(':')
    if (idx === -1) return null
    const v4 = parseV4(body.slice(idx + 1))
    if (v4 === null) return null
    embedded = v4.text
    const high = v4.octets[0] * 256 + v4.octets[1]
    const low = v4.octets[2] * 256 + v4.octets[3]
    body = `${body.slice(0, idx)}:${hex2(high)}:${hex2(low)}`
  }

  const doubleColonCount = (body.match(/::/g) ?? []).length
  if (doubleColonCount > 1 || body.includes(':::')) return null
  const parts = body.split(':')
  const emptyCount = parts.filter((part) => part === '').length
  const groups: number[] = []
  for (const part of parts) {
    if (part === '') continue
    if (!HEXTET_RE.test(part)) return null
    groups.push(parseInt(part, 16))
  }

  let hextets: number[]
  if (emptyCount === 0) {
    if (groups.length !== 8) return null
    hextets = groups
  } else {
    if (!body.includes('::') || groups.length >= 8) return null
    const fill = 8 - groups.length
    if (fill <= 0) return null
    if (emptyCount === 1) {
      const splitIndex = parts.indexOf('')
      const leftCount = parts.slice(0, splitIndex).filter((part) => part !== '').length
      hextets = [
        ...groups.slice(0, leftCount),
        ...Array.from({ length: fill }, () => 0),
        ...groups.slice(leftCount),
      ]
    } else if (parts[0] === '' && parts[1] === '') {
      hextets = [...Array.from({ length: fill }, () => 0), ...groups]
    } else {
      hextets = [...groups, ...Array.from({ length: fill }, () => 0)]
    }
  }

  const tuple = hextets as ParsedV6['hextets']
  const parsed: ParsedV6 = {
    hextets: tuple,
    normalized: normalizeV6(hextets),
    full: hextets.map(hex2).join(':'),
    hex128: hextets.map(hex2).join(''),
    class: classifyV6(hextets),
  }
  if (embedded !== undefined && (parsed.class === 'ipv4_mapped' || parsed.class === 'ipv4_compatible')) {
    parsed.embeddedIpv4 = embedded
  }
  return parsed
}

/** Classify eight hextets per the IANA IPv6 special-purpose registry. */
export function classifyV6(hextets: number[]): V6Class {
  const a = hextets[0]!
  const b = hextets[1]!
  if (hextets.every((hextet) => hextet === 0)) return 'unspecified'
  const c = hextets[2]!
  const d = hextets[3]!
  const e = hextets[4]!
  const f = hextets[5]!
  const g = hextets[6]!
  const h = hextets[7]!
  if (a === 0 && b === 0 && c === 0 && d === 0 && e === 0 && f === 0 && g === 0 && h === 1) return 'loopback'
  if (a === 0 && b === 0 && c === 0 && d === 0 && e === 0 && f === 0xffff) return 'ipv4_mapped'
  if (a === 0 && b === 0 && c === 0 && d === 0 && e === 0 && f === 0) return 'ipv4_compatible'
  if (a === 0x2001 && b === 0x0db8) return 'documentation'
  if ((a & 0xffc0) === 0xfe80) return 'link_local'
  if ((a & 0xff00) === 0xff00) return 'multicast'
  if ((a & 0xfe00) === 0xfc00) return 'unique_local'
  return 'global'
}
