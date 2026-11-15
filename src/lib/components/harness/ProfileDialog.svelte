<script lang="ts">
import { Attempt } from "#lib/components/ui/attempt.svelte.ts"
import ErrorAlert from "#lib/components/ui/ErrorAlert.svelte"
import type { HostView } from "#lib/p2p/hostView.svelte.ts"
import type { HarnessInfo } from "#lib/p2p/protocol.ts"
import { m } from "#lib/paraglide/messages.js"

let {
  open,
  host,
  harness,
  onCreated,
  onClose,
}: {
  open: boolean
  host: HostView
  harness: HarnessInfo
  onCreated: (id: string, skipped: string[]) => void
  onClose: () => void
} = $props()

const attempt = new Attempt()

let dialog = $state<HTMLDialogElement>()

let name = $state("")

let fork = $state(true)

$effect(() => {
  if (open) {
    name = ""
    fork = true
    attempt.failure = null
    dialog?.showModal()
  } else {
    dialog?.close()
  }
})

const submit = () =>
  attempt.run(async () => {
    const { harness: created, skipped } = await host.createProfile(
      harness.id,
      name,
      fork,
    )

    onCreated(created.id, skipped)
    onClose()
  })
</script>

<dialog bind:this={dialog} class="modal" onclose={onClose}>
  <form
    class="modal-box flex flex-col gap-4"
    onsubmit={e => {
      e.preventDefault()
      submit()
    }}
  >
    <h2 class="text-lg font-semibold">{m.harness_new_profile()}</h2>
    <label class="flex flex-col gap-1">
      <span class="text-sm">{m.profile_name()}</span>
      <input class="input input-sm w-full" bind:value={name} required />
    </label>
    <fieldset class="flex flex-col gap-2">
      <legend class="mb-1 text-sm">{m.profile_start()}</legend>
      <label class="flex cursor-pointer items-center gap-3 text-sm">
        <input
          type="radio"
          class="radio radio-sm"
          value={true}
          bind:group={fork}
        />
        {m.profile_fork()}
      </label>
      <label class="flex cursor-pointer items-center gap-3 text-sm">
        <input
          type="radio"
          class="radio radio-sm"
          value={false}
          bind:group={fork}
        />
        {m.profile_empty()}
      </label>
    </fieldset>
    <ErrorAlert message={attempt.failure} />
    <div class="modal-action mt-0">
      <button type="button" class="btn btn-ghost btn-sm" onclick={onClose}>
        {m.common_cancel()}
      </button>
      <button
        type="submit"
        class="btn btn-primary btn-sm"
        disabled={attempt.busy || !name.trim()}
      >
        {#if attempt.busy}
          <span class="loading loading-spinner loading-xs"></span>
        {/if}
        {m.common_create()}
      </button>
    </div>
  </form>
</dialog>
