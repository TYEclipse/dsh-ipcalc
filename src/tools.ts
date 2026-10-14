/**
 * Tool definitions for dsh-ipcalc: nine pure-math tools exposed to every
 * agent via defineTool. Each tool has a strict JSON-schema parameter
 * surface and a compact text renderer. No network I/O happens anywhere.
 *
 * @module dsh-ipcalc/tools
 */

import { defineTool, type ToolDefinition } from '@deepseek-ai/dsh-tools'
import {
  classifyV4,
  formatV4,
  MAX_REQUEST_HOSTS,
  PLAN_LIMIT,
  packBlocks,
  parseCidr,
  parseV4,
  prefixForHosts,
  rangeToCidrs,
  splitSpec,
  subnetOf,
  subtractRanges,
  summarizeSpecs,
  usableHostsForPrefix,
  type CidrSpec,
  type SubnetInfo,
  type V4Class,
} from './ipv4.ts'
import {
  bigIntToHextets,
  normalizeV6,
  parseV6,
  parseV6Cidr,
  v6RangeOf,
  v6SubnetOf,
  v6ToBigInt,
  type V6CidrSpec,
  type V6Class,
} from './ipv6.ts'

export interface ToolSet {
  ipv4_subnet: ToolDefinition
  ipv4_summarize: ToolDefinition
  ipv4_split: ToolDefinition
  ipv4_allocate: ToolDefinition
  ipv4_exclude: ToolDefinition
  ipv4_range: ToolDefinition
  ip_parse: ToolDefinition
  ipv6_subnet: ToolDefinition
  ip_match: ToolDefinition
}

/** Maximum number of subnets ipv4_split returns in one call. */
export const SPLIT_LIMIT = 256

/** Number of subnet lines the ipv4_split renderer prints before eliding. */
export const SPLIT_RENDER_CAP = 12

/** Number of allocation / exclusion lines the planning renderers print before eliding. */
export const PLAN_RENDER_CAP = 16

/** The full output of ipv4_subnet on success (every key always present). */
export interface SubnetResult {
  valid: boolean
  input: string
  cidr?: string
  network?: string
  broadcast?: string
  netmask?: string
  wildcard?: string
  prefix?: number
  first_host?: string
  last_host?: string
  addresses?: number
  usable_hosts?: number
  network_integer?: number
  broadcast_integer?: number
  network_class?: V4Class
  host_class?: V4Class
  note?: string
  reason?: string
}

/** The full output of ipv4_summarize (every key always present). */
export interface SummarizeResult {
  valid: boolean
  cidrs?: string[]
  input_count?: number
  output_count?: number
  addresses_covered?: number
  reason?: string
}

/** The full output of ipv4_split (every key always present on success). */
export interface SplitResult {
  valid: boolean
  input: string
  cidr?: string
  source_prefix?: number
  new_prefix?: number
  count?: number
  addresses_each?: number
  usable_each?: number
  cidrs?: string[]
  first?: string
  last?: string
  note?: string
  reason?: string
}

/** The full output of ipv4_range (every key always present on success). */
export interface RangeResult {
  valid: boolean
  start?: string
  end?: string
  cidrs?: string[]
  count?: number
  addresses_covered?: number
  note?: string
  reason?: string
}

/** One placed subnet of an ipv4_allocate plan. */
export interface AllocationEntry {
  request_index: number
  requested_hosts: number
  prefix: number
  cidr: string
  network: string
  last: string
  addresses: number
  usable_hosts: number
  wasted: number
  note?: string
}

/** The full output of ipv4_allocate (every key always present on success). */
export interface AllocateResult {
  valid: boolean
  input: string
  cidr?: string
  order?: string
  allocations?: AllocationEntry[]
  count?: number
  placement?: number[]
  requested_hosts?: number
  allocated_addresses?: number
  allocated_usable?: number
  parent_addresses?: number
  wasted_addresses?: number
  free_blocks?: string[]
  free_count?: number
  free_addresses?: number
  note?: string
  reason?: string
}

/** One exclusion entry of an ipv4_exclude run. */
export interface ExclusionEntry {
  input: string
  cidr: string
  addresses: number
  removed: number
  fully_inside: boolean
}

/** The full output of ipv4_exclude (every key always present on success). */
export interface ExcludeResult {
  valid: boolean
  input?: string
  cidr?: string
  excluded?: ExclusionEntry[]
  removed_addresses?: number
  outside_addresses?: number
  free?: string[]
  free_count?: number
  free_addresses?: number
  note?: string
  reason?: string
}

/** The full output of ip_parse (only relevant keys are set per branch). */
export interface IpParseResult {
  valid: boolean
  input: string
  version?: 4 | 6
  normalized?: string
  full?: string
  class?: V4Class | V6Class
  octets?: number[]
  integer?: number
  hextets?: number[]
  hex128?: string
  embedded_ipv4?: string
  reason?: string
}

/** The full output of ipv6_subnet on success. */
export interface V6SubnetResult {
  valid: boolean
  input: string
  cidr?: string
  network?: string
  network_full?: string
  last?: string
  prefix?: number
  first_host?: string
  last_host?: string
  addresses?: string
  usable_hosts?: string
  network_class?: V6Class
  note?: string
  reason?: string
}

/** The full output of ip_match (only relevant keys are set per branch). */
export interface IpMatchResult {
  valid: boolean
  in_subnet?: boolean
  ip?: string
  ip_version?: 4 | 6
  cidr?: string
  cidr_version?: 4 | 6
  network?: string
  last?: string
  reason?: string
}

