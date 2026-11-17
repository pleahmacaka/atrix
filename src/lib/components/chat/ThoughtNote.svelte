<script lang="ts">
import Icon from "@iconify/svelte"
import { m } from "#lib/paraglide/messages.js"
import Markdown from "./Markdown.svelte"

let { text }: { text: string } = $props()
</script>

{#if text.trim()}
  <section
    class="flex min-w-0 gap-2 border-l-2 border-base-content/10 ps-3 text-base-content/55"
    aria-label={m.chat_reasoning()}
  >
    <Icon icon="lucide:brain" class="mt-0.5 size-3.5 shrink-0" />
    <div class="min-w-0 flex-1 text-sm">
      <Markdown {text} />
    </div>
  </section>
{/if}
