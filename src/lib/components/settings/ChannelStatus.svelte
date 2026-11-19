<script lang="ts">
import Icon from "@iconify/svelte"
import { liveOf } from "#lib/channels/store.svelte.ts"
import { m } from "#lib/paraglide/messages.js"

let { provider }: { provider: string } = $props()

const status = $derived(liveOf(provider).status)
</script>

<span class="flex items-center gap-1.5 text-xs whitespace-nowrap text-base-content/70">
  {#if status === "on"}
    <Icon icon="lucide:circle-check" class="size-3.5 text-success" />
    {m.channels_on()}
  {:else if status === "connecting"}
    <span class="loading loading-spinner loading-xs"></span>
    {m.channels_connecting()}
  {:else}
    <Icon icon="lucide:circle-dashed" class="size-3.5 text-base-content/50" />
    {m.channels_off()}
  {/if}
</span>