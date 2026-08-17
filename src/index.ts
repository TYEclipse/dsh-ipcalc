/**
 * dsh-ipcalc — IP & subnet math toolbox for DeepSeek Harness.
 *
 * Three pure-math tools, zero runtime dependencies, no network I/O:
 *   ipv4_subnet     — full subnet layout (network/broadcast/mask/hosts/classes)
 *   ipv4_summarize  — minimal covering CIDR list for a set of addresses/ranges
 *   ip_parse        — validate, normalize (RFC 5952) and classify IPv4/IPv6
 *
 * All arithmetic is exact double math on 32-bit integers, so no bitwise
 * overflow can occur. /31 networks follow RFC 3021.
 *
 * @module dsh-ipcalc
 */

import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import z from '@deepseek-ai/schemastery'
import { buildIpcalcTools, type ToolSet } from './tools.ts'

/** Stable Cordis plugin name (also the config key under `plugins:`). */
export const name = 'dsh-ipcalc'

/** Services required before tool registration can start. */
export const inject = ['agents', 'tools']

/** Plugin configuration (reserved for future options; currently empty). */
export interface Config {}

export const Config: z<Config> = z.object({})

/** Register every ipcalc tool on one agent; returns the disposer. */
function decorate(agent: Agent, tools: ToolSet): () => void {
  const disposers = Object.values(tools).map((definition) => agent.ctx.tools.register(definition))
  return () => {
    for (const dispose of disposers) {
      try {
        dispose()
      } catch {
        // already disposed
      }
    }
  }
}

/** Mount the ipcalc tools on every live agent and every future one. */
export function apply(ctx: Context, _config: Config): void {
  const tools = buildIpcalcTools()
  const disposers = new Set<() => void>()

  const decorateAgent = (agent: Agent): void => {
    try {
      disposers.add(decorate(agent, tools))
    } catch (error) {
      ctx.logger('ipcalc').warn(`tool registration for agent ${agent.id} failed: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  for (const agent of ctx.agents.list()) decorateAgent(agent)
  const off = ctx.on('agent/created', ({ agent }) => decorateAgent(agent))

  ctx.effect(() => () => {
    off()
    for (const dispose of disposers) {
      try {
        dispose()
      } catch {
        // already disposed
      }
    }
    disposers.clear()
  })
}
