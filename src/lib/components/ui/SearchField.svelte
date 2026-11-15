<script lang="ts">
import Icon from "@iconify/svelte"
import type { ClassValue, HTMLInputAttributes } from "svelte/elements"
import { m } from "#lib/paraglide/messages.js"

let {
  value = $bindable(""),
  label = m.common_search(),
  placeholder = label,
  class: extra,
  ...rest
}: Omit<HTMLInputAttributes, "class" | "value" | "type"> & {
  value?: string
  label?: string
  class?: ClassValue
} = $props()
</script>

<label
  class={[
    "flex h-9 min-w-0 items-center gap-2 rounded-field bg-base-content/5 px-3",
    extra,
  ]}
>
  <Icon icon="lucide:search" class="size-4 shrink-0 opacity-50" />
  <input
    type="search"
    aria-label={label}
    {placeholder}
    autocomplete="off"
    spellcheck="false"
    class="h-full min-w-0 flex-1 bg-transparent text-sm outline-none"
    bind:value
    {...rest}
  />
</label>
