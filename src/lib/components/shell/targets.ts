import { agents, providerOf } from "#lib/agents/agents.svelte.ts"
import { brandIcon } from "#lib/components/harness/brands.ts"
import type { HostEntry } from "#lib/p2p/hosts.svelte.ts"
import { m } from "#lib/paraglide/messages.js"
import { activeGateways } from "#lib/store/gatewayCatalog.ts"
import { gatewayIcon } from "#lib/store/gateways.svelte.ts"

export const GATEWAY = "gateway"

export const AGENT = "agent"

export type TargetOption = {
  key: string
  icon: string
  label: string
  group: string
  badge?: { icon: string; label: string }
}

export const gatewayKey = (id: string) => `${GATEWAY}\n${id}`

export const agentKey = (id: string) => `${AGENT}\n${id}`

export const harnessKey = (host: string, harness: string) =>
  `${host}\n${harness}`

const agentTargets = (): TargetOption[] =>
  agents.list.flatMap(agent => {
    const provider = providerOf(agent)

    return provider
      ? [
          {
            key: agentKey(agent.id),
            icon: provider.icon,
            label: agent.name,
            group: m.agents_pick_title(),
            badge: {
              icon: "lucide:contact-round",
              label: m.agents_pick_title(),
            },
          },
        ]
      : []
  })

export const targetsOf = (hosts: HostEntry[]): TargetOption[] => [
  ...agentTargets(),
  ...activeGateways().map(g => ({
    key: gatewayKey(g.id),
    icon: gatewayIcon(g),
    label: g.name,
    group: "",
    badge: { icon: "lucide:plug", label: m.target_api() },
  })),
  ...hosts.flatMap(host =>
    (host.view.state?.harnesses ?? [])
      .filter(h => h.enabled)
      .map(h => ({
        key: harnessKey(host.id, h.id),
        icon: brandIcon(h.base),
        label: h.name,
        group: host.name,
      })),
  ),
]
