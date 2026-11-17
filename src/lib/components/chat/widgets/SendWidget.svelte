<script lang="ts">
import Icon from "@iconify/svelte"
import { useComposer } from "#lib/chat/composer.svelte.ts"
import { m } from "#lib/paraglide/messages.js"
import { conversation } from "#lib/voice/conversation.svelte.ts"
import { voice } from "#lib/voice/voice.svelte.ts"

const composer = useComposer()

const round = "btn btn-sm btn-circle size-full min-h-0"
</script>

{#if composer.empty && composer.talking}
  <button
    type="button"
    class={[round, "btn-error"]}
    aria-label={m.voice_end()}
    title={m.voice_end()}
    onclick={conversation.end}
  >
    <Icon icon="lucide:phone-off" class="size-4" />
  </button>
{:else if composer.stoppable}
  <button
    type="button"
    class={[round, "btn-primary"]}
    aria-label={m.chat_stop()}
    title={m.chat_stop()}
    onclick={composer.stop}
  >
    <Icon icon="lucide:square" class="size-3" />
  </button>
{:else if composer.empty && composer.callable}
  <button
    type="button"
    class={[round, "btn-primary"]}
    aria-label={voice.ready ? m.voice_mode() : m.voice_setup()}
    title={voice.ready ? m.voice_mode() : m.voice_setup()}
    onclick={composer.call}
  >
    <Icon icon="lucide:audio-lines" class="size-4" />
  </button>
{:else}
  <button
    type="submit"
    class={[round, "btn-primary"]}
    aria-label={m.chat_send()}
    title={m.chat_send()}
    disabled={composer.empty || composer.props.disabled}
  >
    <Icon icon="lucide:arrow-up" class="size-4" />
  </button>
{/if}
