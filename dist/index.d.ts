/**
 * dsh-ipcalc — IP & subnet math toolbox for DeepSeek Harness.
 *
 * Five pure-math tools, zero runtime dependencies, no network I/O:
 *   ipv4_subnet     — full IPv4 subnet layout (network/broadcast/mask/hosts/classes)
 *   ipv4_summarize  — minimal covering CIDR list for a set of addresses/ranges
 *   ip_parse        — validate, normalize (RFC 5952) and classify IPv4/IPv6
 *   ipv6_subnet     — full IPv6 subnet layout (128-bit BigInt math, exact counts)
 *   ip_match        — membership test of a bare IP against an IPv4/IPv6 CIDR
 *
 * All IPv4 arithmetic is exact double math on 32-bit integers, so no bitwise
 * overflow can occur (/31 networks follow RFC 3021). All IPv6 subnet math
 * uses BigInt for exact 128-bit arithmetic (/127 follows RFC 6164); address
 * counts are returned as decimal strings because they exceed 2^53.
 *
 * @module dsh-ipcalc
 */
import type { Context } from '@deepseek-ai/cordis';
import z from '@deepseek-ai/schemastery';
/** Stable Cordis plugin name (also the config key under `plugins:`). */
export declare const name = "dsh-ipcalc";
/** Services required before tool registration can start. */
export declare const inject: string[];
/** Plugin configuration (reserved for future options; currently empty). */
export interface Config {
}
export declare const Config: z<Config>;
/** Mount the ipcalc tools on every live agent and every future one. */
export declare function apply(ctx: Context, _config: Config): void;
//# sourceMappingURL=index.d.ts.map