<script lang="ts">
import { Attempt } from "#lib/components/ui/attempt.svelte.ts"
import ErrorAlert from "#lib/components/ui/ErrorAlert.svelte"
import Segmented from "#lib/components/ui/Segmented.svelte"
import SettingRow from "#lib/components/ui/SettingRow.svelte"
import {
  installUsageBridge,
  usageBridgeInstalled,
} from "#lib/desktop/native/usage.ts"
import type {
  ClockAlign,
  DeviceSettings,
  SpectrumStyle,
} from "#lib/desktop/settings/index.ts"
import { m } from "#lib/paraglide/messages.js"
import DesktopSection from "./DesktopSection.svelte"
import { desktopSettings } from "./desktop.svelte.ts"
import ToggleRow from "./ToggleRow.svelte"

type Flag = {
  [K in keyof DeviceSettings]: DeviceSettings[K] extends boolean ? K : never
}[keyof DeviceSettings]

type Item = { key: Flag; title: string; tip: string; child?: Item }

let { device }: { device: DeviceSettings } = $props()

const set = desktopSettings.setDevice

const STATUS: Item[] = [
  {
    key: "showTrayIcons",
    title: m.desktop_tray_icons(),
    tip: m.desktop_tray_icons_tip(),
  },
  {
    key: "showVolume",
    title: m.desktop_tray_volume(),
    tip: m.desktop_tray_volume_tip(),
  },
  {
    key: "showBattery",
    title: m.desktop_tray_battery(),
    tip: m.desktop_tray_battery_tip(),
  },
  {
    key: "showMeters",
    title: m.desktop_tray_meters(),
    tip: m.desktop_tray_meters_tip(),
    child: {
      key: "metersStacked",
      title: m.desktop_tray_meters_stacked(),
      tip: m.desktop_tray_meters_stacked_tip(),
    },
  },
  {
    key: "showNetwork",
    title: m.desktop_tray_network(),
    tip: m.desktop_tray_network_tip(),
  },
  {
    key: "showBluetooth",
    title: m.desktop_tray_bluetooth(),
    tip: m.desktop_tray_bluetooth_tip(),
  },
  {
    key: "showInputLanguage",
    title: m.desktop_tray_input(),
    tip: m.desktop_tray_input_tip(),
  },
]

const BUTTONS: Item[] = [
  {
    key: "showNotifications",
    title: m.desktop_tray_notifications(),
    tip: m.desktop_tray_notifications_tip(),
  },
  {
    key: "showTaskView",
    title: m.desktop_tray_taskview(),
    tip: m.desktop_tray_taskview_tip(),
  },
  {
    key: "showDesktopButton",
    title: m.desktop_tray_desktop(),
    tip: m.desktop_tray_desktop_tip(),
  },
  {
    key: "showSettingsButton",
    title: m.desktop_tray_settings(),
    tip: m.desktop_tray_settings_tip(),
  },
]

const CLOCK_ALIGNS: { id: ClockAlign; label: string }[] = [
  { id: "start", label: m.desktop_left() },
  { id: "center", label: m.desktop_center() },
  { id: "end", label: m.desktop_right() },
]

const SPECTRUMS: { id: SpectrumStyle; label: string }[] = [
  { id: "bars", label: m.desktop_spectrum_bars() },
  { id: "mirror", label: m.desktop_spectrum_mirror() },
  { id: "wave", label: m.desktop_spectrum_wave() },
  { id: "dots", label: m.desktop_spectrum_dots() },
]

const bridging = new Attempt()

let bridged = $state(false)

const readBridge = async () => {
  bridged = await usageBridgeInstalled()
}

$effect(() => {
  readBridge().catch(() => undefined)
})

const toggleBridge = () =>
  bridging.run(async () => {
    await installUsageBridge(!bridged)
    await readBridge()
  })
</script>

