<script lang="ts">
import Icon from "@iconify/svelte"
import { chats } from "#lib/chat/chats.svelte.ts"
import { paneComposers } from "#lib/chat/composer.svelte.ts"
import GroupChat from "#lib/components/chat/GroupChat.svelte"
import SessionChat from "#lib/components/chat/SessionChat.svelte"
import { Attempt } from "#lib/components/ui/attempt.svelte.ts"
import ErrorAlert from "#lib/components/ui/ErrorAlert.svelte"
import { hostById } from "#lib/p2p/hosts.svelte.ts"
import { m } from "#lib/paraglide/messages.js"
import { attention } from "#lib/store/attention.svelte.ts"
import { droppedConversation, isConversationDrag, startDrag } from "#lib/store/drag.ts"
import { keyOf } from "#lib/store/keys.ts"
import {
  type Leaf,
  panes,
  providePane,
  type Side,
} from "#lib/store/panes.svelte.ts"
import { describe } from "#lib/store/recent.ts"
import { markRead } from "#lib/store/unread.svelte.ts"
import Start from "./Start.svelte"

type Zone = Side | "center"

const EDGE = 0.25

let { leaf }: { leaf: Leaf } = $props()

providePane(() => leaf.id)

let zone = $state<Zone | null>(null)

const current = $derived(leaf.current)

const stored = $derived(current?.kind === "chat" ? chats.find(current.id) : null)

const host = $derived(current?.kind === "session" ? hostById(current.host) : null)

const info = $derived(describe(current))

const opening = new Attempt()

$effect(() => {
  if (current) {
    markRead(keyOf(current))
  }
})

let observed = ""

$effect(() => {
  if (!host || current?.kind !== "session" || !attention.active) {
    return
  }

  const turn = host.state?.turns?.[current.id]
  const mark = `${current.id}:${turn?.turn}`

  if (observed === mark) {
    return
  }

  observed = mark

  if (turn && turn.turn > turn.seen) {
    host.seen(current.id, turn.turn).catch(() => {})
  }
})

$effect(() => {
  if (host && current?.kind === "session" && !host.views[current.id]) {
    const id = current.id

    opening.run(() => host.open(id))
  }
})

const split = $derived(panes.leaves.length > 1)

const focused = $derived(panes.focused === leaf.id)

const zoneOf = (e: DragEvent & { currentTarget: HTMLElement }): Zone => {
  const rect = e.currentTarget.getBoundingClientRect()
  const x = (e.clientX - rect.left) / rect.width
  const y = (e.clientY - rect.top) / rect.height
  const edges: [Side, number][] = [
    ["left", x],
    ["right", 1 - x],
    ["top", y],
    ["bottom", 1 - y],
  ]
  const [side, distance] = edges.toSorted((p, q) => p[1] - q[1])[0]

  return distance < EDGE && panes.canSplit(leaf.id, side) ? side : "center"
}

const focusInput = (e: PointerEvent) => {
  const target = e.target instanceof Element ? e.target : null

  if (
    !split ||
    !panes.shared ||
    !document.getSelection()?.isCollapsed ||
    target?.closest("a, button, input, textarea, select, [contenteditable], summary, [role=button]")
  ) {
    return
  }

  requestAnimationFrame(() => panes.inputSlot?.querySelector("textarea")?.focus())
}

const PANE_MIME = "application/x-atrix-pane"

const grab = (e: DragEvent) => {
  if (current) {
    startDrag(e, current)
    e.dataTransfer?.setData(PANE_MIME, leaf.id)
  }
}

const hasFiles = (e: DragEvent) => !!e.dataTransfer?.types.includes("Files")

const over = (e: DragEvent & { currentTarget: HTMLElement }) => {
  if (hasFiles(e) && paneComposers.has(leaf.id)) {
    e.preventDefault()
    zone = "center"

    return
  }

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

  if (hasFiles(e)) {
    e.preventDefault()
    paneComposers.get(leaf.id)?.add(e.dataTransfer?.files ?? [])

    return
  }

  if (!dropped || !target) {
    return
  }

  e.preventDefault()

  const source = e.dataTransfer?.getData(PANE_MIME)

  if (source === leaf.id) {
    return
  }

  if (source && target === "center") {
    panes.open(current, source)
    panes.open(dropped, leaf.id)
  } else if (target === "center") {
    panes.open(dropped, leaf.id)
  } else if (panes.split(leaf.id, target, dropped) && source) {
    panes.close(source)
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
  class={[
    "relative flex min-h-0 min-w-0 flex-1 flex-col",
    split && [
      "overflow-hidden border transition-colors duration-140",
      focused ? "border-primary/40" : "border-transparent",
    ],
  ]}
  aria-label={info?.title ?? m.chat_new()}
  data-find-root={focused || undefined}
  data-pane={leaf.id}
  onpointerdowncapture={() => panes.focus(leaf.id)}
  onpointerup={focusInput}
  ondragover={over}
  ondragleave={e => {
    if (!(e.relatedTarget instanceof Node && e.currentTarget.contains(e.relatedTarget))) {
      zone = null
    }
  }}
  ondrop={drop}
>
  {#if split}
    <header
      class={[
        "flex h-7 shrink-0 cursor-grab items-center gap-2 px-3 active:cursor-grabbing",
        "text-xs font-semibold transition-colors duration-140",
        focused ? "bg-primary/8 text-primary" : "bg-base-content/4 text-base-content/55",
      ]}
      role="toolbar"
      tabindex="-1"
      aria-label={info?.title ?? m.chat_new()}
      draggable={!!current}
      ondragstart={grab}
    >
      <Icon icon={info?.icon ?? "lucide:square-pen"} class="size-4 shrink-0 opacity-70" />
      <span class="min-w-0 flex-1 truncate">{info?.title ?? m.chat_new()}</span>
    </header>
  {/if}

  {#if stored}
    {#await import("#lib/components/chat/ModelChat.svelte") then { default: ModelChat }}
      {#key stored.id}
        <ModelChat {stored} />
      {/key}
    {/await}
  {:else if opening.failure}
    <div class="grid flex-1 place-items-center p-6">
      <ErrorAlert message={opening.failure} />
    </div>
  {:else if host && current?.kind === "session"}
    <SessionChat {host} sessionId={current.id} />
  {:else if current?.kind === "group"}
    <GroupChat id={current.id} />
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

