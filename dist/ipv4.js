/**
 * dsh-ipcalc — pure IPv4 math: parsing, integer conversion, subnet
 * boundaries, classification and CIDR summarization.
 *
 * All math uses plain number arithmetic (multiplication / division /
 * modulo), so values up to 2^32 are exact doubles and no 32-bit bitwise
 * overflow can occur. This module performs no network I/O.
 *
 * @module dsh-ipcalc/ipv4
 */
const MAX = 2 ** 32;
function inRange(value, start, end) {
    return value >= start && value < end;
}
/** Build the 32-bit integer value of an IPv4 address. */
export function ip4(a, b, c, d) {
    return a * 2 ** 24 + b * 2 ** 16 + c * 256 + d;
}
/**
 * Parse a strict dotted-quad IPv4 address. Leading zeros, signs, extra
 * spaces and non-decimal input are rejected. Returns null when invalid.
 */
export function parseV4(text) {
    const parts = text.split('.');
    if (parts.length !== 4)
        return null;
    const octets = [];
    for (const part of parts) {
        if (!/^(0|[1-9][0-9]{0,2})$/.test(part))
            return null;
        const value = Number(part);
        if (value > 255)
            return null;
        octets.push(value);
    }
    const integer = ip4(octets[0], octets[1], octets[2], octets[3]);
    return { octets: octets, integer, text: octets.join('.') };
}
/** Format a 32-bit value as a dotted-quad IPv4 address. */
export function formatV4(integer) {
    if (!Number.isInteger(integer) || integer < 0 || integer >= MAX) {
        throw new Error(`not a valid IPv4 integer: ${integer}`);
    }
    const a = Math.floor(integer / 2 ** 24);
    const b = Math.floor(integer / 2 ** 16) % 256;
    const c = Math.floor(integer / 256) % 256;
    const d = integer % 256;
    return `${a}.${b}.${c}.${d}`;
}
/**
 * Convert a dotted netmask (e.g. 255.255.255.248) to a prefix length.
 * Only contiguous masks are accepted. Returns null when invalid.
 */
export function netmaskToPrefix(text) {
    const parsed = parseV4(text);
    if (parsed === null)
        return null;
    const block = MAX - parsed.integer;
    if (block < 1 || block > MAX)
        return null;
    const exponent = Math.log2(block);
    if (!Number.isInteger(exponent))
        return null;
    return 32 - exponent;
}
/**
 * Parse an IPv4 CIDR string. Accepts "a.b.c.d/p" (numeric prefix),
 * "a.b.c.d/n.n.n.n" (dotted netmask) and a bare address (treated as /32).
 * Returns null when invalid.
 */
export function parseCidr(text) {
    const trimmed = text.trim();
    if (trimmed === '')
        return null;
    if (trimmed.includes('/')) {
        const pieces = trimmed.split('/');
        if (pieces.length !== 2 || pieces[0] === '' || pieces[1] === '')
            return null;
        const ip = parseV4(pieces[0]);
        if (ip === null)
            return null;
        const maskPart = pieces[1];
        let prefix;
        if (/^[0-9]{1,2}$/.test(maskPart)) {
            prefix = Number(maskPart);
            if (prefix > 32)
                return null;
        }
        else {
            const fromMask = netmaskToPrefix(maskPart);
            if (fromMask === null)
                return null;
            prefix = fromMask;
        }
        return { ip, prefix };
    }
    const ip = parseV4(trimmed);
    if (ip === null)
        return null;
    return { ip, prefix: 32 };
}
/** Classify an IPv4 integer value per the IANA special-purpose registry. */
export function classifyV4(integer) {
    if (integer === 0)
        return 'unspecified';
    if (integer === MAX - 1)
        return 'broadcast';
    if (inRange(integer, ip4(240, 0, 0, 0), MAX))
        return 'reserved';
    if (inRange(integer, ip4(224, 0, 0, 0), ip4(240, 0, 0, 0)))
        return 'multicast';
    if (inRange(integer, ip4(127, 0, 0, 0), ip4(128, 0, 0, 0)))
        return 'loopback';
    if (inRange(integer, ip4(10, 0, 0, 0), ip4(11, 0, 0, 0)))
        return 'private';
    if (inRange(integer, ip4(172, 16, 0, 0), ip4(172, 32, 0, 0)))
        return 'private';
    if (inRange(integer, ip4(192, 168, 0, 0), ip4(192, 169, 0, 0)))
        return 'private';
    if (inRange(integer, ip4(100, 64, 0, 0), ip4(100, 128, 0, 0)))
        return 'cgnat';
    if (inRange(integer, ip4(169, 254, 0, 0), ip4(169, 255, 0, 0)))
        return 'link_local';
    if (inRange(integer, ip4(192, 0, 2, 0), ip4(192, 0, 3, 0)))
        return 'documentation';
    if (inRange(integer, ip4(198, 51, 100, 0), ip4(198, 51, 101, 0)))
        return 'documentation';
    if (inRange(integer, ip4(203, 0, 113, 0), ip4(203, 0, 114, 0)))
        return 'documentation';
    return 'global';
}
/**
 * Compute the complete subnet layout for a CIDR spec.
 * /31 follows RFC 3021 (both addresses usable on point-to-point links);
 * /32 is a single host.
 */
