<script lang="ts">
import Icon from "@iconify/svelte"
import { fade } from "svelte/transition"
import IconButton from "#lib/components/ui/IconButton.svelte"
import { m } from "#lib/paraglide/messages.js"
import { write } from "../pty"
import Terminal from "../Terminal.svelte"
import DragGhost from "./DragGhost.svelte"
import { drag, onTabDrop } from "./drag.svelte"
import {
  type Divider,
  isSplit,
  panesOf,
  place,
  type Rect,
  type Side,
  sideAt,
} from "./layout"
import { bindPty, closePane, dropTab, session, type Tab } from "./tabs.svelte"

let { visible = true }: { visible?: boolean } = $props()

const MIN_PANE = 80

const CORNER = { x: 120, y: 80 }

const DROPS: Record<Side | "center", { icon: string; label: () => string }> = {
  left: { icon: "lucide:panel-left", label: m.terminal_drop_left },
  right: { icon: "lucide:panel-right", label: m.terminal_drop_right },
  top: { icon: "lucide:panel-top", label: m.terminal_drop_top },
  bottom: { icon: "lucide:panel-bottom", label: m.terminal_drop_bottom },
  center: { icon: "lucide:arrow-left-right", label: m.terminal_drop_center },
}

const ESC = "\u001b"

let area = $state<HTMLElement>()

let near = $state(false)

const current = $derived(session.tabs[session.active])

const placed = $derived(
  session.tabs.flatMap(tab =>
    place(tab.root).panes.map(entry => ({ tab, ...entry })),
  ),
)

const dividers = $derived(current ? place(current.root).dividers : [])

const target = $derived.by(() => {
  if (drag.tab === null || !area || !current || current.id === drag.tab) {
    return null
  }

  const box = area.getBoundingClientRect()
  const x = (drag.x - box.left) / box.width
  const y = (drag.y - box.top) / box.height
  const hit = place(current.root).panes.find(
    ({ rect }) =>
      x >= rect.x && x < rect.x + rect.w && y >= rect.y && y < rect.y + rect.h,
  )

  if (!hit) {
    return null
  }

  const side = sideAt(
    (x - hit.rect.x) / hit.rect.w,
    (y - hit.rect.y) / hit.rect.h,
  )
  const source = session.tabs.find(tab => tab.id === drag.tab)

  if (side === "center" && (!source || isSplit(source.root))) {
    return null
  }

  return { pane: hit.pane, rect: hit.rect, side }
})

const half = (rect: Rect, side: Side | "center"): Rect => {
  switch (side) {
    case "left":
      return { ...rect, w: rect.w / 2 }
    case "right":
      return { ...rect, x: rect.x + rect.w / 2, w: rect.w / 2 }
    case "top":
      return { ...rect, h: rect.h / 2 }
    case "bottom":
      return { ...rect, y: rect.y + rect.h / 2, h: rect.h / 2 }
    case "center":
      return rect
  }
}

const preview = $derived(target ? half(target.rect, target.side) : null)

$effect(() =>
  onTabDrop(tab => {
    if (!target) {
      return false
    }

    dropTab(tab, target.pane, target.side)

    return true
  }),
)

// terminal replies (cursor and device reports, focus and mouse events) also arrive through onData
const isReply = (data: string) => {
  if (data.startsWith(`${ESC}]`)) {
    return true
  }

  if (!data.startsWith(`${ESC}[`)) {
    return false
  }

  const body = [...data.slice(2, -1)]

  return (
    "RcnIOmM".includes(data.at(-1) ?? "") &&
    body.every(c => "0123456789;?<>".includes(c))
  )
}

const share = (tab: Tab, from: number, data: string) => {
  if (!tab.sync || isReply(data)) {
    return
  }

  for (const pane of panesOf(tab.root)) {
    if (pane.id !== from && pane.pty !== null) {
      write(pane.pty, data)
    }
  }
}

const resize = (e: PointerEvent, divider: Divider) => {
  if (!area || e.button !== 0) {
    return
  }

  e.preventDefault()

  const box = area.getBoundingClientRect()
  const row = divider.split.dir === "row"
  const extent = row ? divider.rect.w * box.width : divider.rect.h * box.height
  const origin = row
    ? box.left + divider.rect.x * box.width
    : box.top + divider.rect.y * box.height
  const sizes = divider.split.sizes
  const total = sizes.reduce((sum, size) => sum + size, 0)
  const min = Math.min(MIN_PANE / extent, divider.span / 2)

  const move = (p: PointerEvent) => {
    const at = ((row ? p.clientX : p.clientY) - origin) / extent
    const share = Math.min(Math.max(at - divider.start, min), divider.span - min)

    sizes[divider.index] = share * total
    sizes[divider.index + 1] = (divider.span - share) * total
  }

  const up = () => {
    window.removeEventListener("pointermove", move)
    window.removeEventListener("pointerup", up)
  }

  window.addEventListener("pointermove", move)
  window.addEventListener("pointerup", up)
}

