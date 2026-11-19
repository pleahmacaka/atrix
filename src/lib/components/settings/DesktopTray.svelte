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
  DockSide,
  SpectrumStyle,
} from "#lib/desktop/settings/index.ts"
import { m } from "#lib/paraglide/messages.js"
import DesktopSection from "./DesktopSection.svelte"
import { desktopSettings } from "./desktop.svelte.ts"
import ToggleRow from "./ToggleRow.svelte"

type Flag = {
  [K in keyof DeviceSettings]: DeviceSettings[K] extends boolean ? K : never
}[keyof DeviceSettings]

let { device }: { device: DeviceSettings } = $props()

const set = desktopSettings.setDevice

const TRAY: { key: Flag; title: string; child?: { key: Flag; title: string } }[] = [
  { key: "showTrayIcons", title: m.desktop_tray_icons() },
  { key: "showVolume", title: m.desktop_tray_volume() },
  { key: "showBattery", title: m.desktop_tray_battery() },
  {
    key: "showMeters",
    title: m.desktop_tray_meters(),
    child: { key: "metersStacked", title: m.desktop_tray_meters_stacked() },
  },
  { key: "showNetwork", title: m.desktop_tray_network() },
  { key: "showBluetooth", title: m.desktop_tray_bluetooth() },
  { key: "showInputLanguage", title: m.desktop_tray_input() },
  { key: "showNotifications", title: m.desktop_tray_notifications() },
  { key: "showTaskView", title: m.desktop_tray_taskview() },
  { key: "showDesktopButton", title: m.desktop_tray_desktop() },
  { key: "showSettingsButton", title: m.desktop_tray_settings() },
]

const CLOCK_ALIGNS: { id: ClockAlign; label: string }[] = [
  { id: "start", label: m.desktop_left() },
  { id: "center", label: m.desktop_center() },
  { id: "end", label: m.desktop_right() },
]

const SIDES: { id: DockSide; label: string }[] = [
  { id: "left", label: m.desktop_left() },
  { id: "right", label: m.desktop_right() },
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

<DesktopSection id="tray">
  {#each TRAY as item (item.key)}
    {@const child = item.child}
    <ToggleRow
      title={item.title}
      checked={device[item.key]}
      onchange={on => set(item.key, on)}
    />
    {#if child && device[item.key]}
      <ToggleRow
        title={child.title}
        checked={device[child.key]}
        onchange={on => set(child.key, on)}
      />
    {/if}
  {/each}
</DesktopSection>

<DesktopSection id="clock">
  <ToggleRow
    title={m.desktop_clock_24h()}
    checked={device.clock24h}
    onchange={on => set("clock24h", on)}
  />
  <ToggleRow
    title={m.desktop_clock_seconds()}
    checked={device.showSeconds}
    onchange={on => set("showSeconds", on)}
  />
  <SettingRow title={m.desktop_clock_align()}>
    <Segmented
      label={m.desktop_clock_align()}
      items={CLOCK_ALIGNS}
      value={device.clockAlign}
      onpick={align => set("clockAlign", align)}
    />
  </SettingRow>
</DesktopSection>

<DesktopSection id="media">
  <ToggleRow
    title={m.desktop_media_enabled()}
    checked={device.showMedia}
    onchange={on => set("showMedia", on)}
  />
  {#if device.showMedia}
    <SettingRow title={m.desktop_position()}>
      <Segmented
        label={m.desktop_position()}
        items={SIDES}
        value={device.mediaSide}
        onpick={side => set("mediaSide", side)}
      />
    </SettingRow>
    <ToggleRow
      title={m.desktop_media_spectrum()}
      checked={device.showSpectrum}
      onchange={on => set("showSpectrum", on)}
    />
    {#if device.showSpectrum}
      <SettingRow title={m.desktop_media_spectrum_style()}>
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

<DesktopSection id="claude">
  <ToggleRow
    title={m.desktop_claude_enabled()}
    checked={device.showClaudeUsage}
    onchange={on => set("showClaudeUsage", on)}
  />
  {#if device.showClaudeUsage}
    <SettingRow title={m.desktop_position()}>
      <Segmented
        label={m.desktop_position()}
        items={SIDES}
        value={device.claudeUsageSide}
        onpick={side => set("claudeUsageSide", side)}
      />
    </SettingRow>
    <ToggleRow
      title={m.desktop_claude_stacked()}
      checked={device.claudeUsageStacked}
      onchange={on => set("claudeUsageStacked", on)}
    />
    <SettingRow title={m.desktop_claude_bridge()}>
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
      <SettingRow title={m.desktop_claude_file()}>
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
