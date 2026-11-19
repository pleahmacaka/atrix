<script lang="ts">
import Icon from "@iconify/svelte"
import { m } from "#lib/paraglide/messages.js"

let {
  check,
  done,
  idle = m.gateway_unchecked(),
}: {
  check: { state: "idle" | "busy" | "ok" | "failed"; reason?: string; models?: string[] }
  done: string
  idle?: string
} = $props()
</script>

<div class="flex min-h-8 items-center gap-2 px-1 text-sm" aria-live="polite">
  {#if check.state === "busy"}
    <span class="loading loading-spinner loading-xs opacity-60"></span>
    <span class="text-base-content/60">{m.gateway_checking()}</span>
  {:else if check.state === "ok"}
    <Icon icon="lucide:circle-check" class="size-4 shrink-0 text-success" />
    <span class="min-w-0 flex-1 text-success">{done}</span>
  {:else if check.state === "failed"}
    <Icon icon="lucide:circle-alert" class="size-4 shrink-0 text-error" />
    <span class="min-w-0 flex-1 text-error">{check.reason}</span>
  {:else}
    <span class="min-w-0 flex-1 text-base-content/55">{idle}</span>
  {/if}
</div>