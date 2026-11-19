<script lang="ts">
  import { m } from "#lib/paraglide/messages.js"
  import { baseName } from "../../locations"
  import { answer, pending } from "../../store/privacy.svelte"
  import ConfirmDialog from "./ConfirmDialog.svelte"

  const open = () => pending.path !== null

  // ConfirmDialog clears `open` before calling onconfirm, so a dismissal waits a tick for the confirm to land first
  const dismiss = (next: boolean) => {
    const asked = pending.path

    if (!next && asked !== null) {
      queueMicrotask(() => {
        if (pending.path === asked) {
          answer(false)
        }
      })
    }
  }
</script>

<ConfirmDialog
  bind:open={open, dismiss}
  title={m.files_privacy_title()}
  body={m.files_privacy_body({ name: baseName(pending.path ?? "") })}
  action={m.files_privacy_open()}
  danger={false}
  onconfirm={() => answer(true)}
/>
