<script lang="ts">
import Icon from "@iconify/svelte"
import { m } from "#lib/paraglide/messages.js"
import type { Outputs } from "../derived.ts"
import { saveFile } from "../save.ts"
import { TOOLBAR } from "../ToolChip.svelte"
import BoardThumb from "../three/BoardThumb.svelte"
import { groupOf, located, type Selection } from "../three/inspect.svelte.ts"
import type { BomLine } from "../types.ts"
import { rem } from "../units.ts"
import {
  type BomRow,
  bomCsv,
  COLUMNS,
  filterRows,
  lcscUrl,
  rowsOf,
  type SortKey,
  sortRows,
} from "./bom.ts"

let {
  lines,
  title,
  outputs,
  onlocate,
}: {
  lines: BomLine[]
  title: string
  outputs?: Outputs
  onlocate?: () => void
} = $props()

const PEEK = { width: 288, height: 240, gap: 8 }

let peek = $state<{ target: Selection; left: number; top: number } | null>(null)

let peeked = $state(false)

const show = (focus: Selection, target: EventTarget | null) => {
  if (!(target instanceof HTMLElement)) {
    return
  }

  const rect = target.getBoundingClientRect()
  const below = rect.bottom + PEEK.gap + PEEK.height <= innerHeight

  peeked = true
  peek = {
    target: focus,
    left: Math.min(
      Math.max(PEEK.gap, rect.left),
      innerWidth - PEEK.width - PEEK.gap,
    ),
    top: below
      ? rect.bottom + PEEK.gap
      : Math.max(PEEK.gap, rect.top - PEEK.gap - PEEK.height),
  }
}

const locate = (focus: Selection) => {
  located.target = focus
  peek = null
  onlocate?.()
}

let query = $state("")

let key = $state<SortKey>("item")

let ascending = $state(true)

let draft = $state("1")

const MAX_BOARDS = 9999

const clampBoards = (n: number) =>
  Number.isNaN(n) ? 1 : Math.min(MAX_BOARDS, Math.max(1, n))

const boards = $derived(clampBoards(Number.parseInt(draft, 10)))

const rows = $derived(
  rowsOf(lines).map(r => ({ ...r, qty: r.qty * boards })),
)

const total = $derived(rows.reduce((sum, r) => sum + r.qty, 0))

const shown = $derived(sortRows(filterRows(rows, query), key, ascending))

const count = (n: number) => n.toLocaleString("ko-KR")

const step = (by: number) => {
  draft = String(clampBoards(boards + by))
}

const name = $derived(title.trim() || m.pcb_bom_board())

const sortBy = (next: SortKey) => {
  ascending = key === next ? !ascending : true
  key = next
}

const CELL = "border-base-300 border-r border-b px-2 py-1"

const rowTarget = (row: BomRow) => groupOf(row.refs, row.part)

const download = () => saveFile(bomCsv(shown), `${name}-bom.csv`)
</script>

