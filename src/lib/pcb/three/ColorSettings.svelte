<script lang="ts">
import Icon from "@iconify/svelte"
import IconButton from "#lib/components/ui/IconButton.svelte"
import { m } from "#lib/paraglide/messages.js"
import type { Copper, Pcb } from "../types.ts"
import { type ColorKind, palette } from "./palette.svelte.ts"

let {
  pcb,
  copper,
  open = $bindable(false),
}: { pcb: Pcb; copper: Copper | null; open?: boolean } = $props()

let dialog = $state<HTMLDialogElement>()

let kind = $state<ColorKind>("net")

let query = $state("")

const nets = $derived(
  [
    ...new Set([
      ...Object.keys(copper?.nets ?? {}),
      ...pcb.footprints.flatMap(f => f.nets ?? []),
    ]),
  ].toSorted((a, b) => a.localeCompare(b)),
)

const parts = $derived(
  pcb.footprints.map(f => f.ref).toSorted((a, b) => a.localeCompare(b)),
)

const items = $derived(
  (kind === "net" ? nets : parts).filter(name =>
    name.toLowerCase().includes(query.trim().toLowerCase()),
  ),
)

const customCount = $derived(Object.keys(palette.overrides).length)

$effect(() => {
  if (open) {
    dialog?.showModal()
  } else {
    dialog?.close()
  }
})
</script>

<dialog
  bind:this={dialog}
  class="modal"
  aria-labelledby="pcb-colors-title"
  onclose={() => (open = false)}
>
  <div class="modal-box flex max-w-md flex-col gap-4">
    <div class="flex items-center gap-2">
      <h3 id="pcb-colors-title" class="font-semibold">{m.pcb_3d_colors()}</h3>
      <button
        type="button"
        class="btn btn-ghost btn-sm ml-auto"
        disabled={customCount === 0}
        onclick={palette.resetAll}
      >
        {m.pcb_3d_reset_all()}
      </button>
      <IconButton
        icon="lucide:x"
        label={m.pcb_3d_close()}
        onclick={() => (open = false)}
      />
    </div>

    <div role="tablist" class="tabs tabs-box tabs-sm">
      <button
        type="button"
        role="tab"
        class={["tab", kind === "net" && "tab-active"]}
        aria-selected={kind === "net"}
        onclick={() => (kind = "net")}
      >
        {m.pcb_3d_tab_nets({ count: nets.length })}
      </button>
      <button
        type="button"
        role="tab"
        class={["tab", kind === "part" && "tab-active"]}
        aria-selected={kind === "part"}
        onclick={() => (kind = "part")}
      >
        {m.pcb_3d_tab_parts({ count: parts.length })}
      </button>
    </div>

    <div class="input input-sm w-full">
      <Icon icon="lucide:search" class="size-4 opacity-60" />
      <input type="search" placeholder={m.pcb_3d_search()} aria-label={m.pcb_3d_search()} bind:value={query} />
    </div>

    <ul class="min-h-0 flex-1 overflow-y-auto">
      {#each items as name (name)}
        <li class="flex h-8 items-center gap-2 rounded-field px-2 hover:bg-inset">
          <input
            type="color"
            class="size-6 shrink-0 cursor-pointer rounded-field border-0 bg-transparent p-0"
            aria-label={m.pcb_3d_color_of({ name })}
            value={palette.of(kind, name)}
            onchange={e => palette.set(kind, name, e.currentTarget.value)}
          />
          <span class="min-w-0 flex-1 truncate text-sm">{name}</span>
          {#if palette.custom(kind, name)}
            <IconButton
              icon="lucide:rotate-ccw"
              label={m.pcb_3d_default_color_of({ name })}
              title={m.pcb_3d_default_color()}
              size="xs"
              onclick={() => palette.reset(kind, name)}
            />
          {/if}
        </li>
      {:else}
        <li class="flex flex-col items-center gap-3 py-12 text-sm text-base-content/60">
          <Icon icon="lucide:search-x" class="size-8" />
          {m.pcb_3d_no_results()}
        </li>
      {/each}
    </ul>
  </div>
  <form method="dialog" class="modal-backdrop">
    <button type="submit" aria-label={m.pcb_3d_close()}>{m.pcb_3d_close()}</button>
  </form>
</dialog>
