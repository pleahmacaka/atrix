<script lang="ts">
import { slide } from "svelte/transition"
import { motion } from "#lib/components/ui/motion.ts"
import type { Gateway } from "#lib/store/local.svelte.ts"
import GatewayModels from "./GatewayModels.svelte"

let { ids, gateway, onmodels }: {
  ids: Promise<string[]>
  gateway: Gateway
  onmodels: (models: string[] | undefined) => void
} = $props()
</script>

<div transition:slide={{ duration: motion(140) }}>
  {#await ids}
    <span class="loading loading-spinner loading-sm my-2 opacity-60"></span>
  {:then models}
    <GatewayModels {models} enabled={gateway.models} class="mb-3" ontoggle={onmodels} />
  {/await}
</div>