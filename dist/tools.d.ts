/**
 * Tool definitions for dsh-ipcalc: three pure-math tools exposed to every
 * agent via defineTool. Each tool has a strict JSON-schema parameter
 * surface and a compact text renderer. No network I/O happens anywhere.
 *
 * @module dsh-ipcalc/tools
 */
import { type ToolDefinition } from '@deepseek-ai/dsh-tools';
import { type V4Class } from './ipv4.ts';
import { type V6Class } from './ipv6.ts';
export interface ToolSet {
    ipv4_subnet: ToolDefinition;
    ipv4_summarize: ToolDefinition;
    ip_parse: ToolDefinition;
    ipv6_subnet: ToolDefinition;
    ip_match: ToolDefinition;
}
/** The full output of ipv4_subnet on success (every key always present). */
export interface SubnetResult {
    valid: boolean;
    input: string;
    cidr?: string;
    network?: string;
    broadcast?: string;
    netmask?: string;
    wildcard?: string;
    prefix?: number;
    first_host?: string;
    last_host?: string;
    addresses?: number;
    usable_hosts?: number;
    network_integer?: number;
    broadcast_integer?: number;
    network_class?: V4Class;
    host_class?: V4Class;
    note?: string;
    reason?: string;
}
/** The full output of ipv4_summarize (every key always present). */
export interface SummarizeResult {
    valid: boolean;
    cidrs?: string[];
    input_count?: number;
    output_count?: number;
    addresses_covered?: number;
    reason?: string;
}
/** The full output of ip_parse (only relevant keys are set per branch). */
export interface IpParseResult {
    valid: boolean;
    input: string;
    version?: 4 | 6;
    normalized?: string;
    full?: string;
    class?: V4Class | V6Class;
    octets?: number[];
    integer?: number;
    hextets?: number[];
    hex128?: string;
    embedded_ipv4?: string;
    reason?: string;
}
/** The full output of ipv6_subnet on success. */
export interface V6SubnetResult {
    valid: boolean;
    input: string;
    cidr?: string;
    network?: string;
    network_full?: string;
    last?: string;
    prefix?: number;
    first_host?: string;
    last_host?: string;
    addresses?: string;
    usable_hosts?: string;
    network_class?: V6Class;
    note?: string;
    reason?: string;
}
/** The full output of ip_match (only relevant keys are set per branch). */
export interface IpMatchResult {
    valid: boolean;
    in_subnet?: boolean;
    ip?: string;
    ip_version?: 4 | 6;
    cidr?: string;
    cidr_version?: 4 | 6;
    network?: string;
    last?: string;
    reason?: string;
}
/** Build the three ipcalc tool definitions. */
export declare function buildIpcalcTools(): ToolSet;
//# sourceMappingURL=tools.d.ts.map