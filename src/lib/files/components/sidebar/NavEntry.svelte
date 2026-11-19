<script lang="ts">
import TreeRow from "#lib/components/ui/TreeRow.svelte"
import type { Drive } from "../../native"
import { prefetchOnHover } from "../../store/prefetch"
import { middleClick } from "../middleClick"

const LOW_SPACE = 0.1

let {
  label,
  location,
  icon,
  active,
  dropping = false,
  drive,
  onopen,
  onaux,
  onmenu,
  onpress,
}: {
  label: string
  location: string
  icon: string
  active: boolean
  dropping?: boolean
  drive?: Drive
  onopen: () => void
  onaux: () => void
  onmenu: (e: MouseEvent) => void
  onpress?: (e: PointerEvent) => void
} = $props()

const used = $derived(
  drive && drive.total > 0 ? (drive.total - drive.free) / drive.total : null,
)
</script>

<div
  class={[
    "flex flex-col rounded-field transition-colors duration-140",
    dropping && "bg-primary/12",
  ]}
>
  <TreeRow
    {icon}
    {label}
    title={label}
    selected={active}
    data-drop-path={location}
    onclick={onopen}
    onpointerdown={onpress}
    oncontextmenu={onmenu}
    {@attach prefetchOnHover(location)}
    {@attach middleClick(onaux)}
  />
  {#if used !== null}
    <progress
      class={[
        "progress ms-8 me-2 mb-1 h-1 w-auto",
        used > 1 - LOW_SPACE ? "progress-error" : "progress-primary",
      ]}
      value={used}
      max="1"
    ></progress>
  {/if}
</div>
