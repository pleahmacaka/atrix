<script lang="ts">
import Icon from "@iconify/svelte"
import type { TextItem } from "#lib/acp/items.ts"
import { promptOf } from "#lib/chat/session.ts"
import { m } from "#lib/paraglide/messages.js"
import Attachments from "./Attachments.svelte"
import { BUBBLE } from "./labels.ts"

let { item }: { item: TextItem } = $props()

const prompt = $derived(promptOf(item))
</script>

{#if prompt.files.length}
  <Attachments files={prompt.files} mine />
{/if}
{#if prompt.interrupted}
  <p class="flex items-center gap-2 self-center text-xs text-base-content/50">
    <Icon icon="lucide:circle-stop" class="size-3.5 shrink-0" />
    {m.chat_interrupted()}
  </p>
{:else if prompt.text}
  <div data-turn={item.id} class={[BUBBLE, "scroll-mt-6 self-end"]}>
    {prompt.text}
  </div>
{/if}
