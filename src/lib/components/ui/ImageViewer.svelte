<script lang="ts">
import { m } from "#lib/paraglide/messages.js"
import IconButton from "./IconButton.svelte"

export type Viewed = { url: string; name: string }

let { image = $bindable() }: { image: Viewed | null } = $props()

let dialog = $state<HTMLDialogElement>()

$effect(() => {
  if (image && !dialog?.open) {
    dialog?.showModal()
  }
})
</script>

<dialog
  bind:this={dialog}
  class="modal"
  onclose={() => {
    image = null
  }}
>
  <div
    class={[
      "modal-box flex max-h-screen max-w-5xl flex-col gap-4 p-4",
      "max-sm:size-full max-sm:max-h-none max-sm:max-w-none max-sm:rounded-none",
    ]}
  >
    <div class="flex items-center justify-between gap-2">
      <p class="min-w-0 truncate text-sm font-semibold" title={image?.name}>
        {image?.name}
      </p>
      <form method="dialog">
        <IconButton type="submit" icon="lucide:x" label={m.common_close()} />
      </form>
    </div>
    {#if image}
      <img
        src={image.url}
        alt={image.name}
        class="min-h-0 w-full flex-1 rounded-box object-contain"
      />
    {/if}
  </div>
  <form method="dialog" class="modal-backdrop">
    <button type="submit">{m.common_close()}</button>
  </form>
</dialog>
