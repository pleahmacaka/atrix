<script lang="ts">
import type { ComponentProps } from "svelte"
import { m } from "#lib/paraglide/messages.js"
import IconButton from "./IconButton.svelte"

let {
  text,
  label = m.common_copy(),
  icon = "lucide:copy",
  size = "xs",
  copied = $bindable(false),
  ...rest
}: Omit<ComponentProps<typeof IconButton>, "icon" | "label" | "onclick"> & {
  text: string
  label?: string
  icon?: string
  copied?: boolean
} = $props()

const copy = async () => {
  await navigator.clipboard.writeText(text)
  copied = true

  setTimeout(() => {
    copied = false
  }, 1500)
}
</script>

<IconButton
  icon={copied ? "lucide:check" : icon}
  {label}
  {size}
  onclick={copy}
  {...rest}
/>
