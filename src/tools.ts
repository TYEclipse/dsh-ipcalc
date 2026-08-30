/**
 * Tool definitions for dsh-ipcalc: three pure-math tools exposed to every
 * agent via defineTool. Each tool has a strict JSON-schema parameter
 * surface and a compact text renderer. No network I/O happens anywhere.
 *
 * @module dsh-ipcalc/tools
 */

import { defineTool, type ToolDefinition } from '@deepseek-ai/dsh-tools'
import {
  classifyV4,
  parseCidr,
  parseV4,
  subnetOf,
  summarizeSpecs,
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
  ip_parse: ToolDefinition
  ipv6_subnet: ToolDefinition
  ip_match: ToolDefinition
}

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

  return { ipv4_subnet, ipv4_summarize, ip_parse, ipv6_subnet, ip_match }
}