const V4_CLASSES: readonly V4Class[] = [
  'unspecified', 'broadcast', 'loopback', 'private', 'cgnat', 'link_local',
  'documentation', 'multicast', 'reserved', 'global',
]

const V6_CLASSES: readonly V6Class[] = [
  'unspecified', 'loopback', 'ipv4_mapped', 'ipv4_compatible', 'documentation',
  'link_local', 'multicast', 'unique_local', 'global',
]

function okSubnet(input: string, spec: CidrSpec): SubnetResult {
  const info: SubnetInfo = subnetOf(spec)
  const result: SubnetResult = {
    valid: true,
    input,
    cidr: info.cidr,
    network: info.network,
    broadcast: info.broadcast,
    netmask: info.netmask,
    wildcard: info.wildcard,
    prefix: info.prefix,
    first_host: info.first_host,
    last_host: info.last_host,
    addresses: info.addresses,
    usable_hosts: info.usable_hosts,
    network_integer: info.network_integer,
    broadcast_integer: info.broadcast_integer,
    network_class: info.network_class,
    host_class: info.host_class,
  }
  if (info.note !== undefined) result.note = info.note
  return result
}

function okV6Subnet(input: string, spec: V6CidrSpec): V6SubnetResult {
  const info = v6SubnetOf(spec)
  const result: V6SubnetResult = {
    valid: true,
    input,
    cidr: info.cidr,
    network: info.network,
    network_full: info.network_full,
    last: info.last,
    prefix: info.prefix,
    first_host: info.first_host,
    last_host: info.last_host,
    addresses: info.addresses,
    usable_hosts: info.usable_hosts,
    network_class: info.network_class,
  }
  if (info.note !== undefined) result.note = info.note
  return result
}

function renderSubnet(value: unknown): string {
  const result = value as SubnetResult
  if (!result.valid || result.cidr === undefined) {
    return `invalid input: ${result.reason ?? 'unknown error'}`
  }
  const lines = [
    `${result.input} → network ${result.cidr}`,
    `  netmask ${result.netmask}  wildcard ${result.wildcard}  broadcast ${result.broadcast}`,
    `  host range ${result.first_host} – ${result.last_host}  (${result.usable_hosts} usable of ${result.addresses})`,
    `  classes: network=${result.network_class}  host=${result.host_class}`,
  ]
  if (result.note !== undefined) lines.push(`  note: ${result.note}`)
  return lines.join('\n')
}

function renderSummarize(value: unknown): string {
  const result = value as SummarizeResult
  if (!result.valid) return `invalid input: ${result.reason ?? 'unknown error'}`
  return `${result.input_count} input(s) → ${result.output_count} CIDR(s) covering ${result.addresses_covered} address(es):\n  ${(result.cidrs ?? []).join('\n  ')}`
}

function renderSplit(value: unknown): string {
  const result = value as SplitResult
  if (!result.valid || result.cidrs === undefined) {
    return `invalid input: ${result.reason ?? 'unknown error'}`
  }
  const shown = result.cidrs.slice(0, SPLIT_RENDER_CAP)
  const lines = [
    `${result.input} → ${result.count} × /${result.new_prefix} subnet(s), ${result.usable_each} usable host(s) each`,
    ...shown.map((cidr) => `  ${cidr}`),
  ]
  if (result.cidrs.length > shown.length) {
    lines.push(`  … and ${result.cidrs.length - shown.length} more`)
  }
  if (result.note !== undefined) lines.push(`  note: ${result.note}`)
  return lines.join('\n')
}

function renderRange(value: unknown): string {
  const result = value as RangeResult
  if (!result.valid || result.cidrs === undefined) {
    return `invalid input: ${result.reason ?? 'unknown error'}`
  }
  const lines = [
    `${result.start} – ${result.end} → ${result.count} CIDR(s) covering ${result.addresses_covered} address(es)`,
    ...result.cidrs.map((cidr) => `  ${cidr}`),
  ]
  if (result.note !== undefined) lines.push(`  note: ${result.note}`)
  return lines.join('\n')
}

function renderAllocate(value: unknown): string {
  const result = value as AllocateResult
  if (!result.valid || result.allocations === undefined) {
    return `invalid input: ${result.reason ?? 'unknown error'}`
  }
  const shown = result.allocations.slice(0, PLAN_RENDER_CAP)
  const lines = [
    `${result.input} → ${result.count} subnet(s) placed, ${result.allocated_addresses} of ${result.parent_addresses} address(es) used`
      + `, ${result.wasted_addresses} beyond the requests`,
    ...shown.map((entry) => `  #${entry.request_index + 1} needs ${entry.requested_hosts} → ${entry.cidr}`
      + ` (${entry.usable_hosts} usable, ${entry.wasted} wasted)${entry.note !== undefined ? ` — ${entry.note}` : ''}`),
  ]
  if (result.allocations.length > shown.length) {
    lines.push(`  … and ${result.allocations.length - shown.length} more`)
  }
  const free = result.free_blocks ?? []
  lines.push(`  free: ${free.length} block(s), ${result.free_addresses} address(es)`)
  for (const cidr of free.slice(0, PLAN_RENDER_CAP)) lines.push(`  ${cidr}`)
  if (free.length > PLAN_RENDER_CAP) lines.push(`  … and ${free.length - PLAN_RENDER_CAP} more`)
  if (result.note !== undefined) lines.push(`  note: ${result.note}`)
  return lines.join('\n')
}

