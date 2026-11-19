<script lang="ts">
import Segmented from "#lib/components/ui/Segmented.svelte"
import Select from "#lib/components/ui/Select.svelte"
import SettingRow from "#lib/components/ui/SettingRow.svelte"
import { editMode } from "#lib/desktop/native/dock.ts"
import { listMonitors, type MonitorInfo } from "#lib/desktop/native/windows.ts"
import {
  type DeviceSettings,
  type DockEdge,
  type DockEdgeOnly,
  type DockStyle,
  isLastEntryPoint,
  type PanelPosition,
} from "#lib/desktop/settings/index.ts"
import { m } from "#lib/paraglide/messages.js"
import CalendarTab from "./CalendarTab.svelte"
import DesktopSection from "./DesktopSection.svelte"
import DockIcon from "./DockIcon.svelte"
import { desktopSettings } from "./desktop.svelte.ts"
import PresetSetting from "./PresetSetting.svelte"
import ToggleRow from "./ToggleRow.svelte"

let {
  device,
  page,
}: { device: DeviceSettings; page: "dock" | "topbar" | "panel" } = $props()

const set = desktopSettings.setDevice

const STYLES: { id: DockStyle; label: string }[] = [
  { id: "windows", label: m.desktop_dock_style_bar() },
  { id: "mac", label: m.desktop_dock_style_float() },
]

const EDGES: { id: DockEdge; label: string }[] = [
  { id: "bottom", label: m.desktop_edge_bottom() },
  { id: "top", label: m.desktop_edge_top() },
]

const EDGE_ONLY: { id: DockEdgeOnly; label: string }[] = [
  { id: "never", label: m.desktop_off() },
  { id: "maximized", label: m.desktop_edge_only_maximized() },
  { id: "always", label: m.desktop_edge_only_always() },
]

const PANEL_POSITIONS: { id: PanelPosition; label: string }[] = [
  { id: "left", label: m.desktop_left() },
  { id: "center", label: m.desktop_center() },
  { id: "right", label: m.desktop_right() },
]

const HEIGHTS = [
  { value: 40, label: m.desktop_low() },
  { value: 48, label: m.desktop_normal() },
  { value: 64, label: m.desktop_high() },
]

const ICON_SIZES = [
  { value: 20, label: m.desktop_small() },
  { value: 24, label: m.desktop_normal() },
  { value: 32, label: m.desktop_large() },
]

const WIDTHS = [
  { value: 560, label: m.desktop_narrow() },
  { value: 720, label: m.desktop_normal() },
  { value: 960, label: m.desktop_wide() },
]

const GROWTHS = [
  { value: 0, label: m.desktop_off() },
  { value: 0.25, label: m.desktop_little() },
  { value: 0.5, label: m.desktop_much() },
]

const DELAYS = [
  { value: 400, label: m.desktop_fast() },
  { value: 1000, label: m.desktop_normal() },
  { value: 2000, label: m.desktop_slow() },
]

const GAPS = [
  { value: 4, label: m.desktop_narrow() },
  { value: 8, label: m.desktop_normal() },
  { value: 16, label: m.desktop_wide() },
]

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

const dockLocked = $derived(isLastEntryPoint(device.features, "dock"))
</script>

