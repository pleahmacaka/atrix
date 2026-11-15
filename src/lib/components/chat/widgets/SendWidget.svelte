<script lang="ts">
import Icon from "@iconify/svelte"
import { useComposer } from "#lib/chat/composer.svelte.ts"
import { m } from "#lib/paraglide/messages.js"

const composer = useComposer()
</script>

{#if composer.stoppable}
  <button
    type="button"
    class="btn btn-primary size-full min-h-0 rounded-full px-0"
    aria-label={m.chat_stop()}
    title={m.chat_stop()}
    onclick={composer.stop}
  >
    <Icon icon="lucide:square" class="size-3.5" />
  </button>
{:else}
  <button
    type="submit"
    class="btn btn-primary size-full min-h-0 rounded-full px-0"
    aria-label={m.chat_send()}
    title={composer.blocked ? m.chat_queue_files() : m.chat_send()}
    disabled={composer.empty || composer.blocked || composer.props.disabled}
  >
    <Icon icon="lucide:arrow-up" class="size-4" />
  </button>
{/if}
