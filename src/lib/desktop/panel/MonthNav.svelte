<script lang="ts">
import Icon from "@iconify/svelte"
import type { Snippet } from "svelte"
import { m } from "#lib/paraglide/messages.js"
import type { Panel } from "./panel.svelte.ts"

let { panel, children }: { panel: Panel; children: Snippet } = $props()
</script>

<div class="flex shrink-0 items-center gap-1">
  <div class="join">
    <button
      type="button"
      class="btn btn-ghost btn-square btn-xs join-item"
      aria-label={m.calendar_prev()}
      title={m.calendar_prev()}
      onclick={() => panel.shift(-1)}
    >
      <Icon icon="lucide:chevron-left" class="size-3.5" />
    </button>
    <button
      type="button"
      class="btn btn-ghost btn-xs join-item"
      onclick={panel.jumpToday}
    >
      {m.calendar_today()}
    </button>
    <button
      type="button"
      class="btn btn-ghost btn-square btn-xs join-item"
      aria-label={m.calendar_next()}
      title={m.calendar_next()}
      onclick={() => panel.shift(1)}
    >
      <Icon icon="lucide:chevron-right" class="size-3.5" />
    </button>
  </div>
  {@render children()}
</div>
