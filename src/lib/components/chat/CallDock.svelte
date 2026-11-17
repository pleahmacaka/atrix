<script lang="ts">
import { untrack } from "svelte"
import { hostById } from "#lib/p2p/hosts.svelte.ts"
import { desktop } from "#lib/platform.ts"
import { openConversation } from "#lib/store/nav.svelte.ts"
import { panes } from "#lib/store/panes.svelte.ts"
import { bubble, type CallSync, callState, folded, palette, replyOf } from "#lib/voice/call.svelte.ts"
import { CHAT_HOST, chatViewOf } from "#lib/voice/chatCall.ts"
import { conversation } from "#lib/voice/conversation.svelte.ts"
import { mirrorCall } from "#lib/voice/overlay.svelte.ts"
import { voice } from "#lib/voice/voice.svelte.ts"
import CallBubble from "./CallBubble.svelte"

const host = $derived(conversation.host ? hostById(conversation.host) : undefined)

const view = $derived(
  !conversation.owner
    ? undefined
    : conversation.host === CHAT_HOST
      ? chatViewOf(conversation.owner)
      : host?.views[conversation.owner],
)

const call = $derived(callState(view?.running ?? false, view?.items ?? []))

let was = false

$effect(() => {
  const now = view?.running ?? false
  const items = view?.items ?? []

  untrack(() => {
    if (!conversation.owner) {
      return
    }

    if (now) {
      conversation.replied()
      voice.stopSpeaking()
    } else if (was) {
      conversation.replied()

      if (items.at(-1)?.type === "agent") {
        voice.speak(replyOf(items))
      }
    }
  })

  was = now
})

const open = () => {
  const owner = conversation.owner
  const hostId = conversation.host

  if (!owner || !hostId) {
    return
  }

  if (hostId === CHAT_HOST) {
    openConversation({ kind: "chat", id: owner })

    return
  }

  const leaf = panes.leaves.find(
    l => l.current?.kind === "session" && l.current.id === owner,
  )

  if (leaf) {
    panes.focus(leaf.id)
    openConversation(leaf.current)
  } else {
    openConversation({ kind: "session", host: hostId, id: owner })
  }
}

const toggleMute = () => conversation.setMuted(!conversation.muted)

let box = $state<HTMLElement>()

let grab = { left: 0, top: 0, width: 0, height: 0 }

const spot = $derived(bubble.get("app") ?? { x: 1, y: 1 })

const clamp = (n: number) => Math.min(1, Math.max(0, n))

const dragStart = () => {
  const rect = box?.getBoundingClientRect()

  if (rect) {
    grab = rect
  }
}

const drag = (dx: number, dy: number) => {
  bubble.set("app", {
    x: clamp((grab.left + dx) / (innerWidth - grab.width)),
    y: clamp((grab.top + dy) / (innerHeight - grab.height)),
  })
}

const collapsed = $derived(folded.get("bubble"))

const toggle = () => folded.set("bubble", !collapsed)

const payload = (): CallSync => ({
  call,
  collapsed,
  theme: palette.dark ? "atrix-dark" : "atrix-light",
  ink: palette.ink,
})

if (desktop) {
  mirrorCall(payload, { mute: toggleMute, end: conversation.end, open, toggle })
}
</script>

{#if conversation.owner && conversation.shown === 0}
  <div
    bind:this={box}
    class="fixed z-40"
    style:left="{spot.x * 100}%"
    style:top="{spot.y * 100}%"
    style:translate="-{spot.x * 100}% -{spot.y * 100}%"
  >
    <div class="p-4">
      <CallBubble
        {call}
        {collapsed}
        onToggle={toggle}
        onOpen={open}
        onMute={toggleMute}
        onEnd={conversation.end}
        onDragStart={dragStart}
        onDrag={drag}
      />
    </div>
  </div>
{/if}
