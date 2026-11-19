<script lang="ts">
import Icon from "@iconify/svelte"
import { m } from "#lib/paraglide/messages.js"
import { rootRem } from "../../pointer"
import type { Explorer } from "../../store/explorer.svelte"
import { sidebarIcon, sidebarLabel } from "../../store/sidebar"

let { explorer }: { explorer: Explorer } = $props()

const OFFSET = 16
</script>

{#if explorer.dropHint}
  {@const hint = explorer.dropHint}
  <div
    class={[
      "pointer-events-none fixed z-50 flex max-w-72 items-center gap-2",
      "rounded-box border border-base-300 bg-raised px-2.5 py-1.5 text-sm shadow-md",
    ]}
    style:left="{(hint.x + OFFSET) / rootRem()}rem"
    style:top="{(hint.y + OFFSET) / rootRem()}rem"
    role="status"
  >
    <span
      class={[
        "badge badge-soft badge-sm shrink-0 gap-1 whitespace-nowrap",
        hint.move ? "badge-primary" : "badge-success",
      ]}
    >
      <Icon
        icon={hint.move ? "lucide:move-right" : "lucide:copy-plus"}
        class="size-3"
      />
      {hint.move ? m.files_drop_move() : m.files_drop_copy()}
    </span>
    <Icon icon={sidebarIcon(hint.into)} class="size-4 shrink-0 text-primary" />
    <span class="min-w-0 truncate font-medium" title={sidebarLabel(hint.into)}>
      {sidebarLabel(hint.into)}
    </span>
    {#if hint.count > 1}
      <span class="shrink-0 text-xs text-base-content/55 tabular-nums">
        {m.files_drop_items({ count: hint.count })}
      </span>
    {/if}
  </div>
{/if}
