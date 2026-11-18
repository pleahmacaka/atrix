<script lang="ts">
import Icon from "@iconify/svelte"

let { name, effort }: { name: string; effort?: string } = $props()
</script>

<Icon icon="lucide:cpu" class="size-3.5 shrink-0 opacity-60" />
<span class="min-w-0 truncate">{name}</span>
{#if effort}
  <span class="shrink-0 text-base-content/55">{effort}</span>
{/if}
