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