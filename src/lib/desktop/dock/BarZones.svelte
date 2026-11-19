<script lang="ts">
  import type { Placement } from "#lib/components/ui/Popover.svelte"
  import { editing } from "#lib/desktop/edit/edit.svelte.ts"
  import type { ShellZone, ShellZoneId } from "#lib/desktop/settings/index.ts"
  import BarGroup from "./BarGroup.svelte"
  import type { DockLayout } from "./layout.svelte"
  import { rem } from "./rem.svelte"
  import type { TrayStatus } from "./tray/status.svelte"
  import { visibleItems, ZONES } from "./zones"

  type Props = {
    layout: DockLayout
    status: TrayStatus
    panelOpen: boolean
    onclock: () => void
  }

  let { layout, status, panelOpen, onclock }: Props = $props()

  const COMPACT_BELOW = 40

  const JUSTIFY: Record<ShellZoneId, string> = {
    start: "justify-start",
    center: "justify-center",
    end: "justify-end",
  }

  const PLACEMENTS: Record<"top" | "bottom", Record<ShellZoneId, Placement>> = {
    top: { start: "bottom-start", center: "bottom", end: "bottom-end" },
    bottom: { start: "top-start", center: "top", end: "top-end" },
  }

  const device = $derived(layout.device)

  const gap = $derived(device.dockIslands ? device.dockIslandGap : 8)

  const grows = (id: ShellZoneId) => (layout.centered ? id !== "center" : id === "center")

  const compactOf = (zone: ShellZone) =>
    zone.size === "compact" ||
    (zone.size === "auto" && layout.contentHeight < COMPACT_BELOW)
</script>

{#each ZONES as id (id)}
  {@const zone = layout.bar[id]}

  <div
    class={[
      "flex h-full min-w-0 items-center transition-shadow",
      grows(id) ? "flex-1 basis-0" : "shrink-0",
      JUSTIFY[zone.align],
      editing.on && "rounded-field ring-1 ring-primary/40",
    ]}
  >
    <div
      class="relative flex h-full shrink-0 items-center"
      style:gap={rem(gap)}
      bind:clientWidth={layout.zoneWidth[id]}
    >
      {#each zone.groups as group (group.id)}
        {@const items = visibleItems(group, device)}

        {#if items.length > 0}
          <BarGroup
            {items}
            {layout}
            {status}
            compact={compactOf(zone)}
            placement={PLACEMENTS[layout.edge][id]}
            {panelOpen}
            {onclock}
          />
        {/if}
      {/each}
    </div>
  </div>
{/each}
