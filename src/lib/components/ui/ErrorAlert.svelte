<script lang="ts">
import { m } from "#lib/paraglide/messages.js"
import IconButton from "./IconButton.svelte"

let { message }: { message: string | null } = $props()

let dismissed = $state<string | null>(null)

$effect(() => {
  if (!message) {
    dismissed = null
  }
})
</script>

{#if message && message !== dismissed}
  <div role="alert" class="alert alert-error alert-soft mt-2 flex items-start text-sm">
    <span class="min-w-0 flex-1 break-words">{message}</span>
    <IconButton
      icon="lucide:x"
      label={m.common_close()}
      size="xs"
      class="shrink-0"
      onclick={() => {
        dismissed = message
      }}
    />
  </div>
{/if}
