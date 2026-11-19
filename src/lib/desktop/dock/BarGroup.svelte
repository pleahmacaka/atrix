<script lang="ts">
  import type { ShellItem, ShellItemKind } from "@atrix/settings"
  import type { Placement } from "#lib/components/ui/Popover.svelte"
  import { contextMenu } from "#lib/store/contextMenu.svelte.ts"
  import BarItem from "./BarItem.svelte"
  import type { DockLayout } from "./layout.svelte"
  import { rem } from "./rem.svelte"
  import { itemMenu } from "./tray/menus"
  import type { TrayStatus } from "./tray/status.svelte"

  type Props = {
    items: ShellItem[]
    layout: DockLayout
    status: TrayStatus
    compact: boolean
    placement: Placement
    panelOpen: boolean
    onclock: () => void
  }

  let { items, layout, status, compact, placement, panelOpen, onclock }: Props = $props()

  let width = $state(0)

  const island = $derived(layout.device.dockIslands)

  const menu = (e: MouseEvent) => {
    const owner =
      e.target instanceof Element ? e.target.closest<HTMLElement>("[data-kind]") : null
    const kind = owner?.dataset.kind as ShellItemKind | undefined

    if (kind) {
      contextMenu.show(e, itemMenu(kind, status.info.volume, status.toggleMute))
    }
  }
</script>

<fieldset
  class={[
    "flex h-full items-center",
    island && "rounded-box border border-base-300 bg-base-100 px-1",
    width === 0 && "invisible absolute",
  ]}
  style:height={island ? rem(layout.contentHeight) : undefined}
  oncontextmenu={menu}
>
  <div class="flex h-full items-center gap-0.5" bind:clientWidth={width}>
    {#each items as item (item.id)}
      <BarItem {item} {layout} {status} {compact} {placement} {panelOpen} {onclock} />
    {/each}
  </div>
</fieldset>
