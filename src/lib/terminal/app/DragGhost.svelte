<script lang="ts">
import Icon from "@iconify/svelte"
import { scale } from "svelte/transition"
import { shellIcon } from "../shell-icons"
import { drag } from "./drag.svelte"

const GAP = 12

let width = $state(0)

let height = $state(0)

let innerWidth = $state(0)

let innerHeight = $state(0)

const rem = () =>
  Number.parseFloat(getComputedStyle(document.documentElement).fontSize)

const left = $derived(
  drag.x + GAP + width > innerWidth ? drag.x - GAP - width : drag.x + GAP,
)

const top = $derived(
  drag.y + GAP + height > innerHeight ? drag.y - GAP - height : drag.y + GAP,
)
</script>

<svelte:window bind:innerWidth bind:innerHeight />

{#if drag.tab !== null && drag.card}
  <div
    class={[
      "pointer-events-none fixed z-50 flex max-w-64 items-center gap-2",
      "rounded-field border border-base-300 bg-raised shadow-lg",
      "px-3 py-1.5 text-sm",
    ]}
    style:left="{left / rem()}rem"
    style:top="{top / rem()}rem"
    bind:clientWidth={width}
    bind:clientHeight={height}
    transition:scale={{ start: 0.95, duration: 140 }}
  >
    <Icon icon={shellIcon(drag.card.shell)} class="size-4 shrink-0" />
    <span class="min-w-0 truncate">{drag.card.title}</span>
    {#if drag.card.panes > 1}
      <span class="badge badge-sm badge-soft badge-primary tabular-nums">
        {drag.card.panes}
      </span>
    {/if}
  </div>
{/if}
