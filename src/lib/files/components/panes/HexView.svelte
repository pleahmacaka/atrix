<script lang="ts">
import { SvelteMap, SvelteSet } from "svelte/reactivity"
import SearchField from "#lib/components/ui/SearchField.svelte"
import { m } from "#lib/paraglide/messages.js"
import { findBytes, readBytes } from "../../native"
import { rootRem } from "../../pointer"

let { path, size }: { path: string; size: number } = $props()

const ROW_REM = 1.25

const PAGE = 4096

const DIGITS = "0123456789abcdef"

const pages = new SvelteMap<number, Uint8Array>()

const loading = new SvelteSet<number>()

let viewport = $state<HTMLElement>()

let width = $state(0)

let height = $state(0)

let top = $state(0)

let query = $state("")

let match = $state<{ at: number; length: number } | null>(null)

let missing = $state(false)

let searching = $state(false)

const perRow = $derived(width / rootRem() >= 32 ? 16 : 8)

const rowPx = $derived(ROW_REM * rootRem())

const rows = $derived(Math.ceil(size / perRow))

const digits = $derived(size > 0xffffff ? 8 : 6)

const first = $derived(Math.max(0, Math.floor(top / rowPx) - 2))

const last = $derived(Math.min(rows, Math.ceil((top + height) / rowPx) + 2))

const visible = $derived(
  Array.from({ length: Math.max(0, last - first) }, (_, index) => first + index),
)

const isHex = (text: string) => {
  const compact = text.replaceAll(" ", "").toLowerCase()

  return (
    compact.length >= 2 &&
    compact.length % 2 === 0 &&
    [...compact].every(char => DIGITS.includes(char))
  )
}

const hexQuery = $derived(isHex(query))

const needle = $derived.by(() => {
  if (!query.trim()) {
    return []
  }

  if (!hexQuery) {
    return [...new TextEncoder().encode(query)]
  }

  const compact = query.replaceAll(" ", "")

  return Array.from({ length: compact.length / 2 }, (_, index) =>
    Number.parseInt(compact.slice(index * 2, index * 2 + 2), 16),
  )
})

const status = $derived(
  missing ? "missing" : !query.trim() ? null : hexQuery ? "hex" : "text",
)

const STATUS = [
  { id: "hex", text: m.files_hex_mode_hex },
  { id: "text", text: m.files_hex_mode_text },
  { id: "missing", text: m.files_hex_not_found },
]

const byteAt = (offset: number) =>
  pages.get(Math.floor(offset / PAGE))?.[offset % PAGE]

const hexOf = (value: number | undefined) =>
  value === undefined ? "··" : value.toString(16).padStart(2, "0")

const charOf = (value: number | undefined) =>
  value === undefined
    ? " "
    : value >= 0x20 && value < 0x7f
      ? String.fromCharCode(value)
      : "."

const hit = (offset: number) =>
  !!match && offset >= match.at && offset < match.at + match.length

$effect(() => {
  const from = Math.floor((first * perRow) / PAGE)
  const to = Math.floor(Math.max(last * perRow - 1, 0) / PAGE)
  const target = path

  for (let page = from; page <= to && page * PAGE < size; page += 1) {
    if (pages.has(page) || loading.has(page)) {
      continue
    }

    loading.add(page)
    readBytes(target, page * PAGE, PAGE)
      .then(bytes => pages.set(page, bytes))
      .catch(() => undefined)
      .finally(() => loading.delete(page))
  }
})

const search = async () => {
  if (needle.length === 0 || searching) {
    return
  }

  searching = true

  const from = match ? match.at + 1 : 0
  const at = await findBytes(path, needle, from).catch(() => null)

  searching = false
  missing = at === null
  match = at === null ? null : { at, length: needle.length }

  if (at !== null && viewport) {
    viewport.scrollTop = Math.max(
      0,
      Math.floor(at / perRow) * rowPx - height / 3,
    )
  }
}
</script>

<div class="flex size-full min-h-0 flex-col gap-2 self-stretch p-2 text-xs">
  <div class="flex shrink-0 items-center gap-2">
    <SearchField
      bind:value={query}
      label={m.files_hex_search()}
      class="min-w-0 flex-1"
      oninput={() => {
        match = null
        missing = false
      }}
      onkeydown={e => {
        if (e.key === "Enter") {
          e.preventDefault()
          search()
        }
      }}
    />
    <span class="grid shrink-0 text-base-content/55" aria-live="polite">
      {#each STATUS as entry (entry.id)}
        <span
          class={[
            "col-start-1 row-start-1 whitespace-nowrap",
            entry.id !== status && "invisible",
          ]}
        >
          {entry.text()}
        </span>
      {/each}
    </span>
  </div>

  <div
    bind:this={viewport}
    bind:clientWidth={width}
    bind:clientHeight={height}
    class="relative min-h-0 grow overflow-auto tabular-nums select-text"
    onscroll={e => (top = e.currentTarget.scrollTop)}
  >
    <div class="relative" style:height="{rows * ROW_REM}rem">
      {#each visible as row (row)}
        {@const base = row * perRow}

        <div
          class={[
            "absolute inset-x-0 flex h-5 items-center gap-1.5",
            "whitespace-nowrap",
          ]}
          style:top="{row * ROW_REM}rem"
        >
          <span
            class={[
              "shrink-0 text-base-content/40",
              digits > 6 ? "w-14" : "w-11",
            ]}
          >
            {base.toString(16).padStart(digits, "0")}
          </span>

          <span class="flex shrink-0">
            {#each { length: perRow } as _, column}
              {@const offset = base + column}

              <span
                class={[
                  "w-4 text-center",
                  offset >= size && "invisible",
                  hit(offset) && "rounded-sm bg-primary/30 text-primary",
                ]}
              >
                {hexOf(byteAt(offset))}
              </span>
            {/each}
          </span>

          <span class="flex shrink-0 text-base-content/60">
            {#each { length: perRow } as _, column}
              {@const offset = base + column}

              <span
                class={[
                  "w-2 text-center",
                  offset >= size && "invisible",
                  hit(offset) && "bg-primary/30 text-primary",
                ]}
              >
                {charOf(byteAt(offset))}
              </span>
            {/each}
          </span>
        </div>
      {/each}
    </div>
  </div>
</div>
