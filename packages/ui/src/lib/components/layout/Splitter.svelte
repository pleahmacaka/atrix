<script lang="ts">
  import { type Resize, resizeHandle } from "../../layout/pointer"

  let {
    resize,
    label,
    onreset,
  }: { resize: Resize; label?: string; onreset?: () => void } = $props()

  const vertical = $derived(resize.axis === "x")
</script>

<hr
  aria-orientation={vertical ? "vertical" : "horizontal"}
  aria-label={label}
  class={[
    "relative z-10 flex shrink-0 items-center justify-center border-0",
    "before:bg-base-content/10 before:transition-colors hover:before:bg-primary/50",
    vertical
      ? "-mx-1 h-auto w-2 cursor-col-resize before:h-full before:w-0.25 hover:before:w-0.5"
      : "-my-1 h-2 cursor-row-resize before:h-0.25 before:w-full hover:before:h-0.5",
  ]}
  onpointerdown={e => resizeHandle(resize)(e)}
  ondblclick={onreset}
/>