{#snippet lcsc(code: string)}
  {#if code}
    <a class="link link-hover" href={lcscUrl(code)} target="_blank" rel="noreferrer">{code}</a>
  {:else}
    {m.pcb_bom_consigned()}
  {/if}
{/snippet}

<div class="flex size-full min-h-0 flex-col">
  <div role="toolbar" aria-label={m.pcb_bom_toolbar()} class={TOOLBAR}>
    <label class="input input-sm min-w-0 flex-1 @2xl:w-56 @2xl:flex-none">
      <span class="sr-only">{m.pcb_bom_search()}</span>
      <Icon icon="lucide:search" class="size-4 opacity-60" />
      <input type="search" placeholder={m.pcb_bom_search_placeholder()} bind:value={query} />
    </label>
    <button type="button" class="btn btn-ghost btn-sm ml-auto" onclick={download}>
      <Icon icon="lucide:download" class="size-4" />
      CSV
    </button>
  </div>

  <div class="min-h-0 flex-1 overflow-auto">
    {#if shown.length === 0}
      <div class="text-base-content/60 flex flex-col items-center gap-3 py-12 text-sm">
        <Icon icon="lucide:search-x" class="size-8" />
        {m.pcb_bom_no_results()}
      </div>
    {:else}
      <div class="hidden w-max min-w-full @2xl:block">
        <table class="table table-xs table-pin-rows w-full border-separate border-spacing-0 text-sm whitespace-nowrap tabular-nums">
          <thead>
            <tr class="bg-base-200">
              {#each COLUMNS as c (c.key)}
                <th class="border-base-300 border-r border-b p-0 font-semibold">
                  <button
                    type="button"
                    class={[
                      "flex w-full cursor-pointer items-center gap-1 px-2 py-1",
                      c.key === "item" || c.key === "qty" ? "justify-end" : "justify-start",
                    ]}
                    onclick={() => sortBy(c.key)}
                  >
                    {c.label()}
                    <Icon
                      icon={key !== c.key ? "lucide:chevrons-up-down" : ascending ? "lucide:chevron-up" : "lucide:chevron-down"}
                      class={["size-3 shrink-0", key !== c.key && "opacity-30"]}
                    />
                  </button>
                </th>
              {/each}
            </tr>
          </thead>
          <tbody>
            {#each shown as row (row.item)}
              <tr
                class={["hover:bg-base-200", outputs && "cursor-pointer"]}
                onmouseenter={e => outputs && show(rowTarget(row), e.currentTarget)}
                onmouseleave={() => (peek = null)}
                onclick={() => outputs && locate(rowTarget(row))}
              >
                <td class={[CELL, "text-base-content/50 w-0 text-right"]}>{row.item}</td>
                <td class={[CELL, "max-w-xs truncate font-medium"]} title={row.part}>{row.part}</td>
                <td class={[CELL, "text-base-content/80 max-w-xs truncate"]} title={row.spec}>{row.spec}</td>
                <td class={[CELL, "max-w-48 truncate"]} title={row.package}>{row.package}</td>
                <td class={[CELL, "w-0 text-right"]}>{count(row.qty)}</td>
                <td class={[CELL, "w-0"]}>{@render lcsc(row.lcsc)}</td>
                <td class={CELL}>
                  {#each row.refs as ref, i (ref)}
                    {#if i > 0}<span class="text-base-content/40">, </span>{/if}
                    {#if outputs}
                      <button
                        type="button"
                        class="link link-hover cursor-pointer"
                        onmouseenter={e => {
                          e.stopPropagation()
                          show({ kind: "part", ref }, e.currentTarget)
                        }}
                        onfocus={e => show({ kind: "part", ref }, e.currentTarget)}
                        onblur={() => (peek = null)}
                        onclick={e => {
                          e.stopPropagation()
                          locate({ kind: "part", ref })
                        }}
                      >
                        {ref}
                      </button>
                    {:else}
                      {ref}
                    {/if}
                  {/each}
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>

      <ul class="divide-base-300 divide-y @2xl:hidden">
        {#each shown as row (row.item)}
          <li class="flex flex-col gap-1 px-3 py-2 text-sm tabular-nums">
            <div class="flex items-baseline gap-2">
              <span class="text-base-content/60 w-6 shrink-0 text-right text-xs">{row.item}</span>
              <span class="min-w-0 flex-1 font-medium break-words">{row.part}</span>
              <span class="shrink-0">{m.pcb_bom_pieces({ count: count(row.qty) })}</span>
            </div>
            <dl class="text-base-content/80 ml-8 grid grid-cols-3 gap-x-2 gap-y-1 text-xs">
              <dt class="text-base-content/60">{m.pcb_bom_spec()}</dt>
              <dd class="col-span-2 break-all">{row.spec}</dd>
              <dt class="text-base-content/60">{m.pcb_bom_package()}</dt>
              <dd class="col-span-2 break-all">{row.package}</dd>
              <dt class="text-base-content/60">{m.pcb_bom_refs()}</dt>
              <dd class="col-span-2">{row.refs.join(", ")}</dd>
              <dt class="text-base-content/60">LCSC</dt>
              <dd class="col-span-2">{@render lcsc(row.lcsc)}</dd>
            </dl>
          </li>
        {/each}
      </ul>
    {/if}
  </div>
  <div
    class={[
      "bg-base-200 border-base-300 flex shrink-0 flex-wrap items-center gap-x-4 gap-y-2",
      "border-t px-4 py-2 text-xs tabular-nums",
    ]}
  >
    <p aria-live="polite" class="text-base-content/80">
      {m.pcb_bom_summary({ lines: count(rows.length), parts: count(total), boards: count(boards) })}
    </p>
    <div class="ml-auto flex items-center gap-2">
      <span aria-hidden="true" class="text-base-content/70">{m.pcb_bom_board_count()}</span>
      <fieldset aria-label={m.pcb_bom_board_count()} class="join">
        <button
          type="button"
          class="btn btn-sm btn-square join-item"
          aria-label={m.pcb_bom_decrease()}
          disabled={boards <= 1}
          onclick={() => step(-1)}
        >
          <Icon icon="lucide:minus" class="size-4" />
        </button>
        <input
          type="text"
          inputmode="numeric"
          class="input input-sm join-item w-16 text-center tabular-nums"
          aria-label={m.pcb_bom_board_count()}
          bind:value={draft}
          onchange={() => (draft = String(boards))}
        />
        <button
          type="button"
          class="btn btn-sm btn-square join-item"
          aria-label={m.pcb_bom_increase()}
          disabled={boards >= MAX_BOARDS}
          onclick={() => step(1)}
        >
          <Icon icon="lucide:plus" class="size-4" />
        </button>
      </fieldset>
    </div>
  </div>
</div>

{#if outputs && peeked}
  <div
    aria-hidden="true"
    class={[
      "card card-border bg-base-100 border-base-300 pointer-events-none fixed z-50 h-60 w-72 overflow-hidden shadow-lg",
      !peek && "invisible",
    ]}
    style:left={rem(peek?.left ?? 0)}
    style:top={rem(peek?.top ?? 0)}
  >
    <BoardThumb {outputs} target={peek?.target ?? null} />
  </div>
{/if}
