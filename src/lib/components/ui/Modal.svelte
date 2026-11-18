<script lang="ts">
import type { Snippet } from "svelte"
import type { ClassValue } from "svelte/elements"
import { m } from "#lib/paraglide/messages.js"

let {
  open = $bindable(false),
  label,
  class: box,
  children,
}: {
  open?: boolean
  label: string
  class?: ClassValue
  children: Snippet
} = $props()

let dialog = $state<HTMLDialogElement>()

$effect(() => {
  if (open && dialog && !dialog.open) {
    dialog.showModal()
    dialog.focus()
  } else if (!open && dialog?.open) {
    dialog.close()
  }
})
</script>

<dialog
  bind:this={dialog}
  class="modal outline-none backdrop-blur-sm"
  tabindex="-1"
  aria-label={label}
  onclose={() => {
    open = false
  }}
>
  <div class={["modal-box flex flex-col p-0", box]}>
    {#if open}
      {@render children()}
    {/if}
  </div>
  <form method="dialog" class="modal-backdrop">
    <button type="submit" class="cursor-pointer" aria-label={m.common_close()}></button>
  </form>
</dialog>
