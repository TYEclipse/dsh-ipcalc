/**
 * dsh-ipcalc — pure IPv6 parsing, normalization (RFC 5952) and
 * classification. No network I/O; all logic is local string and
 * arithmetic math.
 *
 * @module dsh-ipcalc/ipv6
 */
import { parseV4 } from "./ipv4.js";
const HEXTET_RE = /^[0-9a-f]{1,4}$/;
const V6_MAX = (1n << 128n) - 1n;
function hex2(value) {
    return value.toString(16).padStart(4, '0');
}
/** Convert eight hextets to their 128-bit integer value (exact BigInt). */
export function v6ToBigInt(hextets) {
    let value = 0n;
    for (const hextet of hextets)
        value = (value << 16n) | BigInt(hextet);
    return value;
}
/** Convert a 128-bit BigInt back to eight hextets (index 0 = highest). */
export function bigIntToHextets(value) {
    const hextets = [];
    let cursor = value;
    for (let i = 7; i >= 0; i--) {
        hextets[i] = Number(cursor & 0xffffn);
        cursor >>= 16n;
    }
    return hextets;
}
/**
 * Parse an IPv6 CIDR string: "addr/prefix" with a numeric 0-128 prefix,
 * or a bare address treated as /128. Returns null when invalid.
 */
export function parseV6Cidr(text) {
    const trimmed = text.trim();
    if (trimmed === '')
        return null;
    let address = trimmed;
    let prefix = 128;
    if (trimmed.includes('/')) {
        const pieces = trimmed.split('/');
        if (pieces.length !== 2 || pieces[0] === '' || pieces[1] === '')
            return null;
        if (!/^[0-9]{1,3}$/.test(pieces[1]))
            return null;
        prefix = Number(pieces[1]);
        if (prefix > 128)
            return null;
        address = pieces[0];
    }
    const parsed = parseV6(address);
    if (parsed === null)
        return null;
    return { parsed, prefix };
}
/** First and last address values (128-bit) covered by an IPv6 CIDR. */
export function v6RangeOf(spec) {
    const address = v6ToBigInt(spec.parsed.hextets);
    const hostBits = 128n - BigInt(spec.prefix);
    const mask = hostBits === 0n ? V6_MAX : (V6_MAX << hostBits) & V6_MAX;
    const network = address & mask;
    const last = network | (V6_MAX >> BigInt(spec.prefix));
    return { network, last };
}
/**
 * Compute the complete subnet layout for an IPv6 CIDR. Address counts are
 * returned as decimal strings because they exceed Number.MAX_SAFE_INTEGER.
 * /127 follows RFC 6164 (both addresses usable on point-to-point links);
 * /128 is a single host.
 */
export function v6SubnetOf(spec) {
    const { prefix } = spec;
    const { network, last } = v6RangeOf(spec);
    const hostBits = 128n - BigInt(prefix);
    const addresses = 1n << hostBits;
    let firstHost;
    let lastHost;
    let usable;
    let note;
    if (prefix === 128) {
        firstHost = network;
        lastHost = network;
        usable = 1n;
        note = 'single host';
    }
    else if (prefix === 127) {
        firstHost = network;
        lastHost = last;
        usable = 2n;
        note = 'RFC 6164: both addresses are usable on point-to-point links';
    }
    else {
        firstHost = network + 1n;
        lastHost = last - 1n;
        usable = addresses - 2n;
    }
    const networkHextets = bigIntToHextets(network);
    const info = {
        cidr: `${normalizeV6(networkHextets)}/${prefix}`,
        network: normalizeV6(networkHextets),
        network_full: networkHextets.map(hex2).join(':'),
        last: normalizeV6(bigIntToHextets(last)),
        prefix,
        first_host: normalizeV6(bigIntToHextets(firstHost)),
        last_host: normalizeV6(bigIntToHextets(lastHost)),
        addresses: addresses.toString(),
        usable_hosts: usable.toString(),
        network_class: classifyV6(networkHextets),
    };
    if (note !== undefined)
        info.note = note;
    return info;
}
/** Find the longest run of zero hextets; leftmost wins ties. */
function bestZeroRun(hextets) {
    let bestStart = -1;
    let bestLen = 0;
    let i = 0;
    while (i < 8) {
        if (hextets[i] === 0) {
            let j = i;
            while (j < 8 && hextets[j] === 0)
                j++;
            const len = j - i;
            if (len > bestLen) {
                bestLen = len;
                bestStart = i;
            }
            i = j;
        }
        else {
            i++;
        }
    }
    return { start: bestStart, len: bestLen };
}
/** Render eight hextets in RFC 5952 canonical form. */
export function normalizeV6(hextets) {
    const pieces = hextets.map((h) => h.toString(16));
    const run = bestZeroRun(hextets);
    if (run.len < 2)
        return pieces.join(':');
    const left = pieces.slice(0, run.start).join(':');
    const right = pieces.slice(run.start + run.len).join(':');
    if (left === '')
        return `::${right}`;
    if (right === '')
        return `${left}::`;
    return `${left}::${right}`;
}
/**
 * Parse an IPv6 address text form: hex hextets with optional "::"
 * compression and an optional embedded dotted-quad IPv4 tail
 * (::ffff:a.b.c.d and ::a.b.c.d forms). Zone ids ("%eth0") are rejected.
 * Returns null when invalid.
 */
