<script lang="ts">
import Icon from "@iconify/svelte"
import type { ChatItem } from "#lib/acp/items.ts"
import { segmentsOf } from "#lib/chat/session.ts"
import { Attempt } from "#lib/components/ui/attempt.svelte.ts"
import ErrorAlert from "#lib/components/ui/ErrorAlert.svelte"
import Modal from "#lib/components/ui/Modal.svelte"
import type { HostView } from "#lib/p2p/hostView.svelte.ts"
import type { Subagent } from "#lib/p2p/protocol.ts"
import { m } from "#lib/paraglide/messages.js"
import Markdown from "./Markdown.svelte"
import ThoughtNote from "./ThoughtNote.svelte"
import ToolGroup from "./ToolGroup.svelte"
import UserPrompt from "./UserPrompt.svelte"

let {
  host,
  sessionId,
  agent,
  onclose,
}: {
  host: HostView
  sessionId: string
  agent: Subagent | null
  onclose: () => void
} = $props()

const POLL_MS = 2000

let items = $state<ChatItem[]>([])

let text = $state("")

const loading = new Attempt()

const sending = new Attempt()

const segments = $derived(segmentsOf(items))

const typing = $derived(host.elsewhere(sessionId))

$effect(() => {
  if (!agent) {
    return
  }

  const id = agent.id
  const pull = () =>
    loading.run(async () => {
      items = await host.readAgent(sessionId, id)
    })

  pull()

  const timer = setInterval(pull, POLL_MS)

  return () => {
    clearInterval(timer)
    items = []
  }
})

const send = () => {
  const message = text.trim()

  if (!agent || !message) {
    return
  }

  const { description } = agent

  text = ""
  sending.run(async () => {
    await host.messageAgent(sessionId, description, message)
  })
}
</script>

<Modal
  bind:open={() => agent !== null, open => !open && onclose()}
  label={agent?.description ?? m.chat_subagents()}
  class="flex max-h-dvh max-w-2xl flex-col"
>
  <header class="flex items-center gap-2 px-5 pt-4 pb-2">
    <Icon icon="lucide:bot" class="size-4 shrink-0 text-primary" />
    <h2 class="min-w-0 flex-1 truncate font-semibold">{agent?.description}</h2>
  </header>
  <div class="flex min-h-0 flex-1 flex-col-reverse overflow-y-auto px-5">
    <div class="flex flex-col gap-4 py-3">
      {#each segments as segment, i (segment.key)}
        {#if segment.kind === "activity"}
          <ToolGroup items={segment.items} latest={i === segments.length - 1} />
        {:else if segment.item.type === "user"}
          <UserPrompt item={segment.item} />
        {:else if segment.item.type === "agent"}
          <Markdown text={segment.item.text} />
        {:else if segment.item.type === "thought"}
          <ThoughtNote text={segment.item.text} />
        {/if}
      {/each}
    </div>
  </div>
  <ErrorAlert message={loading.failure ?? sending.failure} />
  {#if typing}
    <form
      class="flex items-end gap-2 px-5 pt-2 pb-4"
      onsubmit={e => {
        e.preventDefault()
        send()
      }}
    >
      <textarea
        bind:value={text}
        rows="1"
        class="textarea min-h-0 flex-1 resize-none"
        placeholder={m.chat_agent_message()}
        aria-label={m.chat_agent_message()}
        onkeydown={e => {
          if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
            e.preventDefault()
            send()
          }
        }}
      ></textarea>
      <button
        type="submit"
        class="btn btn-primary btn-circle btn-sm"
        aria-label={m.chat_send()}
        disabled={!text.trim() || sending.busy}
      >
        <Icon icon="lucide:arrow-up" class="size-4" />
      </button>
    </form>
  {/if}
</Modal>
