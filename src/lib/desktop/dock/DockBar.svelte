<script lang="ts">
  import { m } from "#lib/paraglide/messages.js"
  import { contextMenu } from "#lib/store/contextMenu.svelte.ts"
  import BarZones from "./BarZones.svelte"
  import type { DockLayout } from "./layout.svelte"
  import { rem } from "./rem.svelte"
  import { barMenu } from "./tray/menus"
  import type { TrayStatus } from "./tray/status.svelte"

  type Props = {
    layout: DockLayout
    status: TrayStatus
    panelOpen: boolean
    onclock: () => void
  }

  let { layout, status, panelOpen, onclock }: Props = $props()

  const top = $derived(layout.edge === "top")

  const band = $derived.by(() => {
    const fill = layout.device.dockIslands ? "bg-base-200" : "bg-base-100"

    if (layout.mac) {
      return [fill, "rounded-box border border-base-300 shadow-lg"]
    }

    return [fill, "border-base-300", top ? "border-b" : "border-t"]
  })
</script>

<div class={["relative flex h-full flex-col select-none", top ? "justify-start" : "justify-end"]}>
  {#if layout.collapsed || layout.dockHidden}
    <div class="size-full" aria-hidden="true"></div>
  {:else}
    <nav
      class={[
        "flex shrink-0 items-center gap-2 px-2 transition",
        band,
        layout.hiding && ["opacity-0", top ? "-translate-y-full" : "translate-y-full"],
      ]}
      style:height={rem(layout.barHeight)}
      aria-label={m.dock_dock()}
      bind:offsetWidth={layout.navWidth}
      oncontextmenu={e => contextMenu.show(e, barMenu())}
    >
      <BarZones {layout} {status} {panelOpen} {onclock} />
    </nav>
  {/if}
</div>