export function parseV6(text) {
    let body = text.trim().toLowerCase();
    if (body === '' || body.includes('%'))
        return null;
    let embedded;
    if (body.includes('.')) {
        const idx = body.lastIndexOf(':');
        if (idx === -1)
            return null;
        const v4 = parseV4(body.slice(idx + 1));
        if (v4 === null)
            return null;
        embedded = v4.text;
        const high = v4.octets[0] * 256 + v4.octets[1];
        const low = v4.octets[2] * 256 + v4.octets[3];
        body = `${body.slice(0, idx)}:${hex2(high)}:${hex2(low)}`;
    }
    const doubleColonCount = (body.match(/::/g) ?? []).length;
    if (doubleColonCount > 1 || body.includes(':::'))
        return null;
    const parts = body.split(':');
    const emptyCount = parts.filter((part) => part === '').length;
    const groups = [];
    for (const part of parts) {
        if (part === '')
            continue;
        if (!HEXTET_RE.test(part))
            return null;
        groups.push(parseInt(part, 16));
    }
    let hextets;
    if (emptyCount === 0) {
        if (groups.length !== 8)
            return null;
        hextets = groups;
    }
    else {
        if (!body.includes('::') || groups.length >= 8)
            return null;
        const fill = 8 - groups.length;
        if (fill <= 0)
            return null;
        if (emptyCount === 1) {
            const splitIndex = parts.indexOf('');
            const leftCount = parts.slice(0, splitIndex).filter((part) => part !== '').length;
            hextets = [
                ...groups.slice(0, leftCount),
                ...Array.from({ length: fill }, () => 0),
                ...groups.slice(leftCount),
            ];
        }
        else if (parts[0] === '' && parts[1] === '') {
            hextets = [...Array.from({ length: fill }, () => 0), ...groups];
        }
        else {
            hextets = [...groups, ...Array.from({ length: fill }, () => 0)];
        }
    }
    const tuple = hextets;
    const parsed = {
        hextets: tuple,
        normalized: normalizeV6(hextets),
        full: hextets.map(hex2).join(':'),
        hex128: hextets.map(hex2).join(''),
        class: classifyV6(hextets),
    };
    if (embedded !== undefined && (parsed.class === 'ipv4_mapped' || parsed.class === 'ipv4_compatible')) {
        parsed.embeddedIpv4 = embedded;
    }
    return parsed;
}
/** Classify eight hextets per the IANA IPv6 special-purpose registry. */
export function classifyV6(hextets) {
    const a = hextets[0];
    const b = hextets[1];
    if (hextets.every((hextet) => hextet === 0))
        return 'unspecified';
    const c = hextets[2];
    const d = hextets[3];
    const e = hextets[4];
    const f = hextets[5];
    const g = hextets[6];
    const h = hextets[7];
    if (a === 0 && b === 0 && c === 0 && d === 0 && e === 0 && f === 0 && g === 0 && h === 1)
        return 'loopback';
    if (a === 0 && b === 0 && c === 0 && d === 0 && e === 0 && f === 0xffff)
        return 'ipv4_mapped';
    if (a === 0 && b === 0 && c === 0 && d === 0 && e === 0 && f === 0)
        return 'ipv4_compatible';
    if (a === 0x2001 && b === 0x0db8)
        return 'documentation';
    if ((a & 0xffc0) === 0xfe80)
        return 'link_local';
    if ((a & 0xff00) === 0xff00)
        return 'multicast';
    if ((a & 0xfe00) === 0xfc00)
        return 'unique_local';
    return 'global';
}
//# sourceMappingURL=ipv6.js.map