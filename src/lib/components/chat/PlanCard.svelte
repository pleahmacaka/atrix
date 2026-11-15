<script lang="ts">
import Icon from "@iconify/svelte"
import type { PlanEntry } from "#lib/acp/items.ts"
import { m } from "#lib/paraglide/messages.js"
import { CARD, STATUS_ICONS } from "./labels.ts"

let { entries }: { entries: PlanEntry[] } = $props()
</script>

<section class={CARD}>
  <h3 class="mb-2 font-semibold">{m.chat_plan()}</h3>
  <ul class="grid gap-1.5 text-sm">
    {#each entries as entry, index (index)}
      <li
        class={[
          "flex min-w-0 items-start gap-2",
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
        <span class="min-w-0 break-words">{entry.content}</span>
      </li>
    {/each}
  </ul>
</section>
