<script lang="ts">
import type { HTMLButtonAttributes } from "svelte/elements"

let {
  axis = "x",
  label,
  ...rest
}: Omit<HTMLButtonAttributes, "class" | "aria-label"> & {
  axis?: "x" | "y"
  label: string
} = $props()
</script>

<button
  type="button"
  class={[
    "relative z-10 shrink-0 rounded-full transition-colors",
    "hover:bg-primary/60 active:bg-primary",
    axis === "x"
      ? "-mx-1.5 my-2 w-1 cursor-col-resize"
      : "mx-2 -my-1.5 h-1 cursor-row-resize",
  ]}
  aria-label={label}
  {...rest}
>
  <span
    class={[
      "absolute",
      axis === "x" ? "inset-y-0 -inset-x-1.5" : "inset-x-0 -inset-y-1.5",
    ]}
  ></span>
</button>
