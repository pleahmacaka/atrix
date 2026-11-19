<script lang="ts">
import Segmented from "#lib/components/ui/Segmented.svelte"
import Select from "#lib/components/ui/Select.svelte"
import SettingRow from "#lib/components/ui/SettingRow.svelte"
import { listMonitors, type MonitorInfo } from "#lib/desktop/native/windows.ts"
import {
  type DeviceSettings,
  type DockAlign,
  type DockEdge,
  type DockEdgeOnly,
  type DockStyle,
  defaultDevice,
  isLastEntryPoint,
  type PanelPosition,
} from "#lib/desktop/settings/index.ts"
import { m } from "#lib/paraglide/messages.js"
import DesktopSection from "./DesktopSection.svelte"
import { desktopSettings } from "./desktop.svelte.ts"
import SteppedSetting from "./SteppedSetting.svelte"
import ToggleRow from "./ToggleRow.svelte"

let { device }: { device: DeviceSettings } = $props()

const set = desktopSettings.setDevice

const STYLES: { id: DockStyle; label: string }[] = [
  { id: "windows", label: m.desktop_dock_style_bar() },
  { id: "mac", label: m.desktop_dock_style_float() },
]

const EDGES: { id: DockEdge; label: string }[] = [
  { id: "bottom", label: m.desktop_edge_bottom() },
  { id: "top", label: m.desktop_edge_top() },
]

const ALIGNS: { id: DockAlign; label: string }[] = [
  { id: "start", label: m.desktop_left() },
  { id: "center", label: m.desktop_center() },
]

const EDGE_ONLY: { id: DockEdgeOnly; label: string }[] = [
  { id: "never", label: m.desktop_edge_only_never() },
  { id: "maximized", label: m.desktop_edge_only_maximized() },
  { id: "always", label: m.desktop_edge_only_always() },
]

const PANEL_POSITIONS: { id: PanelPosition; label: string }[] = [
  { id: "left", label: m.desktop_left() },
  { id: "center", label: m.desktop_center() },
  { id: "right", label: m.desktop_right() },
]

const HEIGHT = { min: 32, max: 140, step: 4, base: defaultDevice.dockHeight }

const WIDTH = { min: 320, max: 1400, step: 40, base: defaultDevice.dockWidth }

const GROWTH = {
  min: 0,
  max: 100,
  step: 5,
  base: Math.round(defaultDevice.dockGrowth * 100),
}

const ICON = { min: 16, max: 56, step: 4, base: defaultDevice.dockIconSize }

const DELAY = {
  min: 200,
  max: 3000,
  step: 200,
  base: defaultDevice.dockHideDelay,
}

const GAP = { min: 0, max: 48, step: 4, base: defaultDevice.dockIslandGap }

let monitors = $state<MonitorInfo[] | null>(null)

$effect(() => {
  listMonitors()
    .then(found => {
      monitors = found
    })
    .catch(() => undefined)
})

const monitorOptions = $derived([
  { value: null, label: m.desktop_auto() },
  ...(monitors ?? []).map(display => ({
    value: display.id,
    label: display.name,
    detail: `${display.width}×${display.height}`,
  })),
  ...(device.dockMonitor !== null &&
  monitors !== null &&
  !monitors.some(display => display.id === device.dockMonitor)
    ? [{ value: device.dockMonitor, label: m.desktop_monitor_missing() }]
    : []),
])

const floating = $derived(device.dockStyle === "mac")
</script>

