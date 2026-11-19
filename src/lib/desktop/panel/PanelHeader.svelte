<script lang="ts">
import Icon from "@iconify/svelte"
import { dateKey } from "#lib/calendar/dates.ts"
import { m } from "#lib/paraglide/messages.js"
import MonthNav from "./MonthNav.svelte"
import type { Panel } from "./panel.svelte.ts"

let {
  panel,
  collapse,
  hide,
}: { panel: Panel; collapse: () => void; hide: () => void } = $props()
</script>

<header class="flex min-h-14 items-center justify-between gap-3 ps-4 pe-2 pt-2">
  <div class="min-w-0">
    <h1 class="truncate text-base font-semibold tabular-nums">
      {panel.monthLabel}
    </h1>
    <p class="text-xs text-base-content/55 tabular-nums">
      {m.panel_today_date({ date: dateKey(panel.today) })}
    </p>
  </div>
  <MonthNav {panel}>
    <button type="button" class="btn btn-primary btn-xs" onclick={panel.startNew}>
      <Icon icon="lucide:plus" class="size-3.5" />
      {m.panel_event_new()}
    </button>
    <button
      type="button"
      class="btn btn-ghost btn-square btn-xs"
      aria-label={m.panel_collapse()}
      title={m.panel_collapse()}
      onclick={collapse}
    >
      <Icon icon="lucide:minimize-2" class="size-3.5" />
    </button>
    <button
      type="button"
      class="btn btn-ghost btn-square btn-xs"
      aria-label={m.common_close()}
      title={m.common_close()}
      onclick={hide}
    >
      <Icon icon="lucide:x" class="size-3.5" />
    </button>
  </MonthNav>
</header>
