<script lang="ts">
import IconInput from "./IconInput.svelte"

let {
  icon,
  label,
  placeholder = label,
  value = $bindable(),
  dismissable,
  onsubmit,
  oncancel,
}: {
  icon: string
  label: string
  placeholder?: string
  value: string
  dismissable: () => boolean
  onsubmit: () => unknown
  oncancel: () => void
} = $props()
</script>

<form
  class="flex h-8 items-center"
  onsubmit={e => {
    e.preventDefault()
    onsubmit()
  }}
>
  <IconInput
    {icon}
    {label}
    {placeholder}
    ghost={false}
    class="w-full text-sm"
    bind:value
    onblur={() => {
      if (dismissable()) {
        oncancel()
      }
    }}
    onkeydown={e => {
      if (e.key === "Escape") {
        e.stopPropagation()
        oncancel()
      }
    }}
    {@attach node => node.focus()}
  />
</form>
