<script lang="ts">
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow"
import { getCurrentWindow } from "@tauri-apps/api/window"
import IconButton from "#lib/components/ui/IconButton.svelte"
import { type NavFrame, remoteHost, sendNav } from "#lib/p2p/float.svelte.ts"
import { adoptLocal, LOCAL } from "#lib/p2p/hosts.svelte.ts"
import { m } from "#lib/paraglide/messages.js"
import { keyOf } from "#lib/store/keys.ts"
import { nav } from "#lib/store/nav.svelte.ts"
import { panes } from "#lib/store/panes.svelte.ts"
import Sidebar from "./Sidebar.svelte"

const remote = remoteHost(LOCAL)

adoptLocal(remote.view)

const win = getCurrentWindow()

let pinned = $state(false)

let last = ""

const signature = (frame: NavFrame) =>
  `${frame.page}|${frame.current ? keyOf(frame.current) : ""}`

$effect(() => {
  remote.ready.then(() => remote.view.refresh()).catch(() => {})

  const stop = getCurrentWebviewWindow().listen<NavFrame>("float:nav", ({ payload }) => {
    last = signature(payload)
    nav.page = payload.page
    panes.open(payload.current)
  })

  return () => {
    remote.stop()
    stop.then(f => f())
  }
})

$effect(() => {
  const frame: NavFrame = {
    page: nav.page,
    current: $state.snapshot(panes.active.current),
    settings: null,
  }

  if (signature(frame) !== last) {
    last = signature(frame)
    sendNav(frame).catch(() => {})
  }
})

$effect(() => {
  if (nav.settingsOpen) {
    nav.settingsOpen = false
    sendNav({ page: nav.page, current: null, settings: nav.settingsTab }).catch(() => {})
  }
})
</script>

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
