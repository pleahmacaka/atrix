<script lang="ts">
import type { ClassValue } from "svelte/elements"

let { text, class: extra }: { text: string; class?: ClassValue } = $props()
</script>

<p class={["px-2 pt-1.5 pb-1 text-xs font-medium text-base-content/50", extra]}>
  {text}
</p>
