<script lang="ts">
import { untrack } from "svelte"
import { m } from "#lib/paraglide/messages.js"
import { getLocale } from "#lib/paraglide/runtime.js"
import { settings } from "#lib/store/settings.svelte.ts"
import { usageGraph } from "#lib/store/usageGraph.svelte.ts"

const GRADES = ["", "var(--graph-1)", "var(--graph-2)", "var(--graph-3)", "var(--graph-4)"]

const compact = new Intl.NumberFormat("en", {
  notation: "compact",
  maximumFractionDigits: 1,
})

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
          style:background-color={day.level ? GRADES[day.level] : undefined}
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
