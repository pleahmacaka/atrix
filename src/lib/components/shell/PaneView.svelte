<script lang="ts">
import Icon from "@iconify/svelte"
import { chats } from "#lib/chat/chats.svelte.ts"
import { paneComposers } from "#lib/chat/composer.svelte.ts"
import SessionChat from "#lib/components/chat/SessionChat.svelte"
import SubagentChat from "#lib/components/chat/SubagentChat.svelte"
import { Attempt, errorText } from "#lib/components/ui/attempt.svelte.ts"
import ErrorAlert from "#lib/components/ui/ErrorAlert.svelte"
import IconButton from "#lib/components/ui/IconButton.svelte"
import { floatChat, floating, floatOut } from "#lib/p2p/float.svelte.ts"
import { hostById } from "#lib/p2p/hosts.svelte.ts"
import { isGoneError } from "#lib/p2p/protocol.ts"
import { m } from "#lib/paraglide/messages.js"
import { desktop } from "#lib/platform.ts"
import { attention } from "#lib/store/attention.svelte.ts"
import { droppedConversation, isConversationDrag, isNewChatDrag } from "#lib/store/drag.ts"
import { keyOf } from "#lib/store/keys.ts"
import { type Leaf, panes, providePane } from "#lib/store/panes.svelte.ts"
import { describe } from "#lib/store/recent.ts"
import { withKeys } from "#lib/store/shortcuts.ts"
import { markRead } from "#lib/store/unread.svelte.ts"
import { draggedPane, grabPane, hasFiles, holds, type Zone, zoneOf } from "./paneDrag.ts"
import Start from "./Start.svelte"
import { useAction } from "./useAction.svelte.ts"

const ZONES: Record<Zone, string> = {
  left: "inset-y-2 left-2 w-1/2",
  right: "inset-y-2 right-2 w-1/2",
  top: "inset-x-2 top-2 h-1/2",
  bottom: "inset-x-2 bottom-2 h-1/2",
  center: "inset-2",
}

const UNTYPED =
  "a, button, input, textarea, select, [contenteditable], summary, [role=button]"

let { leaf }: { leaf: Leaf } = $props()

const pane = () => leaf.id

providePane(pane)

let box = $state<HTMLElement>()

let zone = $state<Zone | null>(null)

let observed = ""

const action = useAction(pane())

const current = $derived(leaf.current)

const session = $derived(current?.kind === "session" ? current : null)

const chat = $derived(current?.kind === "chat" ? current : null)

const stored = $derived(chat ? chats.find(chat.id) : null)

const host = $derived(session ? hostById(session.host) : undefined)

const info = $derived(describe(current))

const title = $derived(info?.title ?? m.chat_new())

const split = $derived(panes.leaves.length > 1)

const isFocused = $derived(panes.focused === leaf.id)

const opening = new Attempt()

$effect(() => {
  if (current) {
    markRead(keyOf(current))
  }
})

$effect(() => {
  if (!host || !session || !attention.active) {
    return
  }

  const turn = host.state?.turns?.[session.id]
  const mark = [session.id, turn?.turn].join(":")

  if (observed === mark) {
    return
  }

  observed = mark

  if (turn && turn.turn > turn.seen) {
    host.seen(session.id, turn.turn).catch(() => {})
  }
})

$effect(() => {
  if (!host || !session || host.views[session.id]) {
    return
  }

  const id = session.id

  opening.run(() =>
    host.open(id).catch((e: unknown) => {
      if (!isGoneError(e) && errorText(e) !== m.error_session_not_found()) {
        throw e
      }

      panes.open(null, leaf.id)
    }),
  )
})


const over = (e: DragEvent) => {
  if (hasFiles(e) && paneComposers.has(leaf.id)) {
    e.preventDefault()
    zone = "center"

    return
  }

  if (!isConversationDrag(e) && !isNewChatDrag(e)) {
    return
  }

  e.preventDefault()

  if (box) {
    zone = zoneOf(e, box, leaf.id)
  }
}

const leave = (e: DragEvent & { currentTarget: HTMLElement }) => {
  if (!(e.relatedTarget instanceof Node) || !holds(e.relatedTarget, e.currentTarget)) {
    zone = null
  }
}

