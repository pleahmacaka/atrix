<script lang="ts">
import Modal from "#lib/components/ui/Modal.svelte"
import { m } from "#lib/paraglide/messages.js"

let {
  open = $bindable(false),
  title,
  body,
  action,
  danger = true,
  onconfirm,
}: {
  open?: boolean
  title: string
  body: string
  action: string
  danger?: boolean
  onconfirm: () => void
} = $props()

const confirm = () => {
  open = false
  onconfirm()
}
</script>

<Modal bind:open label={title} class="w-full max-w-sm">
  <div class="flex flex-col gap-2 p-5">
    <h3 class="text-sm font-semibold">{title}</h3>
    <p class="text-sm break-words text-base-content/70">{body}</p>
    <div class="mt-3 flex justify-end gap-2">
      <button
        type="button"
        class="btn btn-ghost btn-sm"
        onclick={() => (open = false)}
      >
        {m.common_cancel()}
      </button>
      <button
        type="button"
        class={["btn btn-sm", danger ? "btn-error" : "btn-primary"]}
        onclick={confirm}
      >
        {action}
      </button>
    </div>
  </div>
</Modal>