{#snippet toggles(items: Item[])}
  {#each items as item (item.key)}
    {@const child = item.child}
    <ToggleRow
      title={item.title}
      tip={item.tip}
      checked={device[item.key]}
      onchange={on => set(item.key, on)}
    />
    {#if child && device[item.key]}
      <ToggleRow
        title={child.title}
        tip={child.tip}
        checked={device[child.key]}
        onchange={on => set(child.key, on)}
      />
    {/if}
  {/each}
{/snippet}

<DesktopSection id="tray" title={m.desktop_group_tray_status()}>
  {@render toggles(STATUS)}
</DesktopSection>

<DesktopSection title={m.desktop_group_tray_buttons()}>
  {@render toggles(BUTTONS)}
</DesktopSection>

<DesktopSection id="clock" title={m.desktop_clock()}>
  <ToggleRow
    title={m.desktop_clock_24h()}
    tip={m.desktop_clock_24h_tip()}
    checked={device.clock24h}
    onchange={on => set("clock24h", on)}
  />
  <ToggleRow
    title={m.desktop_clock_seconds()}
    tip={m.desktop_clock_seconds_tip()}
    checked={device.showSeconds}
    onchange={on => set("showSeconds", on)}
  />
  <SettingRow title={m.desktop_clock_align()} tip={m.desktop_clock_align_tip()}>
    <Segmented
      label={m.desktop_clock_align()}
      items={CLOCK_ALIGNS}
      value={device.clockAlign}
      onpick={align => set("clockAlign", align)}
    />
  </SettingRow>
</DesktopSection>

<DesktopSection id="media" title={m.desktop_media()}>
  <ToggleRow
    title={m.desktop_media_enabled()}
    tip={m.desktop_media_enabled_tip()}
    checked={device.showMedia}
    onchange={on => set("showMedia", on)}
  />
  {#if device.showMedia}
    <ToggleRow
      title={m.desktop_media_spectrum()}
      tip={m.desktop_media_spectrum_tip()}
      checked={device.showSpectrum}
      onchange={on => set("showSpectrum", on)}
    />
    {#if device.showSpectrum}
      <SettingRow
        title={m.desktop_media_spectrum_style()}
        tip={m.desktop_media_spectrum_style_tip()}
      >
        <Segmented
          label={m.desktop_media_spectrum_style()}
          items={SPECTRUMS}
          value={device.spectrumStyle}
          onpick={style => set("spectrumStyle", style)}
        />
      </SettingRow>
    {/if}
  {/if}
</DesktopSection>

<DesktopSection id="claude" title={m.desktop_claude()}>
  <ToggleRow
    title={m.desktop_claude_enabled()}
    tip={m.desktop_claude_enabled_tip()}
    checked={device.showClaudeUsage}
    onchange={on => set("showClaudeUsage", on)}
  />
  {#if device.showClaudeUsage}
    <ToggleRow
      title={m.desktop_claude_stacked()}
      tip={m.desktop_claude_stacked_tip()}
      checked={device.claudeUsageStacked}
      onchange={on => set("claudeUsageStacked", on)}
    />
    <SettingRow title={m.desktop_claude_bridge()} tip={m.desktop_claude_bridge_tip()}>
      <button
        type="button"
        class={["btn btn-sm min-w-24", !bridged && "btn-primary"]}
        disabled={bridging.busy}
        onclick={toggleBridge}
      >
        {bridged ? m.desktop_disconnect() : m.common_connect()}
      </button>
    </SettingRow>
    {#if !bridged}
      <SettingRow title={m.desktop_claude_file()} tip={m.desktop_claude_file_tip()}>
        <input
          class="input input-sm w-64 max-sm:w-full"
          aria-label={m.desktop_claude_file()}
          spellcheck="false"
          value={device.claudeUsageSource}
          onchange={e => set("claudeUsageSource", e.currentTarget.value.trim())}
        />
      </SettingRow>
    {/if}
  {/if}
</DesktopSection>
<ErrorAlert message={bridging.failure} />
