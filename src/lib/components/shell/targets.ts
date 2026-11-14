import { brandIcon } from "#lib/components/harness/brands.ts"
import type { HostEntry } from "#lib/p2p/hosts.svelte.ts"
import { activeGateways, GATEWAY_ICONS } from "#lib/store/gateways.svelte.ts"

export const GATEWAY = "gateway"

export type TargetOption = {
  key: string
  icon: string
  label: string
  group: string
}

export const gatewayKey = (id: string) => `${GATEWAY}\n${id}`

export const harnessKey = (host: string, harness: string) =>
  `${host}\n${harness}`

export const targetsOf = (hosts: HostEntry[]): TargetOption[] => [
  ...activeGateways().map(g => ({
    key: gatewayKey(g.id),
    icon: GATEWAY_ICONS[g.kind],
    label: g.name,
    group: "",
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
