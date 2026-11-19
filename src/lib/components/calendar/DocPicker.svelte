<script lang="ts">
import Icon from "@iconify/svelte"
import { on } from "svelte/events"
import MenuItem from "#lib/components/ui/MenuItem.svelte"
import { menuKeys } from "#lib/components/ui/menu.ts"
import Popover from "#lib/components/ui/Popover.svelte"
import SearchField from "#lib/components/ui/SearchField.svelte"
import { knowledgeHost } from "#lib/knowledge/host.ts"
import type { Entry } from "#lib/knowledge/store.ts"
import { m } from "#lib/paraglide/messages.js"

let { onpick }: { onpick: (entry: Entry) => void } = $props()

const LIMIT = 8

let open = $state(false)

let query = $state("")

const shown = $derived.by(() => {
  const needle = query.trim().toLowerCase()

  return (knowledgeHost()?.knowledge ?? [])
    .filter(e => e.meta.title.toLowerCase().includes(needle))
    .toSorted((a, b) => b.meta.updated_at.localeCompare(a.meta.updated_at))
    .slice(0, LIMIT)
})

const pick = (entry: Entry) => {
  open = false
  query = ""
  onpick(entry)
}
</script>

<Popover label={m.panel_cite()} placement="top-start" width="w-64" bind:open>
  {#snippet trigger(p)}
    <button {...p} type="button" class="btn btn-ghost btn-xs gap-1 bg-base-content/5">
      <Icon icon="lucide:file-plus" class="size-3" />
      {m.panel_cite()}
    </button>
  {/snippet}
  <div
    class="flex flex-col gap-1"
    {@attach node =>
      on(node, "keydown", e => {
        if (e.key === "Escape") {
          e.stopPropagation()
          open = false
        } else if (e.key === "Enter" && e.target instanceof HTMLInputElement) {
          e.preventDefault()

          if (shown[0]) {
            pick(shown[0])
          }
        }
      })}
  >
    <SearchField bind:value={query} label={m.panel_cite_search()} data-autofocus />
    <div role="menu" tabindex="-1" class="flex flex-col" {@attach menuKeys}>
      {#each shown as entry (entry.key)}
        <MenuItem icon="lucide:file-text" label={entry.meta.title} onclick={() => pick(entry)} />
      {:else}
        <p class="px-2 py-1.5 text-sm text-base-content/55">{m.panel_cite_empty()}</p>
      {/each}
    </div>
  </div>
</Popover>
