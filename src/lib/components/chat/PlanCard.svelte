<script lang="ts">
import Icon from "@iconify/svelte"
import type { PlanEntry } from "#lib/acp/items.ts"
import { m } from "#lib/paraglide/messages.js"
import { STATUS_ICONS } from "./labels.ts"

let { entries }: { entries: PlanEntry[] } = $props()
</script>

<div class="rounded-box border border-base-300 p-3">
  <p class="mb-2 text-sm font-medium">{m.chat_plan()}</p>
  <ul class="grid gap-1.5 text-sm">
    {#each entries as entry, index (index)}
      <li
        class={[
          "flex items-start gap-2",
          entry.status === "completed" && "text-base-content/60 line-through",
        ]}
      >
        <Icon
          icon={STATUS_ICONS[entry.status] ?? "lucide:circle-dashed"}
          class={[
            "mt-0.5 size-4 shrink-0",
            entry.status === "in_progress" && "animate-spin",
          ]}
        />
        <span>{entry.content}</span>
      </li>
    {/each}
  </ul>
</div>
