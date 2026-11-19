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
{#if prompt.interrupted || prompt.compacted}
  <p class="flex items-center gap-3 text-xs text-base-content/50">
    <span class="h-px flex-1 bg-base-content/15"></span>
    <Icon
      icon={prompt.compacted ? "lucide:archive" : "lucide:circle-stop"}
      class="size-3.5 shrink-0"
    />
    {prompt.compacted ? m.chat_compacted() : m.chat_interrupted()}
    <span class="h-px flex-1 bg-base-content/15"></span>
  </p>
{:else if prompt.text}
  <div data-turn={item.id} class={[BUBBLE, "scroll-mt-6 self-end"]}>
    {prompt.text}
  </div>
{/if}