const equalize = (divider: Divider) => {
  divider.split.sizes = divider.split.sizes.map(() => 1)
}

const onpointermove = (e: PointerEvent) => {
  const box = area?.getBoundingClientRect()

  near =
    !!box &&
    box.right - e.clientX < CORNER.x &&
    e.clientY - box.top < CORNER.y
}
</script>

<main
  bind:this={area}
  class="relative min-h-0 min-w-0 flex-1 overflow-hidden bg-base-100"
  {onpointermove}
  onpointerleave={() => (near = false)}
>
  {#each placed as item (item.pane.id)}
    {@const shown = item.tab === current}
    {@const focused = item.tab.focus === item.pane.id}
    {@const split = isSplit(item.tab.root)}
    <div
      class={["absolute", split && "p-1", !shown && "invisible"]}
      style:left="{item.rect.x * 100}%"
      style:top="{item.rect.y * 100}%"
      style:width="{item.rect.w * 100}%"
      style:height="{item.rect.h * 100}%"
      onpointerdowncapture={() => (item.tab.focus = item.pane.id)}
    >
      <div
        class={[
          "size-full overflow-hidden",
          split && "rounded-field border transition-colors duration-140",
          split && item.tab.sync && "border-warning/60",
          split && !item.tab.sync && focused && "border-primary/40",
          split && !item.tab.sync && !focused && "border-base-300",
        ]}
      >
        <Terminal
          shell={item.pane.shell}
          cwd={item.pane.cwd}
          pty={item.pane.pty}
          run={item.pane.run}
          active={visible && shown && focused}
          shown={visible && shown}
          ontitle={title => (item.pane.title = title || item.pane.title)}
          oninput={data => share(item.tab, item.pane.id, data)}
          onexit={() => closePane(item.pane.id)}
          onpty={id => bindPty(item.pane.id, id)}
        />
      </div>
    </div>
  {/each}

  {#each dividers as divider (`${divider.split.id}:${divider.index}`)}
    {@const row = divider.split.dir === "row"}
    <button
      type="button"
      aria-label={m.terminal_pane_resize()}
      class={[
        "absolute z-10 flex items-center justify-center",
        "before:rounded-full before:transition-colors before:duration-140",
        "hover:before:bg-primary/60 active:before:bg-primary",
        row
          ? "w-2 -translate-x-1/2 cursor-col-resize before:h-full before:w-0.5"
          : "h-2 -translate-y-1/2 cursor-row-resize before:h-0.5 before:w-full",
      ]}
      style:left="{(row
        ? divider.rect.x + divider.at * divider.rect.w
        : divider.rect.x) * 100}%"
      style:top="{(row
        ? divider.rect.y
        : divider.rect.y + divider.at * divider.rect.h) * 100}%"
      style:width={row ? undefined : `${divider.rect.w * 100}%`}
      style:height={row ? `${divider.rect.h * 100}%` : undefined}
      onpointerdown={e => resize(e, divider)}
      ondblclick={() => equalize(divider)}
    ></button>
  {/each}

  {#if target && preview}
    {@const drop = DROPS[target.side]}
    <div
      class="pointer-events-none absolute z-20 p-1.5 transition-all duration-140"
      style:left="{preview.x * 100}%"
      style:top="{preview.y * 100}%"
      style:width="{preview.w * 100}%"
      style:height="{preview.h * 100}%"
      transition:fade={{ duration: 140 }}
    >
      <div
        class={[
          "flex size-full items-center justify-center rounded-box",
          "border border-primary/40 bg-primary/8",
        ]}
      >
        <span
          class={[
            "flex items-center gap-1.5 rounded-full bg-primary px-3 py-1",
            "text-xs font-medium whitespace-nowrap text-primary-content",
          ]}
        >
          <Icon icon={drop.icon} class="size-3.5" />
          {drop.label()}
        </span>
      </div>
    </div>
  {/if}

  {#if current && isSplit(current.root)}
    <div
      class={[
        "absolute end-3 top-2 z-30 transition-opacity duration-140",
        near || current.sync
          ? "opacity-100"
          : [
              "pointer-events-none opacity-0",
              "focus-within:pointer-events-auto focus-within:opacity-100",
            ],
      ]}
    >
      <IconButton
        icon="lucide:radio-tower"
        label={m.terminal_sync()}
        aria-pressed={current.sync}
        tone={current.sync ? "warning" : "ghost"}
        class="bg-raised shadow-sm"
        onclick={() => (current.sync = !current.sync)}
      />
    </div>
  {/if}
</main>

<DragGhost />
