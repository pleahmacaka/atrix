<script lang="ts">
import { fade } from "svelte/transition"
import ScopeDialog from "#lib/components/calendar/ScopeDialog.svelte"
import DayPane from "./DayPane.svelte"
import EventDetail from "./EventDetail.svelte"
import type { Panel } from "./panel.svelte.ts"

const SWAP = { duration: 120 }

let { panel }: { panel: Panel } = $props()
</script>

<aside
  class={[
    "relative flex min-h-0 w-full flex-col overflow-hidden",
    "rounded-box border border-base-300 bg-base-100",
  ]}
>
  {#key panel.detailOpen ? panel.detailKey : "day"}
    <div class="absolute inset-0 flex flex-col" transition:fade={SWAP}>
      {#if panel.detailOpen}
        <EventDetail {panel} />
      {:else}
        <DayPane {panel} />
      {/if}
    </div>
  {/key}

  {#if panel.asking}
    <ScopeDialog
      mode={panel.asking.mode}
      scoped={panel.asking.scoped}
      inline
      choose={panel.asking.answer}
    />
  {/if}
</aside>
