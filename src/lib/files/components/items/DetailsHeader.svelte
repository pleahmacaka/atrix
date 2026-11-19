<script lang="ts">
import Icon from "@iconify/svelte"
import { m } from "#lib/paraglide/messages.js"
import type { Item } from "../../items"
import { COLUMN_LABELS } from "../../labels"
import { resizeHandle, rootRem } from "../../pointer"
import type { Explorer } from "../../store/explorer.svelte"
import { prefs, SORT_KEYS, type SortKey } from "../../store/prefs.svelte"
import { cellText } from "./cells"

let {
  explorer,
  template,
  width,
  shown,
}: {
  explorer: Explorer
  template: string
  width: number
  shown: Item[]
} = $props()

const COLUMN_MIN = 4

const COLUMN_MAX = 60

const results = $derived(!!explorer.tab.results)

let measurer: CanvasRenderingContext2D | null = null

const label = (key: SortKey) =>
  key === "kind" && results ? m.files_columns_folder() : COLUMN_LABELS[key]()

const textWidth = (text: string, size: number) => {
  const rem = rootRem()

  measurer ??= document.createElement("canvas").getContext("2d")

  if (!measurer || !text) {
    return 0
  }

  measurer.font = `${size * rem}px ${getComputedStyle(document.body).fontFamily}`

  return measurer.measureText(text).width / rem
}

const fit = (key: SortKey) => {
  const name = key === "name"
  const chrome = name ? 2.5 : 1.5
  const size = name ? 0.875 : 0.75
  const cells = shown.map(
    item => textWidth(cellText(item, key, results), size) + chrome,
  )
  const heading = textWidth(label(key), 0.75) + 2.5
  const wanted = Math.ceil(Math.max(heading, ...cells) * 4) / 4

  prefs.columns[key] = Math.min(COLUMN_MAX, Math.max(COLUMN_MIN, wanted))
}

const resize = (key: SortKey) =>
  resizeHandle({
    axis: "x",
    min: COLUMN_MIN,
    max: COLUMN_MAX,
    get: () => prefs.columns[key],
    set: size => (prefs.columns[key] = size),
  })
</script>

<div
  class="sticky top-0 z-10 bg-base-100 px-2"
  style:width="{width}rem"
>
  <div
    class="grid h-8 items-stretch text-xs font-medium text-base-content/55"
    style:grid-template-columns={template}
  >
    {#each SORT_KEYS as key (key)}
      {@const sorted = explorer.folder.sort === key}
      <div class="group relative flex min-w-0">
        <button
          type="button"
          class={[
            "flex min-w-0 flex-1 cursor-pointer items-center gap-1 rounded-field px-3",
            "transition-colors duration-140 hover:bg-base-content/8",
            key === "size" && "justify-end",
            sorted && "text-base-content",
          ]}
          title={label(key)}
          onclick={() => explorer.setSort(key)}
        >
          <span class="truncate">{label(key)}</span>
          {#if sorted}
            <Icon
              icon={explorer.folder.ascending
                ? "lucide:chevron-up"
                : "lucide:chevron-down"}
              class="size-3 shrink-0"
            />
          {/if}
        </button>
        <button
          type="button"
          class={[
            "absolute inset-y-1.5 -end-0.5 z-10 w-1 cursor-col-resize rounded-full",
            "transition-colors duration-140 hover:bg-primary/60 active:bg-primary",
          ]}
          aria-label={label(key)}
          onpointerdown={resize(key)}
          ondblclick={() => fit(key)}
        ></button>
      </div>
    {/each}
  </div>
</div>
