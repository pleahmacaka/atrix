<script lang="ts">
import Icon from "@iconify/svelte"
import type { HTMLInputAttributes } from "svelte/elements"

let {
  icon,
  label,
  value = $bindable(),
  ghost = true,
  class: extra = "",
  ...rest
}: Omit<HTMLInputAttributes, "class" | "value"> & {
  icon: string
  label: string
  value: string
  ghost?: boolean
  class?: string
} = $props()
</script>

<label
  class={["input input-sm min-w-0", ghost && "input-ghost", extra || "w-full"]}
  title={label}
>
  <Icon {icon} class="size-4 shrink-0 opacity-60" />
  <input class="min-w-0 grow" aria-label={label} bind:value {...rest} />
</label>
