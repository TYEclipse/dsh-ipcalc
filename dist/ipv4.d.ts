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
/** A parsed IPv4 address with its canonical text form and 32-bit value. */
export interface ParsedV4 {
    octets: [number, number, number, number];
    integer: number;
    text: string;
}
/** IPv4 address classes per the IANA special-purpose registry. */
export type V4Class = 'unspecified' | 'broadcast' | 'loopback' | 'private' | 'cgnat' | 'link_local' | 'documentation' | 'multicast' | 'reserved' | 'global';
/** Build the 32-bit integer value of an IPv4 address. */
export declare function ip4(a: number, b: number, c: number, d: number): number;
/**
 * Parse a strict dotted-quad IPv4 address. Leading zeros, signs, extra
 * spaces and non-decimal input are rejected. Returns null when invalid.
 */
export declare function parseV4(text: string): ParsedV4 | null;
/** Format a 32-bit value as a dotted-quad IPv4 address. */
export declare function formatV4(integer: number): string;
/**
 * Convert a dotted netmask (e.g. 255.255.255.248) to a prefix length.
 * Only contiguous masks are accepted. Returns null when invalid.
 */
export declare function netmaskToPrefix(text: string): number | null;
/** A parsed CIDR: a host IPv4 address plus a prefix length. */
export interface CidrSpec {
    ip: ParsedV4;
    prefix: number;
}
/**
 * Parse an IPv4 CIDR string. Accepts "a.b.c.d/p" (numeric prefix),
 * "a.b.c.d/n.n.n.n" (dotted netmask) and a bare address (treated as /32).
 * Returns null when invalid.
 */
export declare function parseCidr(text: string): CidrSpec | null;
/** Classify an IPv4 integer value per the IANA special-purpose registry. */
export declare function classifyV4(integer: number): V4Class;
/** Full subnet details for a parsed CIDR. */
export interface SubnetInfo {
    cidr: string;
    network: string;
    broadcast: string;
    netmask: string;
    wildcard: string;
    prefix: number;
    first_host: string;
    last_host: string;
    addresses: number;
    usable_hosts: number;
    network_integer: number;
    broadcast_integer: number;
    network_class: V4Class;
    host_class: V4Class;
    note?: string;
}
/**
 * Compute the complete subnet layout for a CIDR spec.
 * /31 follows RFC 3021 (both addresses usable on point-to-point links);
 * /32 is a single host.
 */
export declare function subnetOf(spec: CidrSpec): SubnetInfo;
/** Usable host count for a prefix, honoring RFC 3021 (/31) and /32 hosts. */
export declare function usableHostsForPrefix(prefix: number): number;
/** Split a CIDR into the equal subnets of a longer prefix (network-aligned). */
export declare function splitSpec(spec: CidrSpec, newPrefix: number): string[];
/** Merge a list of integer ranges into maximal contiguous runs. */
export declare function mergeRanges(ranges: Array<[number, number]>): Array<[number, number]>;
/** Cover one contiguous integer range with the minimal CIDR list. */
export declare function rangeToCidrs(start: number, end: number): string[];
/** Usable host counts cannot exceed what a /0 offers (2^32 − 2). */
export declare const MAX_REQUEST_HOSTS: number;
/** Most per-call VLSM requests and pool exclusions accepted. */
export declare const PLAN_LIMIT = 64;
/**
 * Smallest prefix whose usable host capacity covers `hosts` hosts.
 *
 * Default behaviour (`pointToPoint: false`) stays at /30 or wider, because a
 * /31 or /32 is only appropriate on point-to-point links / single hosts.
 * With `pointToPoint: true` the RFC 3021 conventions apply: 1 host → /32,
 * 2 hosts → /31. Returns null when `hosts` is not a positive integer within
 * the IPv4 address space.
 */
export declare function prefixForHosts(hosts: number, pointToPoint: boolean): number | null;
/** One placed block: which request it serves and where it starts. */
export interface BlockPlacement {
    index: number;
    start: number;
    size: number;
}
/** The outcome of packing blocks into a parent range. */
export interface PackResult {
    placements: BlockPlacement[];
    free: Array<[number, number]>;
}
/**
 * Place power-of-two sized blocks inside `[base, base + parentSize − 1]`.
 *
 * Every block is aligned to its own size and blocks never overlap. `sizes[i]`
 * is the block size requested by request `i` of the input list; the returned
 * `index` is that request index, so the caller keeps input-order semantics.
 * `largestFirst` only decides *where* the blocks land, never *whether* they
 * fit: because every block is a power of two and no larger than the parent,
 * first-fit succeeds whenever the total fits, whichever order the requests
 * arrive in (the remaining free runs are always aligned well enough for the
 * next block). `test/oracle/anchors.py --check` verifies that property
 * exhaustively for bounded families. A null result therefore means one thing:
 * the requested blocks do not all fit in the parent.
 */
export declare function packBlocks(base: number, parentSize: number, sizes: number[], largestFirst: boolean): PackResult | null;
/**
 * Remove a set of integer ranges from `[start, end]`, returning the remaining
 * maximal ranges in ascending order. Cuts may overlap each other and may reach
 * outside the parent range; both are handled without special cases.
 */
export declare function subtractRanges(start: number, end: number, cuts: Array<[number, number]>): Array<[number, number]>;
/** Summarize parsed CIDR specs into the minimal covering CIDR list. */
export declare function summarizeSpecs(specs: CidrSpec[]): string[];
//# sourceMappingURL=ipv4.d.ts.map