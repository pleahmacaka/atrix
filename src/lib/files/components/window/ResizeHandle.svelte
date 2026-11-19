<script lang="ts">
import { type Resize, resizeHandle } from "../../pointer"

let {
  resize,
  label,
  onreset,
}: { resize: Resize; label: string; onreset?: () => void } = $props()

const vertical = $derived(resize.axis === "x")
</script>

<button
  type="button"
  class={[
    "relative z-10 shrink-0 rounded-full transition-colors",
    "hover:bg-primary/60 active:bg-primary",
    vertical
      ? "-mx-1.5 my-2 w-1 cursor-col-resize"
      : "mx-2 -my-1.5 h-1 cursor-row-resize",
  ]}
  aria-label={label}
  title={label}
  onpointerdown={resizeHandle(resize)}
  ondblclick={onreset}
>
  <span
    class={["absolute", vertical ? "inset-y-0 -inset-x-1.5" : "inset-x-0 -inset-y-1.5"]}
  ></span>
</button>
