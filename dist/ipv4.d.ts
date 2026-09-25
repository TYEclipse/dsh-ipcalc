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
/** Summarize parsed CIDR specs into the minimal covering CIDR list. */
export declare function summarizeSpecs(specs: CidrSpec[]): string[];
//# sourceMappingURL=ipv4.d.ts.map