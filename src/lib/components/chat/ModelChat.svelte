<script lang="ts">
import { untrack } from "svelte"
import { appTitleOf } from "#lib/apps/app.ts"
import { apps } from "#lib/apps/apps.svelte.ts"
import { toFilePart } from "#lib/chat/attachments.ts"
import { blocksOf } from "#lib/chat/blocks.ts"
import { chatFor, gatewayOf } from "#lib/chat/live.svelte.ts"
import { queues, shiftQueue } from "#lib/chat/queue.svelte.ts"
import { pinToggles, stickBottom } from "#lib/chat/scroll.ts"
import { Attempt } from "#lib/components/ui/attempt.svelte.ts"
import EmptyState from "#lib/components/ui/EmptyState.svelte"
import ErrorAlert from "#lib/components/ui/ErrorAlert.svelte"
import { m } from "#lib/paraglide/messages.js"
import { OPENROUTER_ID } from "#lib/store/gateways.svelte.ts"
import { local, type StoredChat } from "#lib/store/local.svelte.ts"
import { shell } from "#lib/store/shell.svelte.ts"
import { CHAT_HOST, chatView } from "#lib/voice/chatCall.ts"
import { conversation } from "#lib/voice/conversation.svelte.ts"
import Composer from "./Composer.svelte"
import ModelInput from "./ModelInput.svelte"
import ModelMessage from "./ModelMessage.svelte"
import SidePanel from "./SidePanel.svelte"
import VoiceConversation from "./VoiceConversation.svelte"

let { stored }: { stored: StoredChat } = $props()

const attempt = new Attempt()

const chat = $derived(chatFor(stored))

const busy = $derived(chat.status === "submitted" || chat.status === "streaming")

const connected = $derived(!!gatewayOf(stored))

const empty = $derived(chat.messages.length === 0 && !busy)

const failure = $derived(attempt.failure ?? chat.error?.message ?? null)

const send = (text: string, files: File[]) =>
  attempt.run(async () =>
    chat.sendMessage({
      text,
      files: await Promise.all(files.map(toFilePart)),
    }),
  )

const talking = $derived(conversation.owner === stored.id)

$effect(() => {
  if (!talking) {
    return
  }

  untrack(() => conversation.shown++)

  return () => {
    conversation.shown--
  }
})

$effect(() => {
  if (queues.get(stored.id).length > 0 && !busy) {
    untrack(() => {
      const next = shiftQueue(stored.id)

      if (next) {
        send(next.text, next.files)
      }
    })
  }
})
</script>

<div class="flex min-h-0 flex-1">
<div class="flex min-h-0 min-w-0 flex-1 flex-col">
  {#if talking && conversation.full}
    <VoiceConversation view={chatView(stored)} onPermit={() => {}} />
  {:else if empty && !failure}
    <EmptyState
      centered
      icon="lucide:message-square"
      title={m.chat_empty_title()}
      text={m.chat_empty_text()}
    />
  {:else}
    <div
      class="scroll-centered flex min-h-0 flex-1 flex-col-reverse overflow-y-auto"
      {@attach pinToggles}
      {@attach stickBottom}
    >
      <div class="mx-auto flex w-full max-w-2xl flex-col gap-6 px-8 py-6 text-sm">
        {#each chat.messages as message (message.id)}
          <ModelMessage {message} onAction={text => send(text, [])} />
        {/each}
        {#if chat.status === "submitted"}
          <span class="loading loading-dots loading-sm opacity-60"></span>
        {/if}
        <ErrorAlert message={failure} />
      </div>
    </div>
  {/if}
  <Composer
    {busy}
    draft={stored.id}
    converse={{ host: CHAT_HOST }}
    disabled={!connected}
    placeholder={connected ? m.chat_placeholder() : m.chat_connect_gateway()}
    onSend={send}
    onStop={() => chat.stop()}
  >
    {#snippet tools()}
      <ModelInput
        gateway={stored.gateway ?? OPENROUTER_ID}
        bind:value={stored.model}
        onchange={() => local.save()}
      />
    {/snippet}
  </Composer>
</div>
{#if shell.side}
  <SidePanel
    entries={chat.messages.flatMap(message =>
      message.parts.flatMap((part, i) => {
        const blocks = blocksOf(part)

        return blocks ? [{ id: `${message.id}:${i}`, blocks }] : []
      }),
    )}
    onAction={text => send(text, [])}
    onSave={blocks => apps.save(appTitleOf(blocks, ""), blocks)}
  />
{/if}
</div>
