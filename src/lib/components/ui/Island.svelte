<script lang="ts">
import type { Snippet } from "svelte"
import type { ClassValue } from "svelte/elements"

let {
  title,
  action,
  children,
  class: extra,
}: {
  title: string
  action?: Snippet
  children: Snippet
  class?: ClassValue
} = $props()
</script>

<section class={["island", extra]}>
  <h2
    class={[
      "flex items-center justify-between px-4 pt-3 pb-1",
      "text-xs font-semibold text-base-content/55",
    ]}
  >
    {title}
    {@render action?.()}
  </h2>
  <div class="p-2">
    {@render children()}
  </div>
</section>
