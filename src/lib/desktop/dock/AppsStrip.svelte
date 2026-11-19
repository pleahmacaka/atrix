<script lang="ts">
  import Icon from "@iconify/svelte"
  import { flip } from "svelte/animate"
  import MenuItem from "#lib/components/ui/MenuItem.svelte"
  import Popover, { type Placement } from "#lib/components/ui/Popover.svelte"
  import * as native from "#lib/desktop/native/index.js"
  import { m } from "#lib/paraglide/messages.js"
  import DockItem from "./DockItem.svelte"
  import { type DockGroup, dock } from "./dock.svelte"
  import type { DockLayout } from "./layout.svelte"
  import { dropTarget } from "./order"
  import { rem } from "./rem.svelte"

  let { layout, placement }: { layout: DockLayout; placement: Placement } = $props()

  let toolbar = $state<HTMLElement>()
  let overflowOpen = $state(false)

  const device = $derived(layout.device)

  const foreground = $derived(dock.windows[0]?.hwnd)

  const open = (group: DockGroup) => {
    overflowOpen = false

    const [first] = group.windows

    if (first) {
      native.activateWindow(first.hwnd).catch(() => undefined)
    } else {
      native.launchApp(group.path).catch(() => undefined)
    }
  }

  // the whole dock is the drop zone, so the empty space beside the first icon and the gaps still place a drop
  const track = (e: DragEvent) => {
    if (!layout.dragPath || !toolbar) {
      return
    }

    e.preventDefault()

    const slots = [...toolbar.querySelectorAll<HTMLElement>("[data-path]")]
    const target = dropTarget(
      layout.groups,
      layout.dragPath,
      slots.map(slot => {
        const box = slot.getBoundingClientRect()

        return { path: slot.dataset.path ?? "", midpoint: box.left + box.width / 2 }
      }),
      e.clientX,
      layout.hidden,
    )

    layout.dropPath = target?.path ?? null
    layout.dropBefore = target?.before ?? true
  }

  const drop = (e: DragEvent) => {
    if (!layout.dragPath) {
      return
    }

    e.preventDefault()
    track(e)
    layout.commitDrop()
  }
</script>

<svelte:window ondragover={track} ondrop={drop} />

<div
  bind:this={toolbar}
  bind:clientWidth={layout.appsWidth}
  role="toolbar"
  tabindex="-1"
  aria-label={m.dock_apps()}
  class="flex min-w-0 shrink-0 items-center gap-0.5"
  onpointerenter={() => (layout.magnet.target = 1)}
  onpointermove={e => (layout.pointerX = e.clientX)}
  onpointerleave={() => (layout.magnet.target = 0)}
>
  {#each layout.shown as group (group.key)}
    <div animate:flip={{ duration: 120 }} class="flex" data-path={group.path}>
      <DockItem
        {group}
        size={device.dockIconSize}
        edge={device.dockEdge}
        mac={layout.mac}
        {foreground}
        hiddenHere={layout.hidden.has(group.path)}
        pointerX={layout.pointerX}
        strength={layout.magnet.current}
        dragging={layout.dragPath === group.path}
        dropBefore={layout.dropPath === group.path && layout.dropBefore}
        dropAfter={layout.dropPath === group.path && !layout.dropBefore}
        ondragstart={() => (layout.dragPath = group.path)}
        ondragend={() => {
          layout.dragPath = null
          layout.dropPath = null
        }}
      />
    </div>
  {/each}

  {#if layout.spilled.length > 0}
    <Popover label={m.dock_more_apps()} {placement} width="w-64" bind:open={overflowOpen}>
      {#snippet trigger(p)}
        <button
          {...p}
          type="button"
          class={["btn btn-ghost btn-square", overflowOpen && "bg-primary/8 text-primary"]}
          style:width={rem(device.dockIconSize + 16)}
          style:height={rem(device.dockIconSize + 16)}
          title={m.dock_more({ count: layout.spilled.length })}
          aria-label={m.dock_more({ count: layout.spilled.length })}
        >
          <Icon icon="lucide:ellipsis" class="size-5" />
        </button>
      {/snippet}

      <div class="flex max-h-96 flex-col overflow-y-auto" role="menu" tabindex="-1">
        {#each layout.spilled as group (group.key)}
          <MenuItem
            icon={group.windows.length > 0 ? "lucide:app-window" : "lucide:box"}
            label={group.name}
            selected={group.windows.some(w => w.hwnd === foreground)}
            onclick={() => open(group)}
          />
        {/each}
      </div>
    </Popover>
  {/if}
</div>
