<script lang="ts">
import Icon from "@iconify/svelte"
import type { Block } from "#lib/chat/blocks.ts"
import EmptyState from "#lib/components/ui/EmptyState.svelte"
import IconButton from "#lib/components/ui/IconButton.svelte"
import MenuItem from "#lib/components/ui/MenuItem.svelte"
import { menuKeys } from "#lib/components/ui/menu.ts"
import Popover from "#lib/components/ui/Popover.svelte"
import { m } from "#lib/paraglide/messages.js"
import { baseName } from "#lib/path.ts"
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

let listing = $state(false)

const ICONS: Partial<Record<Block["type"], string>> = {
  file: "lucide:file",
  image: "lucide:image",
  html: "lucide:code-xml",
  table: "lucide:table",
  scene: "lucide:box",
}

const nameOf = (entry: Shown, i: number) => {
  const first = entry.blocks[0]

  if (first?.type === "file") {
    return first.title ?? baseName(first.path)
  }

  return (first && "title" in first && first.title) || m.side_item({ number: i + 1 })
}
</script>

<aside
  class={[
    "flex w-md max-w-1/2 min-w-0 shrink-0 flex-col border-l border-base-300",
    "max-lg:absolute max-lg:inset-0 max-lg:z-10 max-lg:w-auto max-lg:max-w-none max-lg:bg-base-100",
  ]}
  aria-label={m.shell_side_panel()}
>
  <header class="flex h-10 shrink-0 items-center gap-1 px-2">
    <Popover label={m.side_list()} placement="bottom-start" width="w-72" bind:open={listing}>
      {#snippet trigger(p)}
        <button
          {...p}
          type="button"
          class="btn btn-ghost btn-sm btn-square"
          aria-label={m.side_list()}
          title={m.side_list()}
          disabled={!entries.length}
        >
          <Icon icon="lucide:layers" class="size-4" />
        </button>
      {/snippet}
      <div role="menu" tabindex="-1" class="flex max-h-80 flex-col overflow-y-auto" {@attach menuKeys}>
        {#each entries as entry, i (entry.id)}
          <MenuItem
            icon={ICONS[entry.blocks[0]?.type] ?? "lucide:panel-right"}
            label={nameOf(entry, i)}
            onclick={() => {
              listing = false
              index = i === entries.length - 1 ? null : i
            }}
          />
        {/each}
      </div>
    </Popover>
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