const drop = (e: DragEvent) => {
  const at = zone
  const dropped = droppedConversation(e)

  zone = null

  if (at && isNewChatDrag(e)) {
    e.preventDefault()

    if (at === "center") {
      panes.open(null, leaf.id)
    } else {
      panes.split(leaf.id, at, null)
    }

    return
  }

  if (hasFiles(e)) {
    e.preventDefault()
    paneComposers.get(leaf.id)?.add(e.dataTransfer?.files ?? [])

    return
  }

  if (!dropped || !at) {
    return
  }

  e.preventDefault()

  const source = draggedPane(e)

  if (source === leaf.id) {
    return
  }

  if (source && at === "center") {
    panes.open(current, source)
    panes.open(dropped, leaf.id)
  } else if (at === "center") {
    panes.open(dropped, leaf.id)
  } else if (panes.split(leaf.id, at, dropped) && source) {
    panes.close(source)
  }
}

const focusInput = (e: PointerEvent) => {
  const hit = e.target instanceof Element ? e.target : null

  if (
    !split ||
    !panes.shared ||
    !document.getSelection()?.isCollapsed ||
    hit?.closest(UNTYPED)
  ) {
    return
  }

  requestAnimationFrame(() => panes.inputSlot?.querySelector("textarea")?.focus())
}
</script>

{#snippet floatButton()}
  {#if desktop && session && !floating.has(keyOf(session))}
    <IconButton
      icon="lucide:picture-in-picture-2"
      label={m.float_out()}
      size="xs"
      onclick={() => floatOut(session, title)}
    />
  {:else if desktop && chat && !floating.has(chat.id)}
    <IconButton
      icon="lucide:picture-in-picture-2"
      label={m.float_out()}
      size="xs"
      onclick={() => floatChat(chat.id, title)}
    />
  {/if}
{/snippet}

<section
  bind:this={box}
  class={[
    "group/pane relative flex min-h-0 min-w-0 flex-1 flex-col",
    split && [
      "overflow-hidden border transition-colors duration-140",
      isFocused ? "border-primary/40" : "border-transparent",
    ],
  ]}
  aria-label={title}
  data-find-root={isFocused || undefined}
  data-pane={leaf.id}
  onpointerdowncapture={() => panes.focus(leaf.id)}
  onpointerup={focusInput}
  ondragover={over}
  ondragleave={leave}
  ondrop={drop}
>
  {#if split}
    <header
      class={[
        "flex h-7 shrink-0 cursor-grab items-center gap-2 px-3 active:cursor-grabbing",
        "text-xs font-semibold transition-colors duration-140",
        isFocused ? "bg-primary/8 text-primary" : "bg-base-content/4 text-base-content/55",
      ]}
      role="toolbar"
      tabindex="-1"
      aria-label={title}
      draggable={!!current}
      ondragstart={e => grabPane(e, current, leaf.id)}
    >
      <Icon icon={info?.icon ?? "lucide:square-pen"} class="size-4 shrink-0 opacity-70" />
      <span class="min-w-0 flex-1 truncate">{title}</span>
      <div
        class={[
          "-me-2 flex shrink-0 items-center opacity-0 transition-opacity duration-140",
          "group-hover/pane:opacity-100 focus-within:opacity-100 pointer-coarse:opacity-100",
        ]}
      >
        {@render floatButton()}
        {#if current}
          <IconButton
            icon={action.sideIcon()}
            label={m.shell_side_panel()}
            aria-pressed={action.hasSide()}
            size="xs"
            onclick={action.toggleSide}
          />
        {/if}
        <IconButton
          icon="lucide:x"
          label={m.shell_close_pane()}
          title={withKeys(m.shell_close_pane(), "closePane")}
          size="xs"
          onclick={() => panes.close(leaf.id)}
        />
      </div>
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
  {:else if host && session?.agent}
    <SubagentChat
      {host}
      sessionId={session.id}
      agent={session.agent}
      onback={() => panes.open({ kind: "session", host: session.host, id: session.id }, leaf.id)}
    />
  {:else if host && session}
    <SessionChat {host} sessionId={session.id} />
  {:else}
    <Start />
  {/if}

  {#if zone}
    <div
      class={[
        "pointer-events-none absolute z-20 rounded-box border-2 border-primary bg-primary/15",
        ZONES[zone],
      ]}
    ></div>
  {/if}
</section>
