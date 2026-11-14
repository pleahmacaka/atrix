<script lang="ts">
import { toFilePart } from "#lib/chat/attachments.ts"
import { chatFor, gatewayOf } from "#lib/chat/live.svelte.ts"
import { m } from "#lib/paraglide/messages.js"
import { local, type StoredChat } from "#lib/store/local.svelte.ts"
import Composer from "./Composer.svelte"
import ModelInput from "./ModelInput.svelte"
import ModelMessage from "./ModelMessage.svelte"

let { stored }: { stored: StoredChat } = $props()

const chat = $derived(chatFor(stored))

const busy = $derived(chat.status === "submitted" || chat.status === "streaming")

const connected = $derived(!!gatewayOf(stored))

let failure = $state<string | null>(null)

const send = async (text: string, files: File[]) => {
  failure = null

  try {
    await chat.sendMessage({
      text,
      files: await Promise.all(files.map(toFilePart)),
    })
  } catch (e) {
    failure = e instanceof Error ? e.message : String(e)
  }
}
</script>

<div class="flex min-h-0 flex-1 flex-col">
  <div class="scroll-centered flex min-h-0 flex-1 flex-col-reverse overflow-y-auto">
    <div class="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-6">
      {#each chat.messages as message (message.id)}
        <ModelMessage {message} onAction={text => send(text, [])} />
      {/each}
      {#if chat.status === "submitted"}
        <span class="loading loading-dots loading-sm opacity-60"></span>
      {/if}
      {#if failure}
        <div role="alert" class="alert alert-error alert-soft text-sm">
          {failure}
        </div>
      {/if}
      {#if chat.error}
        <div role="alert" class="alert alert-error alert-soft text-sm">
          {chat.error.message}
        </div>
      {/if}
    </div>
  </div>
  <Composer
    {busy}
    disabled={!connected}
    placeholder={connected
      ? m.chat_placeholder()
      : m.chat_connect_gateway()}
    onSend={send}
    onStop={() => chat.stop()}
  >
    {#snippet tools()}
      <ModelInput
        gateway={stored.gateway ?? "openrouter"}
        bind:value={stored.model}
        onchange={() => local.save()}
      />
    {/snippet}
  </Composer>
</div>
