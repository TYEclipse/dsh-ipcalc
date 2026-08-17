/**
 * Tool definitions for dsh-ipcalc: three pure-math tools exposed to every
 * agent via defineTool. Each tool has a strict JSON-schema parameter
 * surface and a compact text renderer. No network I/O happens anywhere.
 *
 * @module dsh-ipcalc/tools
 */
import { defineTool } from '@deepseek-ai/dsh-tools';
import { classifyV4, parseCidr, subnetOf, summarizeSpecs, } from "./ipv4.js";
import { parseV6 } from "./ipv6.js";
const V4_CLASSES = [
    'unspecified', 'broadcast', 'loopback', 'private', 'cgnat', 'link_local',
    'documentation', 'multicast', 'reserved', 'global',
];
const V6_CLASSES = [
    'unspecified', 'loopback', 'ipv4_mapped', 'ipv4_compatible', 'documentation',
    'link_local', 'multicast', 'unique_local', 'global',
];
function okSubnet(input, spec) {
    const info = subnetOf(spec);
    const result = {
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
    };
    if (info.note !== undefined)
        result.note = info.note;
    return result;
}
function renderSubnet(value) {
    const result = value;
    if (!result.valid || result.cidr === undefined) {
        return `invalid input: ${result.reason ?? 'unknown error'}`;
    }
    const lines = [
        `${result.input} → network ${result.cidr}`,
        `  netmask ${result.netmask}  wildcard ${result.wildcard}  broadcast ${result.broadcast}`,
        `  host range ${result.first_host} – ${result.last_host}  (${result.usable_hosts} usable of ${result.addresses})`,
        `  classes: network=${result.network_class}  host=${result.host_class}`,
    ];
    if (result.note !== undefined)
        lines.push(`  note: ${result.note}`);
    return lines.join('\n');
}
function renderSummarize(value) {
    const result = value;
    if (!result.valid)
        return `invalid input: ${result.reason ?? 'unknown error'}`;
    return `${result.input_count} input(s) → ${result.output_count} CIDR(s) covering ${result.addresses_covered} address(es):\n  ${(result.cidrs ?? []).join('\n  ')}`;
}
function renderIpParse(value) {
    const result = value;
    if (!result.valid)
        return `invalid IP: ${result.reason ?? 'unknown error'}`;
    const detail = result.version === 4
        ? `octets [${(result.octets ?? []).join('.')}] = ${result.integer}`
        : `${result.full}${result.embedded_ipv4 !== undefined ? ` (embeds ${result.embedded_ipv4})` : ''}`;
    return `${result.input} → IPv${result.version}, class ${result.class}, normalized ${result.normalized}\n  ${detail}`;
}
/** Build the three ipcalc tool definitions. */
export function buildIpcalcTools() {
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
            render: (_args, value) => [{ type: 'text', text: renderSubnet(value) }],
        },
        async execute(args) {
            const spec = parseCidr(args.cidr);
            if (spec === null) {
                return { valid: false, input: args.cidr, reason: 'not a valid IPv4 CIDR (expected a.b.c.d/p, a.b.c.d/mask or a.b.c.d)' };
            }
            return okSubnet(args.cidr, spec);
        },
    });
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
            render: (_args, value) => [{ type: 'text', text: renderSummarize(value) }],
        },
        async execute(args) {
            if (args.networks.length < 1) {
                return { valid: false, reason: 'networks must contain at least one entry' };
            }
            if (args.networks.length > 1000) {
                return { valid: false, reason: 'networks is limited to 1000 entries' };
            }
            const specs = [];
            for (let i = 0; i < args.networks.length; i++) {
                const spec = parseCidr(args.networks[i]);
                if (spec === null) {
                    return { valid: false, reason: `entry #${i + 1} ("${args.networks[i]}") is not a valid IPv4 address or CIDR` };
                }
                specs.push(spec);
            }
            const cidrs = summarizeSpecs(specs);
            let covered = 0;
            for (const cidr of cidrs) {
                const parts = cidr.split('/');
                covered += 2 ** (32 - Number(parts[1]));
            }
            return {
                valid: true,
                cidrs,
                input_count: args.networks.length,
                output_count: cidrs.length,
                addresses_covered: covered,
            };
        },
    });
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
            render: (_args, value) => [{ type: 'text', text: renderIpParse(value) }],
        },
        async execute(args) {
            const input = args.ip.trim();
            const v4 = parseCidr(input);
            // A bare v4 (prefix /32, no slash) is a valid IPv4 literal; a CIDR is not an address.
            if (v4 !== null && !input.includes('/')) {
                const parsed = v4.ip;
                return {
                    valid: true,
                    input,
                    version: 4,
                    normalized: parsed.text,
                    class: classifyV4(parsed.integer),
                    octets: [...parsed.octets],
                    integer: parsed.integer,
                };
            }
            const v6 = parseV6(input);
            if (v6 !== null) {
                const result = {
                    valid: true,
                    input,
                    version: 6,
                    normalized: v6.normalized,
                    full: v6.full,
                    class: v6.class,
                    hextets: [...v6.hextets],
                    hex128: v6.hex128,
                };
                if (v6.embeddedIpv4 !== undefined)
                    result.embedded_ipv4 = v6.embeddedIpv4;
                return result;
            }
            return { valid: false, input, reason: 'not a valid IPv4 or IPv6 address' };
        },
    });
    return { ipv4_subnet, ipv4_summarize, ip_parse };
}
//# sourceMappingURL=tools.js.map