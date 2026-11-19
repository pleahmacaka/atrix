<script lang="ts">
  import Icon from "@iconify/svelte"
  import IconButton from "#lib/components/ui/IconButton.svelte"
  import type { Placement } from "#lib/components/ui/Popover.svelte"
  import * as native from "#lib/desktop/native/index.js"
  import type { ShellItem } from "#lib/desktop/settings/index.ts"
  import { m } from "#lib/paraglide/messages.js"
  import AppsStrip from "./AppsStrip.svelte"
  import Bluetooth from "./Bluetooth.svelte"
  import ClaudeUsage from "./ClaudeUsage.svelte"
  import Clock from "./Clock.svelte"
  import InputLanguage from "./InputLanguage.svelte"
  import type { DockLayout } from "./layout.svelte"
  import Media from "./Media.svelte"
  import Meters from "./Meters.svelte"
  import Network from "./Network.svelte"
  import NotifyIcons from "./NotifyIcons.svelte"
  import { rem } from "./rem.svelte"
  import { openSettings } from "./tray/menus"
  import { batteryIcon, batteryTitle } from "./tray/policy"
  import type { TrayStatus } from "./tray/status.svelte"
  import VolumeControl from "./VolumeControl.svelte"

  type Props = {
    item: ShellItem
    layout: DockLayout
    status: TrayStatus
    compact: boolean
    placement: Placement
    panelOpen: boolean
    onclock: () => void
  }

  let { item, layout, status, compact, placement, panelOpen, onclock }: Props = $props()

  const device = $derived(layout.device)

  const size = $derived(compact ? "xs" : "sm")

  const quick = (action: native.QuickAction) => {
    native.quickAction(action).catch(() => undefined)
  }

  const updateTray = (patch: { trayOrder?: string[]; trayHidden?: string[] }) =>
    layout.patch(patch)

</script>

<div class="contents" data-kind={item.kind}>
  {#if item.kind === "launcher"}
    <button
      type="button"
      class={["btn btn-ghost btn-square", compact && "btn-sm"]}
      style:width={compact ? undefined : rem(device.dockIconSize + 16)}
      style:height={compact ? undefined : rem(device.dockIconSize + 16)}
      title={m.dock_launcher()}
      aria-label={m.dock_open_launcher()}
      onclick={() => native.toggleWindow("launcher").catch(() => undefined)}
    >
      <img
        src={device.dockIcon ?? "/favicon.svg"}
        alt=""
        draggable="false"
        class={["object-contain", compact && "size-4"]}
        style:width={compact ? undefined : rem(device.dockIconSize)}
        style:height={compact ? undefined : rem(device.dockIconSize)}
      />
    </button>
  {:else if item.kind === "apps"}
    <AppsStrip {layout} {placement} />
  {:else if item.kind === "taskview"}
    <IconButton
      icon="lucide:layout-grid"
      label={m.dock_task_view()}
      {size}
      onclick={() => quick("taskview")}
    />
  {:else if item.kind === "claude"}
    <ClaudeUsage
      source={device.claudeUsageSource}
      {compact}
      stacked={device.claudeUsageStacked}
      {placement}
    />
  {:else if item.kind === "tray"}
    <NotifyIcons
      {compact}
      edge={layout.edge}
      {placement}
      order={device.trayOrder}
      hidden={device.trayHidden}
      onreorder={order => updateTray({ trayOrder: order })}
      onhide={hidden => updateTray({ trayHidden: hidden })}
    />
  {:else if item.kind === "media"}
    <Media
      {compact}
      spectrum={device.showSpectrum}
      spectrumStyle={device.spectrumStyle}
      {placement}
    />
  {:else if item.kind === "input"}
    <InputLanguage {compact} />
  {:else if item.kind === "meters"}
    <Meters stacked={device.metersStacked} {compact} {placement} />
  {:else if item.kind === "network"}
    <Network {compact} {placement} />
  {:else if item.kind === "bluetooth"}
    <Bluetooth {compact} {placement} />
  {:else if item.kind === "battery"}
    {#if status.info.battery}
      <div
        class="flex items-center gap-1 px-1.5 text-xs tabular-nums"
        title={batteryTitle(status.info.battery)}
        role="status"
      >
        <Icon icon={batteryIcon(status.info.battery)} class="size-4" />
        <span>{status.info.battery.percent}%</span>
      </div>
    {/if}
  {:else if item.kind === "volume"}
    {#if status.info.volume}
      <VolumeControl
        volume={status.info.volume}
        {compact}
        {placement}
        onchange={status.setVolume}
        ontogglemute={status.toggleMute}
      />
    {/if}
  {:else if item.kind === "clock"}
    <Clock
      clock24h={device.clock24h}
      showSeconds={device.showSeconds}
      align={device.clockAlign}
      active={panelOpen}
      {compact}
      onclick={onclock}
    />
  {:else if item.kind === "bell"}
    <button
      type="button"
      class={["btn btn-ghost btn-square relative", compact ? "btn-xs" : "btn-sm"]}
      title={m.dock_notifications()}
      aria-label={m.dock_open_notifications()}
      onclick={status.openNotices}
    >
      <Icon icon={status.unseen > 0 ? "lucide:bell-dot" : "lucide:bell"} class="size-4" />

      {#if status.unseen > 0}
        <span
          class={[
            "badge badge-primary badge-xs absolute -top-1 -right-1 px-1",
            "tabular-nums",
          ]}
          aria-hidden="true"
        >
          {Math.min(status.unseen, 99)}
        </span>
      {/if}
    </button>
  {:else if item.kind === "settings"}
    <IconButton icon="lucide:settings" label={m.common_settings()} {size} onclick={openSettings} />
  {:else if item.kind === "desktop"}
    <button
      type="button"
      class={[
        "h-3/5 w-2 shrink-0 cursor-pointer rounded-field border-l",
        "border-base-300",
        "transition-colors hover:bg-base-content/10",
      ]}
      title={m.dock_show_desktop()}
      aria-label={m.dock_show_desktop()}
      onclick={() => quick("desktop")}
    ></button>
  {:else if item.kind === "separator"}
    <span class="mx-1 h-1/2 border-l border-base-300" aria-hidden="true"></span>
  {/if}
</div>
