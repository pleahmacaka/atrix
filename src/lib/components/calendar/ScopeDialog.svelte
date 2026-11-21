<script lang="ts">
import type { Scope } from "#lib/calendar/recurrence.ts"
import Modal from "#lib/components/ui/Modal.svelte"
import { m } from "#lib/paraglide/messages.js"

let {
  mode,
  choose,
}: {
  mode: "edit" | "delete"
  choose: (scope: Scope | null) => void
} = $props()

let open = $state(true)

const SCOPES: { id: Scope; label: () => string }[] = [
  { id: "one", label: m.calendar_scope_one },
  { id: "following", label: m.calendar_scope_following },
  { id: "all", label: m.calendar_scope_all },
]

const title = $derived(
  mode === "edit" ? m.calendar_scope_edit() : m.calendar_scope_delete(),
)

let picked: Scope | null = null

$effect(() => {
  if (!open) {
    choose(picked)
  }
})
</script>

<Modal bind:open label={title} class="w-full max-w-xs">
  <div class="flex flex-col gap-1.5 p-4">
    <h3 class="px-1 pb-1.5 text-sm font-semibold">{title}</h3>
    {#each SCOPES as scope (scope.id)}
      <button
        type="button"
        class={[
          "btn btn-sm btn-block justify-start btn-ghost bg-base-content/5",
          mode === "delete" && "text-error",
        ]}
        onclick={() => {
          picked = scope.id
          open = false
        }}
      >
        {scope.label()}
      </button>
    {/each}
    <button
      type="button"
      class="btn btn-ghost btn-sm btn-block"
      onclick={() => (open = false)}
    >
      {m.common_cancel()}
    </button>
  </div>
</Modal>
