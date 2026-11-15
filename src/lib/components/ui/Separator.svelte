<script lang="ts">
import type { ClassValue } from "svelte/elements"

let {
  vertical = false,
  class: extra,
}: { vertical?: boolean; class?: ClassValue } = $props()
</script>

<hr
  aria-orientation={vertical ? "vertical" : undefined}
  class={[
    "shrink-0 border-0 bg-base-content/15",
    vertical ? "mx-1.5 h-5 w-hairline self-center" : "my-1 h-hairline w-full",
    extra,
  ]}
/>
