<script lang="ts">
import { m } from "#lib/paraglide/messages.js"

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
    class="pointer-events-none col-start-1 row-start-1 flex size-full items-center justify-center p-8"
  >
    {#if image}
      <img
        src={image.url}
        alt={image.name}
        class="max-h-full max-w-full rounded-box object-contain shadow-xl"
      />
    {/if}
  </div>
  <form method="dialog" class="modal-backdrop">
    <button type="submit">{m.common_close()}</button>
  </form>
</dialog>
