<script lang="ts">
import Icon from "@iconify/svelte"
import type { Snippet } from "svelte"
import MenuItem from "./MenuItem.svelte"
import { menuKeys } from "./menu.ts"
import { popoverMotion } from "./popover.ts"

const OPEN_MS = 120

const CLOSE_MS = 280

const uid = $props.id()

let {
  icon,
  label,
  value,
  disabled = false,
  children,
}: {
  icon?: string
  label: string
  value?: string
  disabled?: boolean
  children: Snippet
} = $props()

let root = $state<HTMLDivElement>()

let panel = $state<HTMLDivElement>()

let open = $state(false)

let timer: ReturnType<typeof setTimeout> | undefined

const anchor = `--${uid}`

const row = () => root?.querySelector<HTMLButtonElement>(":scope > button")

const show = (focus: boolean) => {
  clearTimeout(timer)

  if (!panel || disabled) {
    return
  }

  if (!panel.matches(":popover-open")) {
    panel.showPopover()
  }

  if (focus) {
    panel
      .querySelector<HTMLElement>("button:not(:disabled)")
      ?.focus({ preventScroll: true })
  }
}

const hide = () => {
  clearTimeout(timer)

  if (panel?.matches(":popover-open")) {
    panel.hidePopover()
  }
}

const later = (run: () => void, ms: number) => {
  clearTimeout(timer)
  timer = setTimeout(run, ms)
}

const hovering = (e: PointerEvent) => e.pointerType === "mouse"

const rowKeys = (e: KeyboardEvent) => {
  if (e.key === "ArrowRight") {
    e.preventDefault()
    show(true)
  }
}

const panelKeys = (e: KeyboardEvent) => {
  if (e.key === "ArrowLeft" || e.key === "Escape") {
    e.preventDefault()
    e.stopPropagation()
    hide()
    row()?.focus({ preventScroll: true })
  }
}

const picked = (e: MouseEvent) => {
  const item =
    e.target instanceof Element
      ? e.target.closest("[role^=menuitem]:not([aria-haspopup])")
      : null

  if (item && panel?.contains(item)) {
    hide()
  }
}

$effect(() => {
  const owner = root?.parentElement?.closest<HTMLElement>("[popover]")

  if (!owner) {
    return
  }

  const closed = (e: Event) => {
    if (e instanceof ToggleEvent && e.newState === "closed") {
      hide()
    }
  }

  owner.addEventListener("toggle", closed)

  return () => owner.removeEventListener("toggle", closed)
})

$effect(() => () => clearTimeout(timer))
</script>

<div bind:this={root} class="contents">
  <MenuItem
    {icon}
    {label}
    {disabled}
    selected={open}
    aria-haspopup="menu"
    aria-expanded={open}
    style="anchor-name: {anchor}"
    popovertarget={uid}
    popovertargetaction="show"
    onclick={e => show(e.detail === 0)}
    onkeydown={rowKeys}
    onpointerenter={e => hovering(e) && later(() => show(false), OPEN_MS)}
    onpointerleave={e => hovering(e) && later(hide, CLOSE_MS)}
  >
    {#snippet trailing()}
      {#if value}
        <span class="min-w-0 max-w-1/2 truncate text-xs opacity-60" title={value}>
          {value}
        </span>
      {/if}
      <Icon icon="lucide:chevron-right" class="size-4 shrink-0 opacity-60" />
    {/snippet}
  </MenuItem>

  <div
    bind:this={panel}
    id={uid}
    popover="auto"
    role="menu"
    aria-label={label}
    tabindex="-1"
    style:position-anchor={anchor}
    style:--area="inline-end span-block-end"
    class={[
      "popover-anchor popover-box fixed inset-auto mx-1 -mt-1 hidden max-h-80 min-w-52 max-w-xs",
      "flex-col overflow-y-auto p-1 text-sm text-base-content open:flex",
      popoverMotion,
    ]}
    ontoggle={e => (open = e.newState === "open")}
    onpointerenter={e => hovering(e) && clearTimeout(timer)}
    onpointerleave={e => hovering(e) && later(hide, CLOSE_MS)}
    onkeydown={panelKeys}
    onclick={picked}
    {@attach menuKeys}
  >
    {@render children()}
  </div>
</div>
