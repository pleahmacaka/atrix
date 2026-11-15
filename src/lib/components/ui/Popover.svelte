<script module lang="ts">
export type Placement =
  | "bottom-start"
  | "bottom-end"
  | "bottom"
  | "top-start"
  | "top-end"
  | "top"
  | "right"
  | "left"

export type PopoverTrigger = {
  popovertarget: string
  "aria-expanded": boolean
  "aria-haspopup": "dialog"
  style: string
}

const AREAS: Record<Placement, string> = {
  "bottom-start": "block-end span-inline-end",
  "bottom-end": "block-end span-inline-start",
  bottom: "block-end",
  "top-start": "block-start span-inline-end",
  "top-end": "block-start span-inline-start",
  top: "block-start",
  right: "inline-end span-block-end",
  left: "inline-start span-block-end",
}

const MARGINS: Record<Placement, string> = {
  "bottom-start": "my-1 me-1",
  "bottom-end": "my-1 ms-1",
  bottom: "m-1",
  "top-start": "my-1 me-1",
  "top-end": "my-1 ms-1",
  top: "m-1",
  right: "mx-1 mb-1",
  left: "mx-1 mb-1",
}
</script>

<script lang="ts">
import type { Snippet } from "svelte"
import type { ClassValue } from "svelte/elements"
import { popoverMotion, popoverSheet } from "./popover.ts"

const uid = $props.id()

let {
  id = uid,
  label,
  placement = "bottom-start",
  width = "w-max",
  sheet = false,
  anchor,
  open = $bindable(false),
  class: extra,
  trigger,
  children,
}: {
  id?: string
  label: string
  placement?: Placement
  width?: ClassValue
  sheet?: boolean
  anchor?: string
  open?: boolean
  class?: ClassValue
  trigger?: Snippet<[PopoverTrigger]>
  children: Snippet
} = $props()

let node = $state<HTMLDivElement>()

const name = $derived(anchor ?? `--${id}`)


$effect(() => {
  const shown = node?.matches(":popover-open")

  if (open && shown === false) {
    node?.showPopover()
  } else if (!open && shown) {
    node?.hidePopover()
  }
})

const toggled = (e: ToggleEvent) => {
  open = e.newState === "open"

  if (open) {
    node?.querySelector<HTMLElement>("[data-autofocus]")?.focus({ preventScroll: true })
  }
}

const leave = (e: FocusEvent) => {
  const next = e.relatedTarget
  const opener = document.querySelector(`[popovertarget="${id}"]`)

  if (next instanceof Node && !node?.contains(next) && !opener?.contains(next)) {
    open = false
  }
}
</script>

{@render trigger?.({
  popovertarget: id,
  "aria-expanded": open,
  "aria-haspopup": "dialog",
  style: `anchor-name: ${name}`,
})}

<div
  bind:this={node}
  {id}
  role="dialog"
  aria-label={label}
  popover="auto"
  style:position-anchor={name}
  style:--area={AREAS[placement]}
  class={[
    "popover-anchor popover-box nowheel fixed inset-auto max-h-120 max-w-viewport overflow-y-auto",
    "p-1 text-sm text-base-content",
    MARGINS[placement],
    popoverMotion,
    sheet && popoverSheet,
    width,
    extra,
  ]}
  ontoggle={toggled}
  onfocusout={leave}
>
  {@render children()}
</div>
