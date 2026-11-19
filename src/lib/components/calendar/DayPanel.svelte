<script lang="ts">
import Icon from "@iconify/svelte"
import { parseLocal } from "#lib/calendar/dates.ts"
import { eventSpan, format } from "#lib/calendar/format.ts"
import { inSeries } from "#lib/calendar/occurrence.ts"
import type { SharedEvent } from "#lib/calendar/shared.ts"
import type { EventTag } from "#lib/calendar/store.ts"
import { colorOf, tagLabel, tagsOf } from "#lib/calendar/tags.ts"
import { m } from "#lib/paraglide/messages.js"

let {
  events,
  tags,
  onedit,
  onmenu,
}: {
  events: SharedEvent[]
  tags: EventTag[]
  onedit: (event: SharedEvent) => void
  onmenu: (e: MouseEvent, event: SharedEvent) => void
} = $props()
</script>

<ul class="flex flex-col gap-0.5">
  {#each events as event (event.id)}
      {@const labels = tagsOf(tags, event).map(tagLabel)}
      <li>
        <button
          type="button"
          class={[
            "flex w-full cursor-pointer items-start gap-2 rounded-field px-2 py-1.5",
            "text-start transition-colors duration-140 hover:bg-base-content/8",
          ]}
          onclick={() => onedit(event)}
          oncontextmenu={e => onmenu(e, event)}
        >
          <span
            class={["mt-1.5 size-2 shrink-0 rounded-full", colorOf(tags, event)]}
          ></span>
          <span class="flex min-w-0 flex-1 flex-col">
            <span class="flex min-w-0 items-center gap-1 text-sm">
              <span class="truncate">{event.title}</span>
              {#if inSeries(event)}
                <Icon
                  icon="lucide:repeat"
                  class="size-3 shrink-0 text-base-content/50"
                />
              {/if}
            </span>
            <span class="text-xs text-base-content/55 tabular-nums">
              {eventSpan(event, m.calendar_all_day())}
            </span>
            {#if event.shiftedFrom}
              <span class="text-xs text-base-content/55">
                {m.calendar_shifted_from({
                  date: format(parseLocal(event.shiftedFrom), {
                    month: "short",
                    day: "numeric",
                  }),
                })}
              </span>
            {/if}
            {#if labels.length > 0}
              <span class="truncate text-xs text-base-content/55">
                {labels.join(", ")}
              </span>
            {/if}
            {#if event.notes}
              <span class="line-clamp-2 text-xs text-base-content/55">
                {event.notes}
              </span>
            {/if}
          </span>
        </button>
      </li>
  {/each}
</ul>