{#if page === "dock"}
  <DesktopSection id="dock">
    <ToggleRow
      title={m.desktop_dock_enabled()}
      tip={dockLocked ? m.desktop_last_entry_tip() : m.desktop_dock_enabled_tip()}
      checked={device.features.dock}
      disabled={dockLocked}
      onchange={on => set("features", { ...device.features, dock: on })}
    />
  </DesktopSection>
  {#if device.features.dock}
    <DesktopSection title={m.desktop_group_dock_style()}>
      <SettingRow title={m.desktop_dock_style()} tip={m.desktop_dock_style_tip()}>
        <Segmented
          label={m.desktop_dock_style()}
          items={STYLES}
          value={device.dockStyle}
          onpick={style => set("dockStyle", style)}
        />
      </SettingRow>
      <SettingRow title={m.desktop_position()} tip={m.desktop_dock_edge_tip()}>
        <Segmented
          label={m.desktop_position()}
          items={EDGES}
          value={device.dockEdge}
          onpick={edge => set("dockEdge", edge)}
        />
      </SettingRow>
      <SettingRow title={m.desktop_dock_monitor()} tip={m.desktop_dock_monitor_tip()}>
        <Select
          class="w-44 max-sm:w-full"
          label={m.desktop_dock_monitor()}
          options={monitorOptions}
          value={device.dockMonitor}
          onchange={monitor => set("dockMonitor", monitor)}
        />
      </SettingRow>
      {#if floating}
        <ToggleRow
          title={m.desktop_dock_behind()}
          tip={m.desktop_dock_behind_tip()}
          checked={device.dockDesktop}
          onchange={on => set("dockDesktop", on)}
        />
      {/if}
    </DesktopSection>

    <DesktopSection title={m.desktop_group_dock_size()}>
      <PresetSetting
        title={m.desktop_dock_height()}
        tip={m.desktop_dock_height_tip()}
        value={device.dockHeight}
        presets={HEIGHTS}
        onchange={height => set("dockHeight", height)}
      />
      <PresetSetting
        title={m.desktop_dock_icon_size()}
        tip={m.desktop_dock_icon_size_tip()}
        value={device.dockIconSize}
        presets={ICON_SIZES}
        onchange={size => set("dockIconSize", size)}
      />
      {#if floating}
        <PresetSetting
          title={m.desktop_dock_width()}
          tip={m.desktop_dock_width_tip()}
          value={device.dockWidth}
          presets={WIDTHS}
          onchange={width => set("dockWidth", width)}
        />
        <PresetSetting
          title={m.desktop_dock_growth()}
          tip={m.desktop_dock_growth_tip()}
          value={device.dockGrowth}
          presets={GROWTHS}
          onchange={growth => set("dockGrowth", growth)}
        />
      {/if}
    </DesktopSection>

    <DesktopSection title={m.desktop_group_dock_hide()}>
      <ToggleRow
        title={m.desktop_dock_autohide()}
        tip={m.desktop_dock_autohide_tip()}
        checked={device.dockAutoHide}
        onchange={on => set("dockAutoHide", on)}
      />
      {#if device.dockAutoHide}
        <PresetSetting
          title={m.desktop_dock_hide_delay()}
          tip={m.desktop_dock_hide_delay_tip()}
          value={device.dockHideDelay}
          presets={DELAYS}
          onchange={delay => set("dockHideDelay", delay)}
        />
        <ToggleRow
          title={m.desktop_dock_hide_animation()}
          tip={m.desktop_dock_hide_animation_tip()}
          checked={device.dockHideAnimation}
          onchange={on => set("dockHideAnimation", on)}
        />
        <SettingRow title={m.desktop_dock_edge_only()} tip={m.desktop_dock_edge_only_tip()}>
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
        tip={m.desktop_dock_fullscreen_tip()}
        checked={device.dockFullscreenReveal}
        onchange={on => set("dockFullscreenReveal", on)}
      />
    </DesktopSection>

    <DesktopSection title={m.desktop_group_dock_layout()}>
      <ToggleRow
        title={m.desktop_dock_islands()}
        tip={m.desktop_dock_islands_tip()}
        checked={device.dockIslands}
        onchange={on => set("dockIslands", on)}
      />
      {#if device.dockIslands}
        <PresetSetting
          title={m.desktop_dock_island_gap()}
          tip={m.desktop_dock_island_gap_tip()}
          value={device.dockIslandGap}
          presets={GAPS}
          onchange={gap => set("dockIslandGap", gap)}
        />
      {/if}
      {#if device.features.launcher}
        <ToggleRow
          title={m.desktop_dock_launcher_button()}
          tip={m.desktop_dock_launcher_button_tip()}
          checked={device.showLauncherButton}
          onchange={on => set("showLauncherButton", on)}
        />
        {#if device.showLauncherButton}
          <DockIcon {device} />
        {/if}
      {/if}
      <SettingRow title={m.desktop_edit_layout()} tip={m.desktop_edit_layout_tip()}>
        <button
          type="button"
          class="btn btn-sm"
          onclick={() => desktopSettings.saving.run(() => editMode(true))}
        >
          {m.desktop_edit_start()}
        </button>
      </SettingRow>
    </DesktopSection>

    <DesktopSection title={m.desktop_group_windows_taskbar()}>
      <ToggleRow
        title={m.desktop_hide_taskbar()}
        tip={m.desktop_hide_taskbar_tip()}
        checked={device.hideSystemTaskbar}
        onchange={on => set("hideSystemTaskbar", on)}
      />
    </DesktopSection>
  {/if}
{:else if page === "topbar"}
  <DesktopSection id="topbar">
    <ToggleRow
      title={m.desktop_topbar_enabled()}
      tip={m.desktop_topbar_enabled_tip()}
      checked={device.topBar}
      onchange={on => set("topBar", on)}
    />
  </DesktopSection>
{:else}
  <DesktopSection id="panel" title={m.desktop_group_panel()}>
    <SettingRow title={m.desktop_position()} tip={m.desktop_panel_position_tip()}>
      <Segmented
        label={m.desktop_position()}
        items={PANEL_POSITIONS}
        value={device.panelPosition}
        onpick={position => set("panelPosition", position)}
      />
    </SettingRow>
  </DesktopSection>
  <CalendarTab title={m.settings_calendar()} />
{/if}
