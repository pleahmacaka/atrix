<script lang="ts">
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow"
import { getCurrentWindow } from "@tauri-apps/api/window"
import { chats } from "#lib/chat/chats.svelte.ts"
import ModelChat from "#lib/components/chat/ModelChat.svelte"
import SessionChat from "#lib/components/chat/SessionChat.svelte"
import FloatSidebar from "#lib/components/shell/FloatSidebar.svelte"
import Start from "#lib/components/shell/Start.svelte"
import { Attempt } from "#lib/components/ui/attempt.svelte.ts"
import ErrorAlert from "#lib/components/ui/ErrorAlert.svelte"
import IconButton from "#lib/components/ui/IconButton.svelte"
import { askNav, type HostEntry, RemoteChat, RemoteHosts, remoteHost } from "#lib/p2p/float.svelte.ts"
import { hostById, LOCAL } from "#lib/p2p/hosts.svelte.ts"
import { m } from "#lib/paraglide/messages.js"
import { panes } from "#lib/store/panes.svelte.ts"

const query = new URLSearchParams(location.search)

const sidebar = query.has("sidebar")

const fresh = query.has("new")

const hostId = query.get("host") ?? LOCAL

const sessionId = query.get("id") ?? ""

const chatId = query.get("chat")

const remote = sidebar || fresh ? null : remoteHost(hostId)

const remotes = fresh ? new RemoteHosts() : null

const started = $derived(fresh && panes.active.current?.kind === "session" ? panes.active.current : null)

const startedHost = $derived(started ? hostById(started.host) : undefined)

const host = remote?.view

const chat = chatId ? new RemoteChat(chatId) : null

const stored = $derived(chatId ? chats.find(chatId) : undefined)

const opening = new Attempt()

const title = $derived(
  stored?.title ??
    host?.views[sessionId]?.title ??
    (started ? startedHost?.views[started.id]?.title : null) ??
    (fresh ? m.chat_new() : ""),
)

if (chatId) {
  panes.open({ kind: "chat", id: chatId })
} else if (fresh) {
  panes.open(null)
} else if (!sidebar) {
  panes.open({ kind: "session", host: hostId, id: sessionId })
}

const win = getCurrentWindow()

let pinned = $state(false)

const pin = async () => {
  await win.setAlwaysOnTop(!pinned)
  pinned = !pinned
}

$effect(() => {
  if (!remotes) {
    return
  }

  const stop = getCurrentWebviewWindow().listen<HostEntry[]>("float:hosts", ({ payload }) =>
    remotes.connect(payload),
  )

  stop.then(() => askNav()).catch(() => {})

  return () => {
    stop.then(f => f())
    remotes.stop()
  }
})

$effect(() => {
  if (!remote) {
    return
  }

  opening.run(async () => {
    await remote.ready

    if (chat) {
      await chat.ready

      return
    }

    await remote.view.refresh()
    await remote.view.open(sessionId)
  })

  return () => {
    remote.stop()
    chat?.close()
  }
})
</script>

{#if sidebar}
  <FloatSidebar />
{:else}
<div class="window-frame flex h-dvh flex-col gap-2 bg-base-200 p-2" data-frame>
  <section class="island flex min-h-0 flex-1 flex-col overflow-hidden">
    <header
      class="flex h-10 shrink-0 items-center gap-2 ps-3 pe-1.5 select-none"
      data-tauri-drag-region
    >
      <span class="pointer-events-none min-w-0 flex-1 truncate text-sm">{title}</span>
      <IconButton
        icon={panes.hasSide() ? "lucide:panel-right-close" : "lucide:panel-right-open"}
        label={m.shell_side_panel()}
        aria-pressed={panes.hasSide()}
        onclick={() => panes.toggleSide()}
      />
      <IconButton
        icon={pinned ? "lucide:pin-off" : "lucide:pin"}
        label={pinned ? m.float_unpin() : m.float_pin()}
        aria-pressed={pinned}
        class={[pinned && "text-primary"]}
        onclick={pin}
      />
      <IconButton
        icon="lucide:panel-bottom-close"
        label={m.float_dock()}
        onclick={() => win.close()}
      />
    </header>
    {#if fresh}
      {#if started && startedHost?.views[started.id]}
        <SessionChat host={startedHost} sessionId={started.id} />
      {:else}
        <Start />
      {/if}
    {:else if chat && stored}
      <ModelChat {stored} remote={chat} />
    {:else if opening.failure}
      <div class="grid flex-1 place-items-center p-6">
        <ErrorAlert message={opening.failure} />
      </div>
    {:else if host?.views[sessionId]}
      <SessionChat {host} {sessionId} />
    {:else}
      <div class="grid flex-1 place-items-center">
        <span class="loading loading-spinner opacity-60"></span>
      </div>
    {/if}
  </section>
</div>
{/if}