function renderExclude(value: unknown): string {
  const result = value as ExcludeResult
  if (!result.valid || result.free === undefined) {
    return `invalid input: ${result.reason ?? 'unknown error'}`
  }
  const lines = [
    `${result.input} minus ${result.excluded?.length ?? 0} exclusion(s) → ${result.free_count} free block(s)`
      + ` covering ${result.free_addresses} address(es)`,
    ...result.free.slice(0, PLAN_RENDER_CAP).map((cidr) => `  ${cidr}`),
  ]
  if (result.free.length > PLAN_RENDER_CAP) {
    lines.push(`  … and ${result.free.length - PLAN_RENDER_CAP} more`)
  }
  if (result.outside_addresses !== undefined && result.outside_addresses > 0) {
    lines.push(`  outside the pool: ${result.outside_addresses} address(es) of the exclusions were never in it`)
  }
  if (result.note !== undefined) lines.push(`  note: ${result.note}`)
  return lines.join('\n')
}

function renderIpParse(value: unknown): string {
  const result = value as IpParseResult
  if (!result.valid) return `invalid IP: ${result.reason ?? 'unknown error'}`
  const detail = result.version === 4
    ? `octets [${(result.octets ?? []).join('.')}] = ${result.integer}`
    : `${result.full}${result.embedded_ipv4 !== undefined ? ` (embeds ${result.embedded_ipv4})` : ''}`
  return `${result.input} → IPv${result.version}, class ${result.class}, normalized ${result.normalized}\n  ${detail}`
}

function renderV6Subnet(value: unknown): string {
  const result = value as V6SubnetResult
  if (!result.valid || result.cidr === undefined) {
    return `invalid input: ${result.reason ?? 'unknown error'}`
  }
  const lines = [
    `${result.input} → network ${result.cidr}`,
    `  range ${result.first_host} – ${result.last_host}  (${result.usable_hosts} usable of ${result.addresses})`,
    `  class ${result.network_class}  full ${result.network_full}`,
  ]
  if (result.note !== undefined) lines.push(`  note: ${result.note}`)
  return lines.join('\n')
}

function renderIpMatch(value: unknown): string {
  const result = value as IpMatchResult
  if (!result.valid) return `invalid input: ${result.reason ?? 'unknown error'}`
  const verdict = result.in_subnet === true ? 'INSIDE' : 'OUTSIDE'
  return `${result.ip} is ${verdict} ${result.cidr} (IPv${result.cidr_version})\n  network ${result.network} – ${result.last}`
}

