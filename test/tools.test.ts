/**
 * Tests for the dsh-ipcalc tool definitions, execute branches and
 * text renderers.
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

describe('buildIpcalcTools', () => {
  it('exposes all five tools under their canonical names', () => {
    expect(Object.keys(tools).sort()).toEqual(['ip_match', 'ip_parse', 'ipv4_subnet', 'ipv4_summarize', 'ipv6_subnet'].sort())
  })

  it('gives every tool a name, description, schema and executable', () => {
    for (const [key, definition] of Object.entries(tools)) {
      expect(definition.name).toBe(key)
      expect(definition.description.length).toBeGreaterThan(20)
      expect(definition.parameters).toBeDefined()
      expect(definition.output.schema).toBeDefined()
      expect(typeof definition.execute).toBe('function')
    }
  })
})

describe('ipv4_subnet', () => {
  it('computes a subnet from CIDR input', async () => {
    const result = await tools.ipv4_subnet.execute({ cidr: '192.168.1.25/24' })
    expect(result.valid).toBe(true)
    expect(result.cidr).toBe('192.168.1.0/24')
    expect(result.broadcast).toBe('192.168.1.255')
    expect(result.usable_hosts).toBe(254)
    expect(result.network_class).toBe('private')
  })

  it('computes a subnet from dotted-mask input', async () => {
    const result = await tools.ipv4_subnet.execute({ cidr: '10.10.10.10/255.255.255.248' })
    expect(result.valid).toBe(true)
    expect(result.cidr).toBe('10.10.10.8/29')
    expect(result.usable_hosts).toBe(6)
  })

  it('reports invalid input without throwing', async () => {
    const result = await tools.ipv4_subnet.execute({ cidr: '999.1.1.1/24' })
    expect(result.valid).toBe(false)
    expect(result.reason).toBeDefined()
  })

  it('renders a subnet result as readable text', () => {
    const block = tools.ipv4_subnet.output.render(
      { cidr: '192.168.1.25/24' },
      {
        valid: true,
        input: '192.168.1.25/24',
        cidr: '192.168.1.0/24',
        netmask: '255.255.255.0',
        wildcard: '0.0.0.255',
        broadcast: '192.168.1.255',
        first_host: '192.168.1.1',
        last_host: '192.168.1.254',
        usable_hosts: 254,
        addresses: 256,
        network_class: 'private',
        host_class: 'private',
      },
    )
    expect(block[0]?.type).toBe('text')
    expect(block[0]?.text).toContain('192.168.1.25/24 → network 192.168.1.0/24')
    expect(block[0]?.text).toContain('host range 192.168.1.1 – 192.168.1.254')
  })

  it('renders invalid input as a reason line', () => {
    const block = tools.ipv4_subnet.output.render(
      { cidr: 'x' },
      { valid: false, input: 'x', reason: 'bad' },
    )
    expect(block[0]?.text).toContain('invalid input: bad')
  })
})

describe('ipv4_summarize', () => {
  it('summarizes adjacent /24s into a /23', async () => {
    const result = await tools.ipv4_summarize.execute({ networks: ['192.168.0.0/24', '192.168.1.0/24'] })
    expect(result.valid).toBe(true)
    expect(result.cidrs).toEqual(['192.168.0.0/23'])
    expect(result.input_count).toBe(2)
    expect(result.output_count).toBe(1)
    expect(result.addresses_covered).toBe(512)
  })

  it('reports the offending entry index on invalid input', async () => {
    const result = await tools.ipv4_summarize.execute({ networks: ['10.0.0.0/24', 'bad'] })
    expect(result.valid).toBe(false)
    expect(result.reason).toContain('#2')
  })

  it('rejects empty input', async () => {
    const result = await tools.ipv4_summarize.execute({ networks: [] })
    expect(result.valid).toBe(false)
  })

  it('renders a summary as readable text', () => {
    const block = tools.ipv4_summarize.output.render(
      { networks: ['a'] },
      { valid: true, cidrs: ['10.0.0.0/22'], input_count: 4, output_count: 1, addresses_covered: 1024 },
    )
    expect(block[0]?.text).toContain('4 input(s) → 1 CIDR(s) covering 1024 address(es)')
  })
})

describe('ip_parse', () => {
  it('parses a global IPv4 address', async () => {
    const result = await tools.ip_parse.execute({ ip: '8.8.8.8' })
    expect(result.valid).toBe(true)
    expect(result.version).toBe(4)
    expect(result.normalized).toBe('8.8.8.8')
    expect(result.class).toBe('global')
    expect(result.octets).toEqual([8, 8, 8, 8])
    expect(result.integer).toBe(134744072)
  })

  it('parses a private IPv4 address', async () => {
    const result = await tools.ip_parse.execute({ ip: '192.168.0.1' })
    expect(result.version).toBe(4)
    expect(result.class).toBe('private')
    expect(result.integer).toBe(3232235521)
  })

  it('parses and classifies an IPv6 address', async () => {
    const result = await tools.ip_parse.execute({ ip: '2001:db8::1' })
    expect(result.valid).toBe(true)
    expect(result.version).toBe(6)
    expect(result.class).toBe('documentation')
    expect(result.normalized).toBe('2001:db8::1')
    expect(result.hex128).toBe('20010db8000000000000000000000001')
  })

  it('detects IPv4-mapped IPv6 addresses', async () => {
    const result = await tools.ip_parse.execute({ ip: '::ffff:192.168.1.1' })
    expect(result.version).toBe(6)
    expect(result.class).toBe('ipv4_mapped')
    expect(result.embedded_ipv4).toBe('192.168.1.1')
  })

  it('does not treat a CIDR as an address', async () => {
    const result = await tools.ip_parse.execute({ ip: '192.168.1.0/24' })
    expect(result.valid).toBe(false)
  })

  it('reports invalid input with a reason', async () => {
    const result = await tools.ip_parse.execute({ ip: '999.1.1.1' })
    expect(result.valid).toBe(false)
    expect(result.reason).toContain('not a valid')
  })

  it('renders a parsed address as readable text', () => {
    const block = tools.ip_parse.output.render(
      { ip: '::1' },
      { valid: true, input: '::1', version: 6, normalized: '::1', full: '0000:0000:0000:0000:0000:0000:0000:0001', class: 'loopback' },
    )
    expect(block[0]?.text).toContain('::1 → IPv6, class loopback')
  })
})

describe('ipv6_subnet', () => {
  // Anchors generated by the independent Python oracle (stdlib ipaddress).
  it('computes a /32 subnet with exact BigInt counts', async () => {
    const result = await tools.ipv6_subnet.execute({ cidr: '2001:db8::/32' })
    assertNoUndefined(result, 'result')
    expect(result.valid).toBe(true)
    expect(result.cidr).toBe('2001:db8::/32')
    expect(result.network).toBe('2001:db8::')
    expect(result.last).toBe('2001:db8:ffff:ffff:ffff:ffff:ffff:ffff')
    expect(result.first_host).toBe('2001:db8::1')
    expect(result.last_host).toBe('2001:db8:ffff:ffff:ffff:ffff:ffff:fffe')
    expect(result.addresses).toBe('79228162514264337593543950336')
    expect(result.usable_hosts).toBe('79228162514264337593543950334')
    expect(result.prefix).toBe(32)
    expect(result.network_class).toBe('documentation')
  })

  it('computes a /64 subnet from an address with host bits', async () => {
    const result = await tools.ipv6_subnet.execute({ cidr: '2001:db8:1234:5678::1/64' })
    assertNoUndefined(result, 'result')
    expect(result.network).toBe('2001:db8:1234:5678::')
    expect(result.last).toBe('2001:db8:1234:5678:ffff:ffff:ffff:ffff')
    expect(result.first_host).toBe('2001:db8:1234:5678::1')
    expect(result.addresses).toBe('18446744073709551616')
    expect(result.usable_hosts).toBe('18446744073709551614')
    expect(result.network_full).toBe('2001:0db8:1234:5678:0000:0000:0000:0000')
  })

  it('handles ::/0 (the whole IPv6 space)', async () => {
    const result = await tools.ipv6_subnet.execute({ cidr: '::/0' })
    assertNoUndefined(result, 'result')
    expect(result.network).toBe('::')
    expect(result.last).toBe('ffff:ffff:ffff:ffff:ffff:ffff:ffff:ffff')
    expect(result.first_host).toBe('::1')
    expect(result.addresses).toBe('340282366920938463463374607431768211456')
    expect(result.usable_hosts).toBe('340282366920938463463374607431768211454')
    expect(result.network_class).toBe('unspecified')
  })

  it('treats /128 as a single host', async () => {
    const result = await tools.ipv6_subnet.execute({ cidr: '::1/128' })
    assertNoUndefined(result, 'result')
    expect(result.first_host).toBe('::1')
    expect(result.last_host).toBe('::1')
    expect(result.addresses).toBe('1')
    expect(result.usable_hosts).toBe('1')
    expect(result.note).toContain('single host')
  })

  it('follows RFC 6164 for /127', async () => {
    const result = await tools.ipv6_subnet.execute({ cidr: 'fe80::1/127' })
    assertNoUndefined(result, 'result')
    expect(result.network).toBe('fe80::')
    expect(result.first_host).toBe('fe80::')
    expect(result.last_host).toBe('fe80::1')
    expect(result.addresses).toBe('2')
    expect(result.usable_hosts).toBe('2')
    expect(result.note).toContain('RFC 6164')
    expect(result.network_class).toBe('link_local')
  })

  it('masks host bits away for an unaligned address', async () => {
    const result = await tools.ipv6_subnet.execute({ cidr: '2001:db8::5a/64' })
    expect(result.network).toBe('2001:db8::')
    expect(result.last).toBe('2001:db8::ffff:ffff:ffff:ffff')
  })

  it('computes the all-ones /128 single host', async () => {
    const result = await tools.ipv6_subnet.execute({ cidr: 'ffff:ffff:ffff:ffff:ffff:ffff:ffff:ffff/128' })
    assertNoUndefined(result, 'result')
    expect(result.network).toBe('ffff:ffff:ffff:ffff:ffff:ffff:ffff:ffff')
    expect(result.addresses).toBe('1')
  })

  it('handles a /48 with non-8-boundary prefix', async () => {
    const result = await tools.ipv6_subnet.execute({ cidr: '2001:db8:abcd:12::3/48' })
    assertNoUndefined(result, 'result')
    expect(result.network).toBe('2001:db8:abcd::')
    expect(result.last).toBe('2001:db8:abcd:ffff:ffff:ffff:ffff:ffff')
    expect(result.addresses).toBe('1208925819614629174706176')
    expect(result.usable_hosts).toBe('1208925819614629174706174')
  })

  it('treats a bare address as /128', async () => {
    const result = await tools.ipv6_subnet.execute({ cidr: '2001:db8::1' })
    expect(result.valid).toBe(true)
    expect(result.prefix).toBe(128)
    expect(result.network).toBe('2001:db8::1')
  })

  it('reports invalid CIDR input without throwing', async () => {
    const result = await tools.ipv6_subnet.execute({ cidr: '2001:db8::/129' })
    expect(result.valid).toBe(false)
    expect(result.reason).toContain('not a valid IPv6 CIDR')
    const bad2 = await tools.ipv6_subnet.execute({ cidr: '192.168.1.0/24' })
    expect(bad2.valid).toBe(false)
    const bad3 = await tools.ipv6_subnet.execute({ cidr: 'not-an-ip/64' })
    expect(bad3.valid).toBe(false)
  })

  it('renders a subnet result as readable text', () => {
    const block = tools.ipv6_subnet.output.render(
      { cidr: '2001:db8::/32' },
      {
        valid: true,
        input: '2001:db8::/32',
        cidr: '2001:db8::/32',
        network: '2001:db8::',
        network_full: '2001:0db8:0000:0000:0000:0000:0000:0000',
        last: '2001:db8:ffff:ffff:ffff:ffff:ffff:ffff',
        prefix: 32,
        first_host: '2001:db8::1',
        last_host: '2001:db8:ffff:ffff:ffff:ffff:ffff:fffe',
        addresses: '79228162514264337593543950336',
        usable_hosts: '79228162514264337593543950334',
        network_class: 'documentation',
      },
    )
    expect(block[0]?.text).toContain('2001:db8::/32 → network 2001:db8::/32')
    expect(block[0]?.text).toContain('range 2001:db8::1 – 2001:db8:ffff:ffff:ffff:ffff:ffff:fffe')
  })
})

describe('ip_match', () => {
  // Anchors generated by the independent Python oracle (stdlib ipaddress).
  it('matches an IPv4 address inside its /24', async () => {
    const result = await tools.ip_match.execute({ ip: '192.168.1.5', cidr: '192.168.1.0/24' })
    assertNoUndefined(result, 'result')
    expect(result.valid).toBe(true)
    expect(result.in_subnet).toBe(true)
    expect(result.ip_version).toBe(4)
    expect(result.cidr).toBe('192.168.1.0/24')
    expect(result.network).toBe('192.168.1.0')
    expect(result.last).toBe('192.168.1.255')
  })

  it('rejects an IPv4 address outside its /24', async () => {
    const result = await tools.ip_match.execute({ ip: '192.168.2.5', cidr: '192.168.1.0/24' })
    expect(result.valid).toBe(true)
    expect(result.in_subnet).toBe(false)
  })

  it('includes boundary addresses of an IPv4 range', async () => {
    const top = await tools.ip_match.execute({ ip: '10.255.255.255', cidr: '10.0.0.0/8' })
    expect(top.in_subnet).toBe(true)
    const base = await tools.ip_match.execute({ ip: '10.0.0.0', cidr: '10.0.0.0/8' })
    expect(base.in_subnet).toBe(true)
  })

  it('matches an IPv6 address inside a documentation /32', async () => {
    const result = await tools.ip_match.execute({ ip: '2001:db8::5', cidr: '2001:db8::/32' })
    assertNoUndefined(result, 'result')
    expect(result.valid).toBe(true)
    expect(result.in_subnet).toBe(true)
    expect(result.ip).toBe('2001:db8::5')
    expect(result.cidr).toBe('2001:db8::/32')
    expect(result.ip_version).toBe(6)
    expect(result.network).toBe('2001:db8::')
  })

  it('rejects an IPv6 address outside the CIDR', async () => {
    const result = await tools.ip_match.execute({ ip: '2001:db9::1', cidr: '2001:db8::/32' })
    expect(result.valid).toBe(true)
    expect(result.in_subnet).toBe(false)
  })

  it('matches an IPv4-mapped address inside ::ffff:0:0/96', async () => {
    const result = await tools.ip_match.execute({ ip: '::ffff:10.0.0.1', cidr: '::ffff:0:0/96' })
    expect(result.valid).toBe(true)
    expect(result.in_subnet).toBe(true)
    expect(result.network).toBe('::ffff:0:0')
    expect(result.last).toBe('::ffff:ffff:ffff')
  })

  it('matches link-local addresses against fe80::/10', async () => {
    const inResult = await tools.ip_match.execute({ ip: 'fe80::1', cidr: 'fe80::/10' })
    expect(inResult.in_subnet).toBe(true)
    const outResult = await tools.ip_match.execute({ ip: 'fe80::1', cidr: '2001:db8::/32' })
    expect(outResult.in_subnet).toBe(false)
  })

  it('covers the whole space with /0 ranges', async () => {
    const v4 = await tools.ip_match.execute({ ip: '255.255.255.255', cidr: '0.0.0.0/0' })
    expect(v4.in_subnet).toBe(true)
    const v6 = await tools.ip_match.execute({ ip: '::1', cidr: '::/0' })
    expect(v6.in_subnet).toBe(true)
  })

  it('rejects a version mismatch with a reason', async () => {
    const result = await tools.ip_match.execute({ ip: '192.168.1.5', cidr: '2001:db8::/32' })
    expect(result.valid).toBe(false)
    expect(result.reason).toContain('version mismatch')
    const other = await tools.ip_match.execute({ ip: '::1', cidr: '0.0.0.0/0' })
    expect(other.valid).toBe(false)
  })

  it('rejects CIDR notation for the ip argument', async () => {
    const result = await tools.ip_match.execute({ ip: '192.168.1.5/24', cidr: '192.168.1.0/24' })
    expect(result.valid).toBe(false)
    expect(result.reason).toContain('bare')
  })

  it('rejects invalid CIDR input', async () => {
    const result = await tools.ip_match.execute({ ip: '192.168.1.5', cidr: 'nonsense' })
    expect(result.valid).toBe(false)
    expect(result.reason).toContain('not a valid')
  })

  it('renders a match result as readable text', () => {
    const block = tools.ip_match.output.render(
      { ip: '192.168.1.5', cidr: '192.168.1.0/24' },
      {
        valid: true,
        in_subnet: true,
        ip: '192.168.1.5',
        ip_version: 4,
        cidr: '192.168.1.0/24',
        cidr_version: 4,
        network: '192.168.1.0',
        last: '192.168.1.255',
      },
    )
    expect(block[0]?.text).toContain('192.168.1.5 is INSIDE 192.168.1.0/24 (IPv4)')
  })

  it('renders an invalid match as a reason line', () => {
    const block = tools.ip_match.output.render(
      { ip: 'a', cidr: 'b' },
      { valid: false, reason: 'version mismatch' },
    )
    expect(block[0]?.text).toContain('invalid input: version mismatch')
  })
})
