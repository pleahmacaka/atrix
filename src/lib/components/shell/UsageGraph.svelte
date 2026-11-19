<script lang="ts">
import { m } from "#lib/paraglide/messages.js"
import { compact } from "./format.ts"
import { createUsage } from "./usage.ts"

const usage = createUsage()
</script>

{#if usage.enabled() && usage.days().length}
  <figure class="mx-auto flex w-full max-w-2xl flex-col items-end gap-1.5 px-4 sm:px-8">
    <div class="grid w-full grid-flow-col grid-cols-53 grid-rows-7 gap-0.5">
      {#each usage.days() as day (day.date)}
        <span
          class={["aspect-square rounded-xs", day.level === 0 && "bg-base-content/8"]}
          style:background-color={usage.gradeOf(day.level)}
          title={m.usage_day({
            date: usage.dateOf(day.date),
            tokens: compact(day.tokens),
          })}
        ></span>
      {/each}
    </div>
    <figcaption class="text-xs text-base-content/50 tabular-nums">
      {m.usage_total({ tokens: compact(usage.total) })}
    </figcaption>
  </figure>
{/if}

