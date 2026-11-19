<script lang="ts">
import Icon from "@iconify/svelte"
import { citationsOf, notesText } from "#lib/calendar/citations.ts"
import { parseLocal } from "#lib/calendar/dates.ts"
import { eventSpan, format } from "#lib/calendar/format.ts"
import { inSeries, isDone } from "#lib/calendar/occurrence.ts"
import type { SharedEvent } from "#lib/calendar/shared.svelte.ts"
import type { EventTag } from "#lib/calendar/store.ts"
import { colorOf, tagLabel, tagsOf } from "#lib/calendar/tags.ts"
import { m } from "#lib/paraglide/messages.js"

let {
  events,
  tags,
  onedit,
  onmenu,
  onopendoc,
  ondone,
}: {
  events: SharedEvent[]
  tags: EventTag[]
  onedit: (event: SharedEvent) => void
  onmenu: (e: MouseEvent, event: SharedEvent) => void
  onopendoc: (id: string) => void
  ondone: (event: SharedEvent) => void
} = $props()
</script>

<ul class="flex flex-col gap-0.5">
  {#each events as event (event.id)}
      {@const labels = tagsOf(tags, event).map(tagLabel)}
      {@const cited = citationsOf(event.notes)}
      {@const done = isDone(event)}
      <li class="relative">
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
            class={[
              "shrink-0 rounded-full",
              event.task ? "mt-0.5 size-4" : ["mt-1.5 size-2", colorOf(tags, event)],
            ]}
          ></span>
          <span class="flex min-w-0 flex-1 flex-col">
            <span class="flex min-w-0 items-center gap-1 text-sm">
              <span
                class={["truncate", done && "text-base-content/50 line-through"]}
              >
                {event.title}
              </span>
              {#if inSeries(event)}
                <Icon
                  icon="lucide:repeat"
                  class="size-3 shrink-0 text-base-content/50"
                />
              {/if}
              {#if event.reminder !== null && !event.allDay}
                <Icon
                  icon="lucide:bell"
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
                {notesText(event.notes)}
              </span>
            {/if}
          </span>
        </button>
        {#if event.task}
          <input
            type="checkbox"
            class="checkbox checkbox-primary checkbox-xs absolute start-2 top-2"
            checked={done}
            aria-label={done ? m.panel_task_undo() : m.panel_task_done()}
            onchange={() => ondone(event)}
          />
        {/if}
        {#if cited.length > 0}
          <div class="flex flex-wrap gap-1 ps-6 pb-1">
            {#each cited as doc (doc.id)}
              <button
                type="button"
                class="btn btn-ghost btn-xs max-w-full gap-1 bg-base-content/5"
                title={doc.label}
                onclick={() => onopendoc(doc.id)}
              >
                <Icon icon="lucide:file-text" class="size-3 shrink-0" />
                <span class="truncate">{doc.label}</span>
              </button>
            {/each}
          </div>
        {/if}
      </li>
  {/each}
</ul>