export function subnetOf(spec) {
    const { ip, prefix } = spec;
    const block = 2 ** (32 - prefix);
    const networkInteger = ip.integer - (ip.integer % block);
    const maskInteger = MAX - block;
    const broadcastInteger = networkInteger + block - 1;
    let firstHost;
    let lastHost;
    let usable;
    let note;
    if (prefix === 32) {
        firstHost = networkInteger;
        lastHost = networkInteger;
        usable = 1;
        note = 'single host';
    }
    else if (prefix === 31) {
        firstHost = networkInteger;
        lastHost = broadcastInteger;
        usable = 2;
        note = 'RFC 3021: both addresses are usable on point-to-point links';
    }
    else {
        firstHost = networkInteger + 1;
        lastHost = broadcastInteger - 1;
        usable = block - 2;
    }
    const info = {
        cidr: `${formatV4(networkInteger)}/${prefix}`,
        network: formatV4(networkInteger),
        broadcast: formatV4(broadcastInteger),
        netmask: formatV4(maskInteger),
        wildcard: formatV4(MAX - 1 - maskInteger),
        prefix,
        first_host: formatV4(firstHost),
        last_host: formatV4(lastHost),
        addresses: block,
        usable_hosts: usable,
        network_integer: networkInteger,
        broadcast_integer: broadcastInteger,
        network_class: classifyV4(networkInteger),
        host_class: classifyV4(ip.integer),
    };
    if (note !== undefined)
        info.note = note;
    return info;
}
/** Merge a list of integer ranges into maximal contiguous runs. */
export function mergeRanges(ranges) {
    const sorted = [...ranges].sort((a, b) => a[0] - b[0]);
    const merged = [];
    for (const [start, end] of sorted) {
        const last = merged[merged.length - 1];
        if (last !== undefined && start <= last[1] + 1) {
            if (end > last[1])
                last[1] = end;
        }
        else {
            merged.push([start, end]);
        }
    }
    return merged;
}
/** Cover one contiguous integer range with the minimal CIDR list. */
export function rangeToCidrs(start, end) {
    const out = [];
    let cursor = start;
    while (cursor <= end) {
        for (let p = 32; p >= 0; p--) {
            const block = 2 ** p;
            if (cursor % block === 0 && cursor + block - 1 <= end) {
                out.push(`${formatV4(cursor)}/${32 - p}`);
                cursor += block;
                break;
            }
        }
    }
    return out;
}
/** Summarize parsed CIDR specs into the minimal covering CIDR list. */
export function summarizeSpecs(specs) {
    const ranges = specs.map((spec) => {
        const block = 2 ** (32 - spec.prefix);
        const start = spec.ip.integer - (spec.ip.integer % block);
        return [start, start + block - 1];
    });
    const out = [];
    for (const [start, end] of mergeRanges(ranges)) {
        out.push(...rangeToCidrs(start, end));
    }
    return out;
}
//# sourceMappingURL=ipv4.js.map