/**
 * Tests for the dsh-ipcalc tool definitions, execute branches and
 * text renderers.
 */

import { describe, expect, it } from 'vitest'
import { buildIpcalcTools } from '../src/tools.ts'

const tools = buildIpcalcTools()

describe('buildIpcalcTools', () => {
  it('exposes all three tools under their canonical names', () => {
    expect(Object.keys(tools).sort()).toEqual(['ip_parse', 'ipv4_subnet', 'ipv4_summarize'].sort())
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
