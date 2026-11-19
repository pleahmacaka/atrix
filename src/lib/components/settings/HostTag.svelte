<script lang="ts">
import type { HostEntry } from "#lib/p2p/hosts.svelte.ts"
import { LOCAL } from "#lib/p2p/hosts.svelte.ts"

let { host, many }: { host: HostEntry; many: boolean } = $props()
</script>

{#if many && host.id !== LOCAL}
  <span class="max-w-24 shrink-0 truncate text-xs text-base-content/45" title={host.name}>
    {host.name}
  </span>
{/if}