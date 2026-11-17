<script lang="ts">
import type { Block } from "#lib/chat/blocks.ts"
import EmptyState from "#lib/components/ui/EmptyState.svelte"
import IconButton from "#lib/components/ui/IconButton.svelte"
import { m } from "#lib/paraglide/messages.js"
import UiBlocks from "./UiBlocks.svelte"

export type Shown = { id: string; blocks: Block[] }

let {
  entries,
  onAction,
  onSave,
}: {
  entries: Shown[]
  onAction: (text: string) => void
  onSave: (blocks: Block[]) => Promise<unknown>
} = $props()

let index = $state<number | null>(null)

const at = $derived(
  index === null ? entries.length - 1 : Math.min(index, entries.length - 1),
)

const current = $derived(entries[at])
</script>

<aside
  class="flex w-md max-w-1/2 min-w-0 shrink-0 flex-col border-l border-base-300 max-lg:hidden"
  aria-label={m.shell_side_panel()}
>
  <header class="flex h-10 shrink-0 items-center gap-1 px-2">
    <IconButton
      icon="lucide:chevron-left"
      label={m.side_previous()}
      disabled={at <= 0}
      onclick={() => {
        index = at - 1
      }}
    />
    <span class="min-w-0 flex-1 text-center text-xs text-base-content/55 tabular-nums">
      {entries.length ? m.side_position({ at: at + 1, total: entries.length }) : ""}
    </span>
    <IconButton
      icon="lucide:chevron-right"
      label={m.side_next()}
      disabled={at >= entries.length - 1}
      onclick={() => {
        index = at + 1 >= entries.length - 1 ? null : at + 1
      }}
    />
  </header>
  <div class="min-h-0 flex-1 overflow-y-auto px-3 pb-3">
    {#if current}
      {#key current.id}
        <UiBlocks blocks={current.blocks} {onAction} {onSave} />
      {/key}
    {:else}
      <EmptyState icon="lucide:panel-right" text={m.side_empty()} class="py-10" />
    {/if}
  </div>
</aside>
