/**
 * dsh-ipcalc — pure IPv6 parsing, normalization (RFC 5952) and
 * classification. No network I/O; all logic is local string and
 * arithmetic math.
 *
 * @module dsh-ipcalc/ipv6
 */
/** IPv6 address classes (subset of the IANA IPv6 special-purpose registry). */
export type V6Class = 'unspecified' | 'loopback' | 'ipv4_mapped' | 'ipv4_compatible' | 'documentation' | 'link_local' | 'multicast' | 'unique_local' | 'global';
/** A parsed IPv6 address: eight 16-bit hextets plus renderings. */
export interface ParsedV6 {
    hextets: [number, number, number, number, number, number, number, number];
    normalized: string;
    full: string;
    hex128: string;
    class: V6Class;
    embeddedIpv4?: string;
}
/** Convert eight hextets to their 128-bit integer value (exact BigInt). */
export declare function v6ToBigInt(hextets: number[]): bigint;
/** Convert a 128-bit BigInt back to eight hextets (index 0 = highest). */
export declare function bigIntToHextets(value: bigint): number[];
/** A parsed IPv6 CIDR: address plus prefix length. */
export interface V6CidrSpec {
    parsed: ParsedV6;
    prefix: number;
}
/**
 * Parse an IPv6 CIDR string: "addr/prefix" with a numeric 0-128 prefix,
 * or a bare address treated as /128. Returns null when invalid.
 */
export declare function parseV6Cidr(text: string): V6CidrSpec | null;
/** First and last address values (128-bit) covered by an IPv6 CIDR. */
export declare function v6RangeOf(spec: V6CidrSpec): {
    network: bigint;
    last: bigint;
};
/** Full IPv6 subnet details for a parsed CIDR. */
export interface V6SubnetInfo {
    cidr: string;
    network: string;
    network_full: string;
    last: string;
    prefix: number;
    first_host: string;
    last_host: string;
    addresses: string;
    usable_hosts: string;
    network_class: V6Class;
    note?: string;
}
/**
 * Compute the complete subnet layout for an IPv6 CIDR. Address counts are
 * returned as decimal strings because they exceed Number.MAX_SAFE_INTEGER.
 * /127 follows RFC 6164 (both addresses usable on point-to-point links);
 * /128 is a single host.
 */
export declare function v6SubnetOf(spec: V6CidrSpec): V6SubnetInfo;
/** Render eight hextets in RFC 5952 canonical form. */
export declare function normalizeV6(hextets: number[]): string;
/**
 * Parse an IPv6 address text form: hex hextets with optional "::"
 * compression and an optional embedded dotted-quad IPv4 tail
 * (::ffff:a.b.c.d and ::a.b.c.d forms). Zone ids ("%eth0") are rejected.
 * Returns null when invalid.
 */
export declare function parseV6(text: string): ParsedV6 | null;
/** Classify eight hextets per the IANA IPv6 special-purpose registry. */
export declare function classifyV6(hextets: number[]): V6Class;
//# sourceMappingURL=ipv6.d.ts.map