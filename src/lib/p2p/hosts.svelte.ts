import { m } from "#lib/paraglide/messages.js"
import { desktop } from "#lib/platform.ts"
import { settings } from "#lib/store/settings.svelte.ts"
import { HostView } from "./hostView.svelte.ts"
import { sync } from "./sync.svelte.ts"

export const LOCAL = "local"

export type HostEntry = { id: string; name: string; view: HostView }

const registry = $state<{ local: HostView | null }>({ local: null })

export const startLocalHost = async () => {
  if (!desktop || registry.local) {
    return
  }

  const { Host } = await import("#lib/acp/host.ts")
  const host = new Host()
  const view = new HostView(LOCAL, host.handle)

  host.subscribe(view.apply)
  sync.serve(host)
  registry.local = view
  await view.refresh()
}

export const hostList = (): HostEntry[] => [
  ...(registry.local
    ? [
        {
          id: LOCAL,
          name: m.shell_this_device({ name: settings.deviceName }),
          view: registry.local,
        },
      ]
    : []),
  ...[...sync.hosts].map(([id, view]) => ({
    id,
    name: sync.peers.get(id)?.name ?? m.shell_device(),
    view,
  })),
]

export const hostById = (id: string) => hostList().find(h => h.id === id)?.view
