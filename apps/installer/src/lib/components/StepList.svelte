<script lang="ts">
import Icon from "@iconify/svelte"
import type { Step, StepId } from "#lib/installer.ts"
import { m } from "#lib/messages.ts"

let { steps }: { steps: Step[] } = $props()

const LABELS: Record<StepId, string> = {
  stop: m.step_stop,
  client: m.step_client,
  components: m.step_components,
  start: m.step_start,
  remove: m.step_remove,
}
</script>

<ul class="island flex min-h-14 flex-col p-2">
  {#each steps as step (step.id)}
    <li class="flex items-center gap-3 rounded-field px-3 py-2.5">
      <span class="grid size-5 shrink-0 place-items-center">
        {#if step.state === "running"}
          <span class="loading loading-spinner loading-sm text-primary"></span>
        {:else if step.state === "done"}
          <Icon icon="lucide:check" class="size-5 text-success" />
        {:else}
          <Icon icon="lucide:circle-x" class="size-5 text-error" />
        {/if}
      </span>
      <span class="min-w-0 grow truncate text-sm">{LABELS[step.id]}</span>
    </li>
  {/each}
</ul>
