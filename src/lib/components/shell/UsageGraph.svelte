<script lang="ts">
import { untrack } from "svelte"
import { m } from "#lib/paraglide/messages.js"
import { getLocale } from "#lib/paraglide/runtime.js"
import { settings } from "#lib/store/settings.svelte.ts"
import { usageGraph } from "#lib/store/usageGraph.svelte.ts"

const BLUES = [
  "",
  "oklch(86% 0.08 235)",
  "oklch(79% 0.13 237)",
  "oklch(73% 0.17 240)",
  "oklch(68% 0.2 244)",
]

const compact = new Intl.NumberFormat(getLocale(), { notation: "compact" })

const dated = new Intl.DateTimeFormat(getLocale(), { dateStyle: "medium" })

$effect(() => {
  if (settings.tokscale) {
    untrack(() => usageGraph.load())
  }
})
</script>

{#if settings.tokscale && usageGraph.days.length}
  <figure class="mx-auto flex w-full max-w-2xl flex-col items-end gap-1.5 px-4 sm:px-8">
    <div class="grid w-full grid-flow-col grid-cols-53 grid-rows-7 gap-0.5">
      {#each usageGraph.days as day (day.date)}
        <span
          class={["aspect-square rounded-xs", day.level === 0 && "bg-base-content/8"]}
          style:background-color={day.level ? BLUES[day.level] : undefined}
          title={m.usage_day({
            date: dated.format(new Date(`${day.date}T00:00:00`)),
            tokens: compact.format(day.tokens),
          })}
        ></span>
      {/each}
    </div>
    <figcaption class="text-xs text-base-content/50 tabular-nums">
      {m.usage_total({ tokens: compact.format(usageGraph.total) })}
    </figcaption>
  </figure>
{/if}
