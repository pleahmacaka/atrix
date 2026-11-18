<script lang="ts">
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow"
import { getCurrentWindow } from "@tauri-apps/api/window"
import ContextMenu from "#lib/components/ui/ContextMenu.svelte"
import IconButton from "#lib/components/ui/IconButton.svelte"
import { logFailure } from "#lib/logging.ts"
import {
  askNav,
  eventsOf,
  type NavFrame,
  navSignature,
  navState,
  remoteHost,
  sendNav,
} from "#lib/p2p/float.svelte.ts"
import { adoptLocal, adoptRemotes, LOCAL } from "#lib/p2p/hosts.svelte.ts"
import { m } from "#lib/paraglide/messages.js"
import { handleContextMenu } from "#lib/store/contextMenu.svelte.ts"
import { nav } from "#lib/store/nav.svelte.ts"
import { panes } from "#lib/store/panes.svelte.ts"
import Sidebar from "./Sidebar.svelte"

type Remote = ReturnType<typeof remoteHost>

const remotes = new Map<string, Remote & { instance: string }>()

let adoptedKey = ""

const connect = (hosts: NavFrame["hosts"]) => {
  const wanted = new Set(hosts.map(h => h.id))
  const instances = new Map(hosts.map(h => [h.id, h.instance]))

  for (const [id, remote] of remotes) {
    if (!wanted.has(id) || instances.get(id) !== remote.instance) {
      remote.stop()
      remotes.delete(id)

      if (id === LOCAL) {
        adoptLocal(null)
      }
    }
  }

  for (const { id, instance } of hosts) {
    if (remotes.has(id)) {
      continue
    }

    const remote = { ...remoteHost(id, eventsOf(id)), instance }

    remotes.set(id, remote)
    remote.ready
      .then(() => remote.view.refresh())
      .catch(e => logFailure("float host refresh", e))

    if (id === LOCAL) {
      adoptLocal(remote.view)
    }
  }

  const entries = hosts.flatMap(({ id, name }) => {
    const remote = id === LOCAL ? undefined : remotes.get(id)

    return remote ? [{ id, name, view: remote.view }] : []
  })
  const key = JSON.stringify(entries.map(e => [e.id, e.name, e.view.instance]))

  if (key !== adoptedKey) {
    adoptedKey = key
    adoptRemotes(entries)
  }
}

const win = getCurrentWindow()

let pinned = $state(false)

let last = ""

let sent = 0

let origin = ""

const next = (frame: NavFrame): NavFrame => {
  sent += 1

  return { ...frame, seq: sent }
}

const send = (frame: NavFrame, retry = true) => {
  const numbered = next(frame)

  sendNav(numbered).catch(e => {
    logFailure("float nav", e)

    if (sent !== numbered.seq) {
      return
    }

    sent -= 1

    if (retry) {
      send(frame, false)
    } else {
      last = ""
    }
  })
}

let synced = $state(false)

const frameOf = (): NavFrame => ({ ...navState(), hosts: [] })

$effect(() => {
  const stop = getCurrentWebviewWindow().listen<NavFrame>("float:nav", ({ payload }) => {
    connect(payload.hosts)

    if (payload.origin !== origin) {
      origin = payload.origin
      sent = 0
    }

    if (payload.seq < sent) {
      return
    }

    last = navSignature(payload)
    synced = true
    nav.page = payload.page
    nav.agent = payload.agent
    nav.doc = payload.doc
    nav.table = payload.table
    nav.harness = payload.harness
    panes.open(payload.current)
  })

  stop.then(() => askNav()).catch(e => logFailure("float ask nav", e))

  return () => {
    stop.then(f => f())

    for (const remote of remotes.values()) {
      remote.stop()
    }

    remotes.clear()
    adoptLocal(null)
    adoptRemotes([])
  }
})

$effect(() => {
  const frame = frameOf()

  if (synced && navSignature(frame) !== last) {
    last = navSignature(frame)
    send(frame)
  }
})

$effect(() => {
  if (nav.settingsOpen) {
    nav.settingsOpen = false
    send({ ...frameOf(), settings: nav.settingsTab })
  }
})

$effect(() => {
  if (nav.palette) {
    nav.palette = false
    send({ ...frameOf(), palette: true })
  }
})
</script>

<svelte:window oncontextmenu={handleContextMenu} />

<div class="window-frame flex h-dvh flex-col bg-base-200" data-frame>
  <header class="flex h-9 shrink-0 items-center justify-end gap-1 px-1.5" data-tauri-drag-region>
    <IconButton
      icon={pinned ? "lucide:pin-off" : "lucide:pin"}
      label={pinned ? m.float_unpin() : m.float_pin()}
      aria-pressed={pinned}
      class={[pinned && "text-primary"]}
      onclick={async () => {
        await win.setAlwaysOnTop(!pinned)
        pinned = !pinned
      }}
    />
    <IconButton icon="lucide:panel-bottom-close" label={m.float_dock()} onclick={() => win.close()} />
  </header>
  <div class="flex min-h-0 flex-1 px-2 pb-2" data-shell>
    <Sidebar floated />
  </div>
</div>

<ContextMenu />
