/**
 * Tool definitions for dsh-ipcalc: eleven pure-math tools exposed to every
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
    ipv4_split: ToolDefinition;
    ipv4_allocate: ToolDefinition;
    ipv4_exclude: ToolDefinition;
    ipv4_range: ToolDefinition;
    ip_parse: ToolDefinition;
    ipv6_subnet: ToolDefinition;
    ipv6_summarize: ToolDefinition;
    ip_overlaps: ToolDefinition;
    ip_match: ToolDefinition;
}
/** Maximum number of subnets ipv4_split returns in one call. */
export declare const SPLIT_LIMIT = 256;
/** Number of subnet lines the ipv4_split renderer prints before eliding. */
export declare const SPLIT_RENDER_CAP = 12;
/** Number of allocation / exclusion lines the planning renderers print before eliding. */
export declare const PLAN_RENDER_CAP = 16;
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
/** The full output of ipv4_split (every key always present on success). */
export interface SplitResult {
    valid: boolean;
    input: string;
    cidr?: string;
    source_prefix?: number;
    new_prefix?: number;
    count?: number;
    addresses_each?: number;
    usable_each?: number;
    cidrs?: string[];
    first?: string;
    last?: string;
    note?: string;
    reason?: string;
}
/** The full output of ipv4_range (every key always present on success). */
export interface RangeResult {
    valid: boolean;
    start?: string;
    end?: string;
    cidrs?: string[];
    count?: number;
    addresses_covered?: number;
    note?: string;
    reason?: string;
}
/** One placed subnet of an ipv4_allocate plan. */
export interface AllocationEntry {
    request_index: number;
    requested_hosts: number;
    prefix: number;
    cidr: string;
    network: string;
    last: string;
    addresses: number;
    usable_hosts: number;
    wasted: number;
    note?: string;
}
/** The full output of ipv4_allocate (every key always present on success). */
export interface AllocateResult {
    valid: boolean;
    input: string;
    cidr?: string;
    order?: string;
    allocations?: AllocationEntry[];
    count?: number;
    placement?: number[];
    requested_hosts?: number;
    allocated_addresses?: number;
    allocated_usable?: number;
    parent_addresses?: number;
    wasted_addresses?: number;
    free_blocks?: string[];
    free_count?: number;
    free_addresses?: number;
    note?: string;
    reason?: string;
}
/** One exclusion entry of an ipv4_exclude run. */
export interface ExclusionEntry {
    input: string;
    cidr: string;
    addresses: number;
    removed: number;
    fully_inside: boolean;
}
/** The full output of ipv4_exclude (every key always present on success). */
export interface ExcludeResult {
    valid: boolean;
    input?: string;
    cidr?: string;
    excluded?: ExclusionEntry[];
    removed_addresses?: number;
    outside_addresses?: number;
    free?: string[];
    free_count?: number;
    free_addresses?: number;
    note?: string;
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
/** The full output of ipv6_summarize on success. */
export interface V6SummarizeResult {
    valid: boolean;
    cidrs?: string[];
    input_count?: number;
    output_count?: number;
    input_addresses?: string;
    addresses_covered?: string;
    overlapping_addresses?: string;
    note?: string;
    reason?: string;
}
/** One conflicting pair reported by ip_overlaps. */
export interface OverlapConflict {
    a: string;
    b: string;
    a_index: number;
    b_index: number;
    relation: 'duplicate' | 'a_contains_b' | 'b_contains_a';
    intersection: string;
    addresses: string;
}
/** The full output of ip_overlaps on success. */
export interface OverlapResult {
    valid: boolean;
    conflicts?: OverlapConflict[];
    conflict_count?: number;
    clean?: boolean;
    pair_count?: number;
    ipv4_count?: number;
    ipv6_count?: number;
    mixed_family_pairs?: number;
    note?: string;
    reason?: string;
}
/** Maximum entries accepted by ip_overlaps in one call. */
export declare const OVERLAP_LIMIT = 200;
/** Build the three ipcalc tool definitions. */
export declare function buildIpcalcTools(): ToolSet;
//# sourceMappingURL=tools.d.ts.map