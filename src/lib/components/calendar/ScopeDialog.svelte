<script lang="ts">
import { fade } from "svelte/transition"
import type { Scope } from "#lib/calendar/types.ts"
import Modal from "#lib/components/ui/Modal.svelte"
import { m } from "#lib/paraglide/messages.js"

let {
  mode,
  scoped = true,
  inline = false,
  choose,
}: {
  mode: "edit" | "delete"
  scoped?: boolean
  inline?: boolean
  choose: (scope: Scope | null) => void
} = $props()

let open = $state(true)

const SCOPES: { id: Scope; label: () => string }[] = [
  { id: "one", label: m.calendar_scope_one },
  { id: "following", label: m.calendar_scope_following },
  { id: "all", label: m.calendar_scope_all },
]

const title = $derived(
  !scoped
    ? m.panel_delete_confirm()
    : mode === "edit"
      ? m.calendar_scope_edit()
      : m.calendar_scope_delete(),
)

let picked = $state<Scope | null>(null)

const pick = (scope: Scope | null) => {
  picked = scope
  open = false
}

$effect(() => {
  if (!open) {
    choose(picked)
  }
})
</script>

{#snippet body()}
  <div class="flex flex-col gap-1.5 p-4">
    <h3 class="px-1 pb-1.5 text-sm font-semibold">{title}</h3>
    {#if scoped}
      {#each SCOPES as scope (scope.id)}
        <button
          type="button"
          class={[
            "btn btn-sm btn-block justify-start btn-ghost bg-base-content/5",
            mode === "delete" && "text-error",
          ]}
          onclick={() => pick(scope.id)}
        >
          {scope.label()}
        </button>
      {/each}
    {:else}
      <button
        type="button"
        class="btn btn-error btn-sm btn-block"
        {@attach node => node.focus()}
        onclick={() => pick("one")}
      >
        {m.common_delete()}
      </button>
    {/if}
    <button
      type="button"
      class="btn btn-ghost btn-sm btn-block"
      onclick={() => pick(null)}
    >
      {m.common_cancel()}
    </button>
  </div>
{/snippet}

{#if inline}
  <div
    class={[
      "absolute inset-0 z-20 flex items-center justify-center p-4",
      "rounded-box bg-base-100/50 backdrop-blur-sm",
    ]}
    role="presentation"
    transition:fade|global={{ duration: 120 }}
    onpointerdown={e => {
      if (e.target === e.currentTarget) {
        pick(null)
      }
    }}
  >
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      class="popover-box w-full max-w-72"
    >
      {@render body()}
    </div>
  </div>
{:else}
  <Modal bind:open label={title} class="w-full max-w-xs">
    {@render body()}
  </Modal>
{/if}
