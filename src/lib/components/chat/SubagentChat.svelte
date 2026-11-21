<script lang="ts">
import Icon from "@iconify/svelte"
import type { ChatItem } from "#lib/acp/items.ts"
import { segmentsOf } from "#lib/chat/session.ts"
import { Attempt } from "#lib/components/ui/attempt.svelte.ts"
import ErrorAlert from "#lib/components/ui/ErrorAlert.svelte"
import type { HostView } from "#lib/p2p/hostView.svelte.ts"
import { m } from "#lib/paraglide/messages.js"
import Composer from "./Composer.svelte"
import Markdown from "./Markdown.svelte"
import ThoughtNote from "./ThoughtNote.svelte"
import ToolGroup from "./ToolGroup.svelte"
import UserPrompt from "./UserPrompt.svelte"

let {
  host,
  sessionId,
  agent,
  onback,
}: {
  host: HostView
  sessionId: string
  agent: { id: string; description: string }
  onback: () => void
} = $props()

const POLL_MS = 2000

let items = $state<ChatItem[]>([])

const loading = new Attempt()

const sending = new Attempt()

const segments = $derived(segmentsOf(items))

const typing = $derived(host.elsewhere(sessionId))

const parent = $derived(host.views[sessionId]?.title ?? "")

$effect(() => {
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

const send = (text: string) =>
  sending.run(async () => {
    await host.messageAgent(sessionId, agent.description, text)
  })
</script>

<div class="flex min-h-0 flex-1 flex-col">
  <div class="flex min-w-0 items-center gap-2 px-3 py-1.5">
    <button type="button" class="btn btn-ghost btn-sm min-w-0 gap-1.5 font-normal" onclick={onback}>
      <Icon icon="lucide:arrow-left" class="size-4 shrink-0" />
      <span class="min-w-0 truncate">{parent || m.chat_agent_back()}</span>
    </button>
  </div>
  <div class="scroll-stable flex min-h-0 flex-1 flex-col-reverse overflow-y-auto">
    <div class="content-zoom chat-column relative mx-auto flex w-full flex-col gap-4 px-3 pt-2 pb-2">
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
      <ErrorAlert message={loading.failure ?? sending.failure} />
    </div>
  </div>
  {#if typing}
    <Composer
      draft={`${sessionId}#${agent.id}`}
      placeholder={m.chat_agent_message()}
      busy={sending.busy}
      onSend={send}
      onStop={() => {}}
    />
  {/if}
</div>