/** Build the three ipcalc tool definitions. */
export function buildIpcalcTools(): ToolSet {
  const ipv4_subnet = defineTool({
    name: 'ipv4_subnet',
    description: 'Compute the complete subnet layout for an IPv4 address in CIDR notation '
      + '(e.g. "192.168.1.25/24" or "10.0.0.1/255.255.255.248"; a bare address is treated as /32): '
      + 'network address, broadcast, netmask, wildcard, first/last usable host, address counts, '
      + 'integer forms and IANA address classes. Pure local math, no network access. '
      + 'Use this instead of doing subnet arithmetic in your head.',
    parameters: {
      cidr: { type: 'string', required: true, description: 'IPv4 CIDR to analyze: "a.b.c.d/prefix", "a.b.c.d/dotted-mask" or a bare "a.b.c.d" address.' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          valid: { type: 'boolean', required: true },
          input: { type: 'string', required: true },
          cidr: { type: 'string' },
          network: { type: 'string' },
          broadcast: { type: 'string' },
          netmask: { type: 'string' },
          wildcard: { type: 'string' },
          prefix: { type: 'number' },
          first_host: { type: 'string' },
          last_host: { type: 'string' },
          addresses: { type: 'number' },
          usable_hosts: { type: 'number' },
          network_integer: { type: 'number' },
          broadcast_integer: { type: 'number' },
          network_class: { type: 'string', enum: [...V4_CLASSES] },
          host_class: { type: 'string', enum: [...V4_CLASSES] },
          note: { type: 'string' },
          reason: { type: 'string' },
        },
      },
      render: (_args: { cidr: string }, value: unknown) => [{ type: 'text', text: renderSubnet(value) }],
    },
    async execute(args: { cidr: string }): Promise<SubnetResult> {
      const spec = parseCidr(args.cidr)
      if (spec === null) {
        return { valid: false, input: args.cidr, reason: 'not a valid IPv4 CIDR (expected a.b.c.d/p, a.b.c.d/mask or a.b.c.d)' }
      }
      return okSubnet(args.cidr, spec)
    },
  })

  const ipv4_summarize = defineTool({
    name: 'ipv4_summarize',
    description: 'Reduce a list of IPv4 addresses and CIDR ranges (e.g. ["10.0.0.0/24", "10.0.1.0/24", "10.0.3.7"]) '
      + 'to the minimal covering CIDR list by merging adjacent ranges and supernetting aligned blocks. '
      + 'Pure local math, no network access. Use this to aggregate firewall rules or route tables.',
    parameters: {
      networks: {
        type: 'array',
        required: true,
        items: { type: 'string' },
        description: 'List of IPv4 CIDRs and/or bare addresses to summarize (1–1000 entries).',
      },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          valid: { type: 'boolean', required: true },
          cidrs: { type: 'array', items: { type: 'string' } },
          input_count: { type: 'number' },
          output_count: { type: 'number' },
          addresses_covered: { type: 'number' },
          reason: { type: 'string' },
        },
      },
      render: (_args: { networks: string[] }, value: unknown) => [{ type: 'text', text: renderSummarize(value) }],
    },
    async execute(args: { networks: string[] }): Promise<SummarizeResult> {
      if (args.networks.length < 1) {
        return { valid: false, reason: 'networks must contain at least one entry' }
      }
      if (args.networks.length > 1000) {
        return { valid: false, reason: 'networks is limited to 1000 entries' }
      }
      const specs: CidrSpec[] = []
      for (let i = 0; i < args.networks.length; i++) {
        const spec = parseCidr(args.networks[i]!)
        if (spec === null) {
          return { valid: false, reason: `entry #${i + 1} ("${args.networks[i]}") is not a valid IPv4 address or CIDR` }
        }
        specs.push(spec)
      }
      const cidrs = summarizeSpecs(specs)
      let covered = 0
      for (const cidr of cidrs) {
        const parts = cidr.split('/')
        covered += 2 ** (32 - Number(parts[1]))
      }
      return {
        valid: true,
        cidrs,
        input_count: args.networks.length,
        output_count: cidrs.length,
        addresses_covered: covered,
      }
    },
  })

  const ipv4_split = defineTool({
    name: 'ipv4_split',
    description: 'Split an IPv4 CIDR into equal, network-aligned subnets — either a number of parts '
      + '(power of two) or a target prefix length. Returns each subnet as CIDR plus the per-subnet '
      + 'address and usable-host counts and the RFC 3021 /31 and single-host /32 conventions. '
      + 'Pure local math, no network access. Use this to cut a /24 into /26s; when the subnets must be '
      + 'different sizes use ipv4_allocate instead.',
    parameters: {
      cidr: { type: 'string', required: true, description: 'IPv4 CIDR to split: "a.b.c.d/prefix", "a.b.c.d/dotted-mask" or a bare "a.b.c.d" address.' },
      parts: { type: 'number', description: 'Number of equal subnets to produce: a power of two >= 2 (2, 4, 8, 16, ... up to 256). Give this or prefix, not both.' },
      prefix: { type: 'number', description: 'Target prefix length for each subnet (must be greater than the source prefix, at most 32). Give this or parts, not both.' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          valid: { type: 'boolean', required: true },
          input: { type: 'string', required: true },
          cidr: { type: 'string' },
          source_prefix: { type: 'number' },
          new_prefix: { type: 'number' },
          count: { type: 'number' },
          addresses_each: { type: 'number' },
          usable_each: { type: 'number' },
          cidrs: { type: 'array', items: { type: 'string' } },
          first: { type: 'string' },
          last: { type: 'string' },
          note: { type: 'string' },
          reason: { type: 'string' },
        },
      },
      render: (_args: { cidr: string }, value: unknown) => [{ type: 'text', text: renderSplit(value) }],
    },
    async execute(args: { cidr: string; parts?: number; prefix?: number }): Promise<SplitResult> {
      const spec = parseCidr(args.cidr)
      if (spec === null) {
        return { valid: false, input: args.cidr, reason: 'not a valid IPv4 CIDR (expected a.b.c.d/p, a.b.c.d/mask or a.b.c.d)' }
      }
      const hasParts = args.parts !== undefined
      const hasPrefix = args.prefix !== undefined
      if (hasParts === hasPrefix) {
        return { valid: false, input: args.cidr, reason: 'provide exactly one of parts (power-of-two subnet count) or prefix (target prefix length)' }
      }

      let newPrefix: number
      if (hasPrefix) {
        const target = args.prefix!
        if (!Number.isInteger(target) || target < 0 || target > 32) {
          return { valid: false, input: args.cidr, reason: `prefix must be an integer between 0 and 32 (got ${target})` }
        }
        if (target <= spec.prefix) {
          return { valid: false, input: args.cidr, reason: `prefix ${target} must be greater than the source prefix ${spec.prefix} — splitting cannot widen a subnet` }
        }
        newPrefix = target
      } else {
        const parts = args.parts!
        if (!Number.isInteger(parts) || parts < 2) {
          return { valid: false, input: args.cidr, reason: `parts must be an integer >= 2 (got ${parts})` }
        }
        if (parts > SPLIT_LIMIT) {
          return { valid: false, input: args.cidr, reason: `parts is limited to ${SPLIT_LIMIT} subnets per call (got ${parts})` }
        }
        const exponent = Math.log2(parts)
        if (!Number.isInteger(exponent)) {
          return { valid: false, input: args.cidr, reason: `parts must be a power of two — 2, 4, 8, 16, ... (got ${parts})` }
        }
        newPrefix = spec.prefix + exponent
        if (newPrefix > 32) {
          return { valid: false, input: args.cidr, reason: `splitting /${spec.prefix} into ${parts} parts needs /${newPrefix}, which exceeds /32` }
        }
      }

      const count = 2 ** (newPrefix - spec.prefix)
      if (count > SPLIT_LIMIT) {
        return {
          valid: false,
          input: args.cidr,
          reason: `splitting /${spec.prefix} into /${newPrefix} would produce ${count} subnets — the limit is ${SPLIT_LIMIT} per call; pick a shorter prefix or split the sub-ranges in turn`,
        }
      }

      const source = subnetOf(spec)
      const cidrs = splitSpec(spec, newPrefix)
      const result: SplitResult = {
        valid: true,
        input: args.cidr,
        cidr: source.cidr,
        source_prefix: spec.prefix,
        new_prefix: newPrefix,
        count,
        addresses_each: 2 ** (32 - newPrefix),
        usable_each: usableHostsForPrefix(newPrefix),
        cidrs,
        first: cidrs[0]!,
        last: cidrs[cidrs.length - 1]!,
      }
      if (newPrefix === 31) {
        result.note = 'RFC 3021: both addresses of each /31 are usable on point-to-point links'
      } else if (newPrefix === 32) {
        result.note = 'each /32 is a single host'
      }
      return result
    },
  })

  const ipv4_allocate = defineTool({
    name: 'ipv4_allocate',
    description: 'Plan a VLSM layout instead of doing the arithmetic yourself: give a parent IPv4 CIDR '
      + 'plus the host count each subnet must hold (e.g. cidr "10.0.0.0/16", hosts [100, 50, 20, 20, 5]) '
      + 'and get back one non-overlapping, network-aligned subnet per request, each at the smallest '
      + 'prefix that fits it — plus the placement order, the free blocks left over and how many '
      + 'addresses were allocated beyond the requests. order "largest_first" (default) puts the biggest '
      + 'subnets lowest in the block, which keeps room to grow later; order "given" keeps the input '
      + 'sequence. Either way every request is placed as long as the requests fit — a failure is a plain '
      + 'capacity error, not fragmentation. '
      + 'point_to_point true allows the RFC 3021 shortcuts (1 host → /32, 2 hosts → /31); by default the '
      + 'smallest subnet is a /30. Results stay in request order with a placement list. Pure local math, '
      + 'no network access.',
    parameters: {
      cidr: { type: 'string', required: true, description: 'Parent IPv4 block to allocate from: "a.b.c.d/prefix", "a.b.c.d/dotted-mask" or a bare "a.b.c.d" address.' },
      hosts: {
        type: 'array',
        required: true,
        items: { type: 'number' },
        description: 'Host count for each subnet to place, e.g. [100, 50, 20] (1–64 entries; each 1–4294967294).',
      },
      order: { type: 'string', enum: ['largest_first', 'given'], description: 'Placement order: "largest_first" (default) or "given" (input sequence).' },
      point_to_point: { type: 'boolean', description: 'Allow the RFC 3021 //31 and /32 shortcuts: 1 host → /32, 2 hosts → /31. Default false, so the smallest subnet is a /30.' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          valid: { type: 'boolean', required: true },
          input: { type: 'string', required: true },
          cidr: { type: 'string' },
          order: { type: 'string' },
          allocations: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                request_index: { type: 'number', required: true },
                requested_hosts: { type: 'number', required: true },
                prefix: { type: 'number', required: true },
                cidr: { type: 'string', required: true },
                network: { type: 'string', required: true },
                last: { type: 'string', required: true },
                addresses: { type: 'number', required: true },
                usable_hosts: { type: 'number', required: true },
                wasted: { type: 'number', required: true },
                note: { type: 'string' },
              },
            },
          },
          count: { type: 'number' },
          placement: { type: 'array', items: { type: 'number' } },
          requested_hosts: { type: 'number' },
          allocated_addresses: { type: 'number' },
          allocated_usable: { type: 'number' },
          parent_addresses: { type: 'number' },
          wasted_addresses: { type: 'number' },
          free_blocks: { type: 'array', items: { type: 'string' } },
          free_count: { type: 'number' },
          free_addresses: { type: 'number' },
          note: { type: 'string' },
          reason: { type: 'string' },
        },
      },
      render: (_args: { cidr: string; hosts: number[] }, value: unknown) => [{ type: 'text', text: renderAllocate(value) }],
    },
    async execute(args: { cidr: string; hosts: number[]; order?: 'largest_first' | 'given'; point_to_point?: boolean }): Promise<AllocateResult> {
      const spec = parseCidr(args.cidr)
      if (spec === null) {
        return { valid: false, input: args.cidr, reason: 'not a valid IPv4 CIDR (expected a.b.c.d/p, a.b.c.d/mask or a.b.c.d)' }
      }
      if (args.hosts.length < 1) {
        return { valid: false, input: args.cidr, reason: 'hosts must contain at least one entry' }
      }
      if (args.hosts.length > PLAN_LIMIT) {
        return { valid: false, input: args.cidr, reason: `hosts is limited to ${PLAN_LIMIT} entries per call (got ${args.hosts.length})` }
      }
      const pointToPoint = args.point_to_point === true
      const order = args.order ?? 'largest_first'
      const parent = subnetOf(spec)
      const prefixes: number[] = []
      for (let index = 0; index < args.hosts.length; index++) {
        const need = args.hosts[index]!
        const prefix = prefixForHosts(need, pointToPoint)
        if (prefix === null) {
          return {
            valid: false,
            input: args.cidr,
            reason: `entry #${index + 1} (${need}) is not a usable host count — expected an integer between 1 and ${MAX_REQUEST_HOSTS}`,
          }
        }
        prefixes.push(prefix)
      }
      const sizes = prefixes.map((prefix) => 2 ** (32 - prefix))
      const needed = sizes.reduce((total, size) => total + size, 0)
      const packed = packBlocks(parent.network_integer, parent.addresses, sizes, order === 'largest_first')
      if (packed === null) {
        // Aligned power-of-two blocks never fragment (see packBlocks): the only
        // way to fail is that the blocks do not all fit in the parent.
        return {
          valid: false,
          input: args.cidr,
          cidr: parent.cidr,
          reason: `requests need ${needed} addresses but ${parent.cidr} only has ${parent.addresses}`,
        }
      }

      const allocations: AllocationEntry[] = []
      for (const placement of packed.placements) {
        const prefix = prefixes[placement.index]!
        const entry: AllocationEntry = {
          request_index: placement.index,
          requested_hosts: args.hosts[placement.index]!,
          prefix,
          cidr: `${formatV4(placement.start)}/${prefix}`,
          network: formatV4(placement.start),
          last: formatV4(placement.start + placement.size - 1),
          addresses: placement.size,
          usable_hosts: usableHostsForPrefix(prefix),
          wasted: placement.size - args.hosts[placement.index]!,
        }
        if (prefix === 32) entry.note = 'single host'
        else if (prefix === 31) entry.note = 'RFC 3021 point-to-point pair'
        allocations.push(entry)
      }
      allocations.sort((a, b) => a.request_index - b.request_index)

      const freeRanges = packed.free
      const freeBlocks = freeRanges.flatMap(([from, to]) => rangeToCidrs(from, to))
      const requestedHosts = args.hosts.reduce((total, need) => total + need, 0)
      const allocatedAddresses = sizes.reduce((total, size) => total + size, 0)
      const result: AllocateResult = {
        valid: true,
        input: args.cidr,
        cidr: parent.cidr,
        order,
        allocations,
        count: allocations.length,
        placement: packed.placements.map((placement) => placement.index),
        requested_hosts: requestedHosts,
        allocated_addresses: allocatedAddresses,
        allocated_usable: allocations.reduce((total, entry) => total + entry.usable_hosts, 0),
        parent_addresses: parent.addresses,
        wasted_addresses: allocatedAddresses - requestedHosts,
        free_blocks: freeBlocks,
        free_count: freeBlocks.length,
        free_addresses: freeRanges.reduce((total, [from, to]) => total + (to - from + 1), 0),
      }
      if (spec.ip.integer !== parent.network_integer) {
        result.note = `parent normalized to ${parent.cidr} (bits below /${parent.prefix} are host bits)`
      }
      return result
    },
  })

  const ipv4_exclude = defineTool({
    name: 'ipv4_exclude',
    description: 'Carve reserved blocks out of a pool: give a parent IPv4 CIDR plus the subnets to '
      + 'exclude (e.g. cidr "10.0.0.0/16", exclude ["10.0.0.0/24", "10.0.8.0/22"]) and get back the '
      + 'remaining free space as the minimal CIDR list, the exact number of free addresses, and one '
      + 'entry per exclusion with its block size, how many addresses it actually removes and whether it '
      + 'lies fully inside the pool. Entries that overlap each other are only subtracted once; entries '
      + 'reaching outside the pool are reported as such instead of being silently clipped. Pure local '
      + 'math, no network access. Use it before splitting a range so the reservations stop being manual '
      + 'bookkeeping.',
    parameters: {
      cidr: { type: 'string', required: true, description: 'Parent IPv4 pool to subtract from: "a.b.c.d/prefix", "a.b.c.d/dotted-mask" or a bare "a.b.c.d" address.' },
      exclude: {
        type: 'array',
        required: true,
        items: { type: 'string' },
        description: 'CIDRs to carve out of the pool, e.g. ["10.0.0.0/24", "10.0.8.0/22"] (1–64 entries).',
      },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          valid: { type: 'boolean', required: true },
          input: { type: 'string' },
          cidr: { type: 'string' },
          excluded: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                input: { type: 'string', required: true },
                cidr: { type: 'string', required: true },
                addresses: { type: 'number', required: true },
                removed: { type: 'number', required: true },
                fully_inside: { type: 'boolean', required: true },
              },
            },
          },
          removed_addresses: { type: 'number' },
          outside_addresses: { type: 'number' },
          free: { type: 'array', items: { type: 'string' } },
          free_count: { type: 'number' },
          free_addresses: { type: 'number' },
          note: { type: 'string' },
          reason: { type: 'string' },
        },
      },
      render: (_args: { cidr: string; exclude: string[] }, value: unknown) => [{ type: 'text', text: renderExclude(value) }],
    },
    async execute(args: { cidr: string; exclude: string[] }): Promise<ExcludeResult> {
      const spec = parseCidr(args.cidr)
      if (spec === null) {
        return { valid: false, input: args.cidr, reason: 'not a valid IPv4 CIDR (expected a.b.c.d/p, a.b.c.d/mask or a.b.c.d)' }
      }
      if (args.exclude.length < 1) {
        return { valid: false, input: args.cidr, reason: 'exclude must contain at least one CIDR' }
      }
      if (args.exclude.length > PLAN_LIMIT) {
        return { valid: false, input: args.cidr, reason: `exclude is limited to ${PLAN_LIMIT} entries per call (got ${args.exclude.length})` }
      }
      const parent = subnetOf(spec)
      const entries: ExclusionEntry[] = []
      const cuts: Array<[number, number]> = []
      let outsideAddresses = 0
      for (let index = 0; index < args.exclude.length; index++) {
        const text = args.exclude[index]!
        const cut = parseCidr(text)
        if (cut === null) {
          return { valid: false, input: args.cidr, reason: `entry #${index + 1} ("${text}") is not a valid IPv4 address or CIDR` }
        }
        const size = 2 ** (32 - cut.prefix)
        const from = cut.ip.integer - (cut.ip.integer % size)
        const to = from + size - 1
        cuts.push([from, to])
        const overlapFrom = Math.max(from, parent.network_integer)
        const overlapTo = Math.min(to, parent.broadcast_integer)
        const removed = overlapFrom <= overlapTo ? overlapTo - overlapFrom + 1 : 0
        outsideAddresses += size - removed
        entries.push({
          input: text,
          cidr: `${formatV4(from)}/${cut.prefix}`,
          addresses: size,
          removed,
          fully_inside: removed === size,
        })
      }

      const freeRanges = subtractRanges(parent.network_integer, parent.broadcast_integer, cuts)
      const free = freeRanges.flatMap(([from, to]) => rangeToCidrs(from, to))
      const freeAddresses = freeRanges.reduce((total, [from, to]) => total + (to - from + 1), 0)
      const result: ExcludeResult = {
        valid: true,
        input: args.cidr,
        cidr: parent.cidr,
        excluded: entries,
        removed_addresses: parent.addresses - freeAddresses,
        outside_addresses: outsideAddresses,
        free,
        free_count: free.length,
        free_addresses: freeAddresses,
      }
      const notes: string[] = []
      if (free.length === 0) notes.push('every address of the pool is excluded — nothing is left to allocate')
      else if (outsideAddresses > 0) notes.push('some exclusions reach outside the pool; only the overlapping part is removed')
      if (spec.ip.integer !== parent.network_integer) notes.push(`parent normalized to ${parent.cidr} (bits below /${parent.prefix} are host bits)`)
      if (notes.length > 0) result.note = notes.join('; ')
      return result
    },
  })

  const ipv4_range = defineTool({
    name: 'ipv4_range',
    description: 'Convert an arbitrary IPv4 address range (start and end address) into the minimal '
      + 'list of CIDR blocks that covers exactly that range — the inverse of summarizing. Returns the '
      + 'block list, the block count and the exact number of addresses covered. Pure local math, no '
      + 'network access. Use this to turn "10.0.5.3 to 10.0.9.200" into firewall/ACL rules instead of '
      + 'approximating with an oversized subnet.',
    parameters: {
      start: { type: 'string', required: true, description: 'First address of the range as a bare dotted-quad IPv4 address (no CIDR notation).' },
      end: { type: 'string', required: true, description: 'Last address of the range as a bare dotted-quad IPv4 address (no CIDR notation).' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          valid: { type: 'boolean', required: true },
          start: { type: 'string' },
          end: { type: 'string' },
          cidrs: { type: 'array', items: { type: 'string' } },
          count: { type: 'number' },
          addresses_covered: { type: 'number' },
          note: { type: 'string' },
          reason: { type: 'string' },
        },
      },
      render: (_args: { start: string; end: string }, value: unknown) => [{ type: 'text', text: renderRange(value) }],
    },
    async execute(args: { start: string; end: string }): Promise<RangeResult> {
      const first = parseV4(args.start.trim())
      if (first === null) {
        return { valid: false, reason: `"${args.start.trim()}" is not a valid bare IPv4 address (CIDR notation is not allowed here)` }
      }
      const last = parseV4(args.end.trim())
      if (last === null) {
        return { valid: false, reason: `"${args.end.trim()}" is not a valid bare IPv4 address (CIDR notation is not allowed here)` }
      }
      if (first.integer > last.integer) {
        return { valid: false, start: first.text, end: last.text, reason: `start (${first.text}) is greater than end (${last.text}) — swap the arguments` }
      }
      const cidrs = rangeToCidrs(first.integer, last.integer)
      const result: RangeResult = {
        valid: true,
        start: first.text,
        end: last.text,
        cidrs,
        count: cidrs.length,
        addresses_covered: last.integer - first.integer + 1,
      }
      if (first.integer === last.integer) result.note = 'single address (one /32)'
      return result
    },
  })

  const ip_parse = defineTool({
    name: 'ip_parse',
    description: 'Validate and normalize any IPv4 or IPv6 address string: detect the version, expand '
      + 'compressed IPv6 to its full eight-hextet form, apply RFC 5952 canonicalization, report integer '
      + 'values (IPv4) or the 128-bit hex form (IPv6), recognize embedded IPv4-in-IPv6 forms, and classify '
      + 'the address (private, loopback, link-local, multicast, documentation, CGNAT, reserved, global...). '
      + 'Pure local math, no network access.',
    parameters: {
      ip: { type: 'string', required: true, description: 'The IP address string to parse, e.g. "192.168.0.1", "2001:db8::1" or "::ffff:10.0.0.1".' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          valid: { type: 'boolean', required: true },
          input: { type: 'string', required: true },
          version: { type: 'number', enum: [4, 6] },
          normalized: { type: 'string' },
          full: { type: 'string' },
          class: { type: 'string', enum: [...V4_CLASSES, ...V6_CLASSES] },
          octets: { type: 'array', items: { type: 'number' } },
          integer: { type: 'number' },
          hextets: { type: 'array', items: { type: 'number' } },
          hex128: { type: 'string' },
          embedded_ipv4: { type: 'string' },
          reason: { type: 'string' },
        },
      },
      render: (_args: { ip: string }, value: unknown) => [{ type: 'text', text: renderIpParse(value) }],
    },
    async execute(args: { ip: string }): Promise<IpParseResult> {
      const input = args.ip.trim()
      const v4 = parseCidr(input)
      // A bare v4 (prefix /32, no slash) is a valid IPv4 literal; a CIDR is not an address.
      if (v4 !== null && !input.includes('/')) {
        const parsed = v4.ip
        return {
          valid: true,
          input,
          version: 4,
          normalized: parsed.text,
          class: classifyV4(parsed.integer),
          octets: [...parsed.octets],
          integer: parsed.integer,
        }
      }
      const v6 = parseV6(input)
      if (v6 !== null) {
        const result: IpParseResult = {
          valid: true,
          input,
          version: 6,
          normalized: v6.normalized,
          full: v6.full,
          class: v6.class,
          hextets: [...v6.hextets],
          hex128: v6.hex128,
        }
        if (v6.embeddedIpv4 !== undefined) result.embedded_ipv4 = v6.embeddedIpv4
        return result
      }
      return { valid: false, input, reason: 'not a valid IPv4 or IPv6 address' }
    },
  })

  const ipv6_subnet = defineTool({
    name: 'ipv6_subnet',
    description: 'Compute the complete subnet layout for an IPv6 address in CIDR notation '
      + '(e.g. "2001:db8:1234::1/64" or a bare address treated as /128): network address, '
      + 'first/last usable host, exact address counts as decimal strings (128-bit BigInt math, '
      + 'counts can exceed 2^53), RFC 5952 canonical forms and the IANA address class. '
      + '/127 follows RFC 6164 (both addresses usable). Pure local math, no network access. '
      + 'Use this instead of doing IPv6 subnet arithmetic in your head.',
    parameters: {
      cidr: { type: 'string', required: true, description: 'IPv6 CIDR to analyze: "addr/prefix" with a numeric prefix 0–128, or a bare IPv6 address (treated as /128).' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          valid: { type: 'boolean', required: true },
          input: { type: 'string', required: true },
          cidr: { type: 'string' },
          network: { type: 'string' },
          network_full: { type: 'string' },
          last: { type: 'string' },
          prefix: { type: 'number' },
          first_host: { type: 'string' },
          last_host: { type: 'string' },
          addresses: { type: 'string' },
          usable_hosts: { type: 'string' },
          network_class: { type: 'string', enum: [...V6_CLASSES] },
          note: { type: 'string' },
          reason: { type: 'string' },
        },
      },
      render: (_args: { cidr: string }, value: unknown) => [{ type: 'text', text: renderV6Subnet(value) }],
    },
    async execute(args: { cidr: string }): Promise<V6SubnetResult> {
      const spec = parseV6Cidr(args.cidr)
      if (spec === null) {
        return { valid: false, input: args.cidr, reason: 'not a valid IPv6 CIDR (expected addr/prefix with a numeric prefix 0–128, or a bare IPv6 address)' }
      }
      return okV6Subnet(args.cidr, spec)
    },
  })

  const ip_match = defineTool({
    name: 'ip_match',
    description: 'Test whether a bare IP address (IPv4 or IPv6) belongs to a CIDR range, '
      + 'e.g. ip "192.168.1.5" vs cidr "192.168.1.0/24", or "2001:db8::5" vs "2001:db8::/32". '
      + 'Reports membership plus the normalized network range; mixed-version input is rejected '
      + 'with a reason. Pure local math, no network access.',
    parameters: {
      ip: { type: 'string', required: true, description: 'The bare IP address to test (no CIDR notation).' },
      cidr: { type: 'string', required: true, description: 'The IPv4 or IPv6 CIDR range to test against.' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          valid: { type: 'boolean', required: true },
          in_subnet: { type: 'boolean' },
          ip: { type: 'string' },
          ip_version: { type: 'number', enum: [4, 6] },
          cidr: { type: 'string' },
          cidr_version: { type: 'number', enum: [4, 6] },
          network: { type: 'string' },
          last: { type: 'string' },
          reason: { type: 'string' },
        },
      },
      render: (_args: { ip: string; cidr: string }, value: unknown) => [{ type: 'text', text: renderIpMatch(value) }],
    },
    async execute(args: { ip: string; cidr: string }): Promise<IpMatchResult> {
      const ipInput = args.ip.trim()
      const cidrInput = args.cidr.trim()
      const v4Ip = parseV4(ipInput)
      const v6Ip = parseV6(ipInput)
      const v4Cidr = parseCidr(cidrInput)
      const v6Cidr = parseV6Cidr(cidrInput)
      if (v4Ip === null && v6Ip === null) {
        return { valid: false, reason: `"${ipInput}" is not a valid bare IPv4 or IPv6 address (CIDR notation is not allowed here)` }
      }
      if (v4Cidr === null && v6Cidr === null) {
        return { valid: false, reason: `"${cidrInput}" is not a valid IPv4 or IPv6 CIDR` }
      }
      const ipVersion: 4 | 6 = v4Ip !== null ? 4 : 6
      const cidrVersion: 4 | 6 = v4Cidr !== null ? 4 : 6
      if (ipVersion !== cidrVersion) {
        return { valid: false, reason: `version mismatch: ip is IPv${ipVersion} but cidr is IPv${cidrVersion}` }
      }
      if (v4Ip !== null && v4Cidr !== null) {
        const subnet = subnetOf(v4Cidr)
        const inside = v4Ip.integer >= subnet.network_integer && v4Ip.integer <= subnet.broadcast_integer
        return {
          valid: true,
          in_subnet: inside,
          ip: v4Ip.text,
          ip_version: 4,
          cidr: subnet.cidr,
          cidr_version: 4,
          network: subnet.network,
          last: subnet.broadcast,
        }
      }
      const ipParsed = v6Ip!
      const cidrParsed = v6Cidr!
      const range = v6RangeOf(cidrParsed)
      const address = v6ToBigInt(ipParsed.hextets)
      const inside = address >= range.network && address <= range.last
      const networkHextets = bigIntToHextets(range.network)
      return {
        valid: true,
        in_subnet: inside,
        ip: ipParsed.normalized,
        ip_version: 6,
        cidr: `${normalizeV6(networkHextets)}/${cidrParsed.prefix}`,
        cidr_version: 6,
        network: normalizeV6(networkHextets),
        last: normalizeV6(bigIntToHextets(range.last)),
      }
    },
  })

  return { ipv4_subnet, ipv4_summarize, ipv4_split, ipv4_allocate, ipv4_exclude, ipv4_range, ip_parse, ipv6_subnet, ip_match }
}
