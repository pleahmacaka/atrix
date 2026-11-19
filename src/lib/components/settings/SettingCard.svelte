<script lang="ts">
import type { Snippet } from "svelte"

let { children }: { children: Snippet } = $props()
</script>

<div class="flex flex-col rounded-box border border-base-300 bg-base-100 px-3 py-1">
  {@render children()}
</div>