<DesktopSection id="dock">
  <ToggleRow
    title={m.desktop_dock_enabled()}
    checked={device.features.dock}
    disabled={isLastEntryPoint(device.features, "dock")}
    onchange={on => set("features", { ...device.features, dock: on })}
  />
  {#if device.features.dock}
    <SettingRow title={m.desktop_dock_style()}>
      <Segmented
        label={m.desktop_dock_style()}
        items={STYLES}
        value={device.dockStyle}
        onpick={style => set("dockStyle", style)}
      />
    </SettingRow>
    <SettingRow title={m.desktop_position()}>
      <Segmented
        label={m.desktop_position()}
        items={EDGES}
        value={device.dockEdge}
        onpick={edge => set("dockEdge", edge)}
      />
    </SettingRow>
    <SettingRow title={m.desktop_dock_monitor()}>
      <Select
        class="w-44 max-sm:w-full"
        label={m.desktop_dock_monitor()}
        options={monitorOptions}
        value={device.dockMonitor}
        onchange={monitor => set("dockMonitor", monitor)}
      />
    </SettingRow>
    <SettingRow title={m.desktop_dock_align()}>
      <Segmented
        label={m.desktop_dock_align()}
        items={ALIGNS}
        value={device.dockAlign}
        onpick={align => set("dockAlign", align)}
      />
    </SettingRow>
    <SteppedSetting
      title={m.desktop_dock_height()}
      value={device.dockHeight}
      range={HEIGHT}
      unit={m.desktop_unit_px()}
      onchange={height => set("dockHeight", height)}
    />
    {#if floating}
      <SteppedSetting
        title={m.desktop_dock_width()}
        value={device.dockWidth}
        range={WIDTH}
        unit={m.desktop_unit_px()}
        onchange={width => set("dockWidth", width)}
      />
      <SteppedSetting
        title={m.desktop_dock_growth()}
        value={Math.round(device.dockGrowth * 100)}
        range={GROWTH}
        unit={m.desktop_unit_percent()}
        onchange={growth => set("dockGrowth", growth / 100)}
      />
    {/if}
    <SteppedSetting
      title={m.desktop_dock_icon_size()}
      value={device.dockIconSize}
      range={ICON}
      unit={m.desktop_unit_px()}
      onchange={size => set("dockIconSize", size)}
    />
    <ToggleRow
      title={m.desktop_dock_autohide()}
      checked={device.dockAutoHide}
      onchange={on => set("dockAutoHide", on)}
    />
    {#if device.dockAutoHide}
      <SteppedSetting
        title={m.desktop_dock_hide_delay()}
        value={device.dockHideDelay}
        range={DELAY}
        unit={m.desktop_unit_ms()}
        onchange={delay => set("dockHideDelay", delay)}
      />
      <SettingRow title={m.desktop_dock_edge_only()}>
        <Segmented
          label={m.desktop_dock_edge_only()}
          items={EDGE_ONLY}
          value={device.dockEdgeOnly}
          onpick={edgeOnly => set("dockEdgeOnly", edgeOnly)}
        />
      </SettingRow>
    {/if}
    <ToggleRow
      title={m.desktop_dock_fullscreen()}
      checked={device.dockFullscreenReveal}
      onchange={on => set("dockFullscreenReveal", on)}
    />
    {#if floating}
      <ToggleRow
        title={m.desktop_dock_behind()}
        checked={device.dockDesktop}
        onchange={on => set("dockDesktop", on)}
      />
    {/if}
    <ToggleRow
      title={m.desktop_hide_taskbar()}
      checked={device.hideSystemTaskbar}
      onchange={on => set("hideSystemTaskbar", on)}
    />
    <ToggleRow
      title={m.desktop_dock_islands()}
      checked={device.dockIslands}
      onchange={on => set("dockIslands", on)}
    />
    {#if device.dockIslands}
      <SteppedSetting
        title={m.desktop_dock_island_gap()}
        value={device.dockIslandGap}
        range={GAP}
        unit={m.desktop_unit_px()}
        onchange={gap => set("dockIslandGap", gap)}
      />
    {/if}
    {#if device.features.launcher}
      <ToggleRow
        title={m.desktop_dock_launcher_button()}
        checked={device.showLauncherButton}
        onchange={on => set("showLauncherButton", on)}
      />
    {/if}
  {/if}
</DesktopSection>

{#if device.features.dock}
  <DesktopSection id="topbar">
    <ToggleRow
      title={m.desktop_topbar_enabled()}
      checked={device.topBar}
      onchange={on => set("topBar", on)}
    />
  </DesktopSection>
{/if}

<DesktopSection id="panel">
  <SettingRow title={m.desktop_position()}>
    <Segmented
      label={m.desktop_position()}
      items={PANEL_POSITIONS}
      value={device.panelPosition}
      onpick={position => set("panelPosition", position)}
    />
  </SettingRow>
</DesktopSection>
