<script lang="ts">
import Segmented from "#lib/components/ui/Segmented.svelte"
import Select from "#lib/components/ui/Select.svelte"
import SettingRow from "#lib/components/ui/SettingRow.svelte"
import { installedTerminals } from "#lib/desktop/native/system.ts"
import {
  type DeviceSettings,
  defaultProfile,
  isLastEntryPoint,
  type LauncherPrefs,
  type TerminalApp,
  type WebSearchEngine,
} from "#lib/desktop/settings/index.ts"
import { m } from "#lib/paraglide/messages.js"
import DesktopSection from "./DesktopSection.svelte"
import { desktopSettings } from "./desktop.svelte.ts"
import { TRIGGERS } from "./desktopSettings.ts"
import LauncherShortcut from "./LauncherShortcut.svelte"
import SteppedSetting from "./SteppedSetting.svelte"
import ToggleRow from "./ToggleRow.svelte"

let {
  device,
  launcher,
}: { device: DeviceSettings; launcher: LauncherPrefs } = $props()

const set = desktopSettings.setDevice

const prefer = desktopSettings.setLauncher

const RESULTS = {
  min: 3,
  max: 15,
  step: 1,
  base: defaultProfile.launcher.maxResults,
}

const ENGINES: { value: WebSearchEngine; label: string }[] = [
  { value: "google", label: m.desktop_web_google() },
  { value: "duckduckgo", label: m.desktop_web_duckduckgo() },
  { value: "bing", label: m.desktop_web_bing() },
  { value: "naver", label: m.desktop_web_naver() },
]

const TERMINAL_NAMES: Record<TerminalApp, string> = {
  auto: m.desktop_auto(),
  atrix: m.desktop_terminal_atrix(),
  wt: m.desktop_terminal_wt(),
  pwsh: m.desktop_terminal_pwsh(),
  powershell: m.desktop_terminal_powershell(),
  cmd: m.desktop_terminal_cmd(),
}

const TOGGLES: { key: "showWindows" | "showCommands" | "showTodos" | "calculator"; title: string }[] = [
  { key: "showWindows", title: m.desktop_launcher_windows() },
  { key: "showCommands", title: m.desktop_launcher_commands() },
  { key: "showTodos", title: m.desktop_launcher_todos() },
  { key: "calculator", title: m.desktop_launcher_calculator() },
]

let installed = $state<TerminalApp[]>([])

$effect(() => {
  installedTerminals()
    .then(found => {
      installed = found
    })
    .catch(() => undefined)
})

const terminals = $derived(
  [...new Set<TerminalApp>(["auto", "atrix", ...installed, device.terminal])].map(app => ({
    value: app,
    label: TERMINAL_NAMES[app],
  })),
)
</script>

<DesktopSection id="launcher">
  <ToggleRow
    title={m.desktop_launcher_enabled()}
    checked={device.features.launcher}
    disabled={isLastEntryPoint(device.features, "launcher")}
    onchange={on => set("features", { ...device.features, launcher: on })}
  />
  {#if device.features.launcher}
    <SettingRow title={m.desktop_launcher_trigger()}>
      <Segmented
        label={m.desktop_launcher_trigger()}
        items={TRIGGERS}
        value={device.launcherTrigger}
        onpick={trigger => set("launcherTrigger", trigger)}
      />
    </SettingRow>
    {#if device.launcherTrigger !== "win"}
      <SettingRow title={m.desktop_launcher_shortcut()}>
        <LauncherShortcut
          value={device.launcherShortcut}
          onchange={shortcut => set("launcherShortcut", shortcut)}
        />
      </SettingRow>
    {/if}
    <SteppedSetting
      title={m.desktop_launcher_results()}
      value={launcher.maxResults}
      range={RESULTS}
      onchange={count => prefer("maxResults", count)}
    />
    {#each TOGGLES as toggle (toggle.key)}
      <ToggleRow
        title={toggle.title}
        checked={launcher[toggle.key]}
        onchange={on => prefer(toggle.key, on)}
      />
    {/each}
    <SettingRow title={m.desktop_launcher_web()}>
      <Select
        class="w-44 max-sm:w-full"
        label={m.desktop_launcher_web()}
        options={ENGINES}
        value={launcher.webSearch}
        onchange={engine => prefer("webSearch", engine)}
      />
    </SettingRow>
    <ToggleRow
      title={m.desktop_launcher_keymap()}
      checked={device.showKeymap}
      onchange={on => set("showKeymap", on)}
    />
    <SettingRow title={m.desktop_launcher_terminal()}>
      <Select
        class="w-44 max-sm:w-full"
        label={m.desktop_launcher_terminal()}
        options={terminals}
        value={device.terminal}
        onchange={app => set("terminal", app)}
      />
    </SettingRow>
  {/if}
</DesktopSection>
