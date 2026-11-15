<script lang="ts">
import { useComposer } from "#lib/chat/composer.svelte.ts"
import IconButton from "#lib/components/ui/IconButton.svelte"
import { m } from "#lib/paraglide/messages.js"

const composer = useComposer()
</script>

<IconButton
  icon="lucide:paperclip"
  label={m.chat_attach()}
  size="md"
  class="size-full min-h-0"
  onclick={() => composer.picker?.click()}
/>
