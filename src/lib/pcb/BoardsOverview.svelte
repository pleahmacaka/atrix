<script module lang="ts">
import type { Outputs } from "./derived.ts"

export type BoardEntry = { key: string; label: string; outputs: Outputs }
</script>

<script lang="ts">
import { createQuery } from "@tanstack/svelte-query"
import { m } from "#lib/paraglide/messages.js"
import BomTable from "./bom/BomTable.svelte"
import { mergeBoms } from "./bom/bom.ts"
import { derivedHrefs, loadDerived } from "./derived.ts"
import { type BomLine, DERIVED, type Pcb } from "./types.ts"

let {
  boards,
  title,
  onselect,
}: {
  boards: BoardEntry[]
  title: string
  onselect: (key: string) => void
} = $props()

const COVER = DERIVED.render("iso-top.png")

const summary = createQuery(() => ({
  queryKey: ["projects", "boards", ...boards.map(b => b.outputs.manifest.source.sha256)],
  queryFn: () =>
    Promise.all(
      boards.map(async ({ key, label, outputs }) => {
        const [pcb, lines, [cover]] = await Promise.all([
          loadDerived<Pcb>(outputs, DERIVED.pcb),
          loadDerived<BomLine[]>(outputs, DERIVED.bom),
          derivedHrefs(outputs, [COVER]),
        ])

        return { key, label, pcb, lines: lines ?? [], cover }
      }),
    ),
  staleTime: Number.POSITIVE_INFINITY,
}))

const sizeOf = (pcb: Pcb | null) => {
  if (!pcb) {
    return null
  }

  const { min, max } = pcb.dims.board

  return `${(max[0] - min[0]).toFixed(1)} × ${(max[1] - min[1]).toFixed(1)} mm`
}

const merged = $derived(mergeBoms(summary.data ?? []))
</script>

<div class="flex size-full min-h-0 flex-col">
  <ul class="grid shrink-0 grid-cols-2 gap-2 border-b border-base-300 p-2 @5xl:grid-cols-4">
    {#each summary.data ?? [] as board (board.key)}
      <li>
        <button
          type="button"
          class="flex w-full flex-col gap-1 rounded-box border border-base-300 p-2 text-left hover:bg-base-200"
          onclick={() => onselect(board.key)}
        >
          {#if board.cover}
            <img src={board.cover} alt={board.label} class="aspect-video w-full rounded-field object-contain" />
          {:else}
            <div class="aspect-video w-full rounded-field bg-base-200"></div>
          {/if}
          <span class="truncate text-sm font-medium">{board.label}</span>
          <span class="text-xs text-base-content/60 tabular-nums">
            {[sizeOf(board.pcb), m.pcb_3d_part_count({ count: board.lines.reduce((n, l) => n + l.refs.length, 0) })]
              .filter(Boolean)
              .join(", ")}
          </span>
        </button>
      </li>
    {:else}
      {#each boards as board (board.key)}
        <li
          class="flex flex-col gap-1 rounded-box border border-base-300 p-2"
          aria-busy="true"
        >
          <div class="skeleton aspect-video w-full rounded-field"></div>
          <div class="skeleton h-4 w-2/3"></div>
          <div class="skeleton h-3 w-1/2"></div>
        </li>
      {/each}
    {/each}
  </ul>
  <div class="relative min-h-0 flex-1">
    <div class="absolute inset-0">
      <BomTable lines={merged} title={m.pcb_3d_overall({ title })} />
    </div>
  </div>
</div>
