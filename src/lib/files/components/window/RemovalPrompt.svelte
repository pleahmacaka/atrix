<script lang="ts">
  import { m } from "#lib/paraglide/messages.js"
  import { answerRemoval, removal } from "../../store/removal.svelte"
  import ConfirmDialog from "./ConfirmDialog.svelte"

  const open = () => removal.names !== null

  // ConfirmDialog clears `open` before calling onconfirm, so a dismissal waits a tick for the confirm to land first
  const dismiss = (next: boolean) => {
    const asked = removal.names

    if (!next && asked !== null) {
      queueMicrotask(() => {
        if (removal.names === asked) {
          answerRemoval(false)
        }
      })
    }
  }
</script>

<ConfirmDialog
  bind:open={open, dismiss}
  title={m.files_remove_place_title()}
  body={m.files_remove_place_body({ name: removal.names?.join(", ") ?? "" })}
  action={m.files_remove_place_action()}
  onconfirm={() => answerRemoval(true)}
/>
