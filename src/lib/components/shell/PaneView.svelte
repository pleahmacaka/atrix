<script lang="ts">
import Icon from "@iconify/svelte"
import { chats } from "#lib/chat/chats.svelte.ts"
import SessionChat from "#lib/components/chat/SessionChat.svelte"
import { hostById } from "#lib/p2p/hosts.svelte.ts"
import { m } from "#lib/paraglide/messages.js"
import { droppedConversation, isConversationDrag } from "#lib/store/drag.ts"
import { keyOf } from "#lib/store/keys.ts"
import { type Leaf, panes, type Side } from "#lib/store/panes.svelte.ts"
import { describe } from "#lib/store/recent.ts"
import { markRead } from "#lib/store/unread.svelte.ts"
import Start from "./Start.svelte"

type Zone = Side | "center"

const EDGE = 0.25

let { leaf }: { leaf: Leaf } = $props()

let zone = $state<Zone | null>(null)

const current = $derived(leaf.current)

const stored = $derived(current?.kind === "chat" ? chats.find(current.id) : null)

const host = $derived(current?.kind === "session" ? hostById(current.host) : null)

const info = $derived(describe(current))

let failure = $state<string | null>(null)

$effect(() => {
  if (current) {
    markRead(keyOf(current))
  }
})

$effect(() => {
  if (host && current?.kind === "session" && !host.views[current.id]) {
    failure = null
    host.open(current.id).catch((e: unknown) => {
      failure = e instanceof Error ? e.message : String(e)
    })
  }
})

const split = $derived(panes.leaves.length > 1)

const focused = $derived(panes.focused === leaf.id)

const zoneOf = (e: DragEvent): Zone => {
  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
  const x = (e.clientX - rect.left) / rect.width
  const y = (e.clientY - rect.top) / rect.height
  const edges: [Side, number][] = [
    ["left", x],
    ["right", 1 - x],
    ["top", y],
    ["bottom", 1 - y],
  ]
  const [side, distance] = edges.toSorted((p, q) => p[1] - q[1])[0]

  return distance < EDGE ? side : "center"
}

const over = (e: DragEvent) => {
  if (!isConversationDrag(e)) {
    return
  }

  e.preventDefault()
  zone = zoneOf(e)
}

const drop = (e: DragEvent) => {
  const target = zone
  const dropped = droppedConversation(e)

  zone = null

  if (!dropped || !target) {
    return
  }

  e.preventDefault()

  if (target === "center") {
    panes.open(dropped, leaf.id)
  } else {
    panes.split(leaf.id, target, dropped)
  }
}

const HINTS: Record<Zone, string> = {
  left: "inset-y-2 left-2 w-1/2",
  right: "inset-y-2 right-2 w-1/2",
  top: "inset-x-2 top-2 h-1/2",
  bottom: "inset-x-2 bottom-2 h-1/2",
  center: "inset-2",
}
</script>

<section
  class="relative flex min-h-0 min-w-0 flex-1 flex-col"
  aria-label={info?.title ?? m.chat_new()}
  data-find-root={focused || undefined}
  onpointerdowncapture={() => panes.focus(leaf.id)}
  ondragover={over}
  ondragleave={e => {
    if (!(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node)) {
      zone = null
    }
  }}
  ondrop={drop}
>
  {#if split}
    <header
      class={[
        "flex h-9 shrink-0 items-center gap-2 border-b px-3 text-sm",
        focused
          ? "border-primary/50 bg-primary/8"
          : "border-base-300 text-base-content/60",
      ]}
    >
      <Icon icon={info?.icon ?? "lucide:square-pen"} class="size-4 shrink-0 opacity-70" />
      <span class="min-w-0 flex-1 truncate">{info?.title ?? m.chat_new()}</span>
      <button
        type="button"
        class="btn btn-ghost btn-xs btn-square"
        aria-label={m.shell_close_pane()}
        title="{m.shell_close_pane()} (Ctrl+W)"
        onclick={() => panes.close(leaf.id)}
      >
        <Icon icon="lucide:x" class="size-3.5" />
      </button>
    </header>
  {/if}

  {#if stored}
    {#await import("#lib/components/chat/ModelChat.svelte") then { default: ModelChat }}
      {#key stored.id}
        <ModelChat {stored} />
      {/key}
    {/await}
  {:else if failure}
    <div class="grid flex-1 place-items-center p-6">
      <div role="alert" class="alert alert-error alert-soft text-sm">
        <Icon icon="lucide:circle-alert" class="size-4" />
        {failure}
      </div>
    </div>
  {:else if host && current?.kind === "session"}
    <SessionChat {host} sessionId={current.id} />
  {:else}
    <Start />
  {/if}

  {#if zone}
    <div
      class={[
        "pointer-events-none absolute z-20 rounded-box border-2 border-primary",
        "bg-primary/15 transition-all",
        HINTS[zone],
      ]}
    ></div>
  {/if}
</section>
