<script lang="ts">
import IconButton from "#lib/components/ui/IconButton.svelte"
import { m } from "#lib/paraglide/messages.js"
import { currentLocale } from "#lib/store/locale.ts"
import { formatBytes } from "../../format"
import { VIEW_LABELS } from "../../labels"
import { cancelSearch, measureDirs, randomToken } from "../../native"
import type { Explorer } from "../../store/explorer.svelte"
import { VIEW_ICONS, type ViewMode } from "../../store/prefs.svelte"

let { explorer }: { explorer: Explorer } = $props()

const QUICK: ViewMode[] = ["details", "large"]

const MEASURE_DELAY = 200

const tab = $derived(explorer.tab)

const bytes = $derived(
  explorer.selected
    .filter(item => !item.dir)
    .reduce((sum, item) => sum + item.size, 0),
)

const folders = $derived(
  explorer.filesystem
    ? explorer.selected
        .filter(item => item.dir)
        .map(item => item.path)
        .join("\n")
    : "",
)

let measured = $state<number | null>(0)

$effect(() => {
  if (!folders) {
    measured = 0

    return
  }

  const paths = folders.split("\n")
  const token = randomToken()
  let current = true

  measured = null

  const timer = setTimeout(() => {
    measureDirs(paths, token)
      .then(size => {
        if (current) {
          measured = size ?? 0
        }
      })
      .catch(() => {
        if (current) {
          measured = 0
        }
      })
  }, MEASURE_DELAY)

  return () => {
    current = false
    clearTimeout(timer)
    cancelSearch(token).catch(() => undefined)
  }
})

const total = $derived(measured === null ? null : bytes + measured)
</script>

<footer
  class={[
    "flex h-9 shrink-0 items-center gap-4 ps-4 pe-2",
    "text-xs whitespace-nowrap text-base-content/60 tabular-nums",
  ]}
>
  <span>
    {tab.results
      ? m.files_status_results({ count: explorer.visible.length })
      : m.files_status_items({ count: explorer.visible.length })}
  </span>

  {#if explorer.selected.length}
    <span>{m.files_status_selected({ count: explorer.selected.length })}</span>

    {#if total === null}
      <span class="flex items-center gap-1.5">
        <span class="loading loading-spinner loading-xs"></span>
        {m.files_status_measuring()}
      </span>
    {:else if total > 0}
      <span>{formatBytes(total, currentLocale())}</span>
    {/if}
  {/if}

  {#if tab.searching}
    <span class="flex items-center gap-1.5 text-primary">
      <span class="loading loading-spinner loading-xs"></span>
      {m.files_status_searching()}
    </span>
  {/if}

  <div class="min-w-0 flex-1"></div>

  <div class="flex items-center gap-0.5">
    {#each QUICK as view (view)}
      <IconButton
        icon={VIEW_ICONS[view]}
        label={VIEW_LABELS[view]()}
        size="xs"
        iconClass="size-3.5"
        aria-pressed={explorer.view === view}
        class={[explorer.view === view && "bg-primary/8 text-primary"]}
        disabled={!explorer.arrangeable}
        onclick={() => explorer.setView(view)}
      />
    {/each}
  </div>
</footer>
