<script lang="ts">
import { Attempt } from "#lib/components/ui/attempt.svelte.ts"
import ErrorAlert from "#lib/components/ui/ErrorAlert.svelte"
import Segmented from "#lib/components/ui/Segmented.svelte"
import Select from "#lib/components/ui/Select.svelte"
import SettingRow from "#lib/components/ui/SettingRow.svelte"
import { setLauncherShortcut } from "#lib/desktop/native/dock.ts"
import { installedTerminals } from "#lib/desktop/native/system.ts"
import {
  type DeviceSettings,
  defaultProfile,
  isLastEntryPoint,
  type LauncherPrefs,
  type LauncherTrigger,
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

type Source = "showWindows" | "showCommands" | "showTodos" | "calculator"

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

const SOURCES: { key: Source; title: string; tip: string }[] = [
  {
    key: "showWindows",
    title: m.desktop_launcher_windows(),
    tip: m.desktop_launcher_windows_tip(),
  },
  {
    key: "showCommands",
    title: m.desktop_launcher_commands(),
    tip: m.desktop_launcher_commands_tip(),
  },
  {
    key: "showTodos",
    title: m.desktop_launcher_todos(),
    tip: m.desktop_launcher_todos_tip(),
  },
  {
    key: "calculator",
    title: m.desktop_launcher_calculator(),
    tip: m.desktop_launcher_calculator_tip(),
  },
]

let installed = $state<TerminalApp[]>([])

$effect(() => {
  installedTerminals()
    .then(found => {
      installed = found
    })
    .catch(() => undefined)
})

const atrixTerminal = $derived(desktopSettings.components?.terminal !== false)

const terminals = $derived(
  [
    ...new Set<TerminalApp>([
      "auto",
      ...(atrixTerminal ? (["atrix"] as const) : []),
      ...installed,
      device.terminal,
    ]),
  ].map(app => ({
    value: app,
    label: TERMINAL_NAMES[app],
  })),
)

const locked = $derived(isLastEntryPoint(device.features, "launcher"))

const binding = new Attempt()

const bind = (shortcut: string | null, save: () => void) =>
  binding.run(async () => {
    await setLauncherShortcut(shortcut).catch(() => {
      throw new Error(m.desktop_shortcut_failed())
    })
    save()
  })

const pickTrigger = (trigger: LauncherTrigger) =>
  bind(trigger === "win" ? null : device.launcherShortcut, () =>
    set("launcherTrigger", trigger),
  )

const pickShortcut = (shortcut: string) =>
  bind(shortcut, () => set("launcherShortcut", shortcut))
</script>

<DesktopSection id="launcher">
  <ToggleRow
    title={m.desktop_launcher_enabled()}
    tip={locked ? m.desktop_last_entry_tip() : m.desktop_launcher_enabled_tip()}
    checked={device.features.launcher}
    disabled={locked}
    onchange={on => set("features", { ...device.features, launcher: on })}
  />
</DesktopSection>
{#if device.features.launcher}
  <DesktopSection title={m.desktop_group_launcher_open()}>
    <SettingRow title={m.desktop_launcher_trigger()} tip={m.desktop_launcher_trigger_tip()}>
      <Segmented
        label={m.desktop_launcher_trigger()}
        items={TRIGGERS}
        value={device.launcherTrigger}
        onpick={pickTrigger}
      />
    </SettingRow>
    {#if device.launcherTrigger !== "win"}
      <SettingRow title={m.desktop_launcher_shortcut()} tip={m.desktop_launcher_shortcut_tip()}>
        <LauncherShortcut
          value={device.launcherShortcut}
          onchange={pickShortcut}
        />
      </SettingRow>
    {/if}
  </DesktopSection>
  <ErrorAlert message={binding.failure} />

  <DesktopSection title={m.desktop_group_launcher_results()}>
    {#each SOURCES as source (source.key)}
      <ToggleRow
        title={source.title}
        tip={source.tip}
        checked={launcher[source.key]}
        onchange={on => prefer(source.key, on)}
      />
    {/each}
    <SettingRow title={m.desktop_launcher_web()} tip={m.desktop_launcher_web_tip()}>
      <Select
        class="w-44 max-sm:w-full"
        label={m.desktop_launcher_web()}
        options={ENGINES}
        value={launcher.webSearch}
        onchange={engine => prefer("webSearch", engine)}
      />
    </SettingRow>
  </DesktopSection>

  <DesktopSection title={m.desktop_group_launcher_display()}>
    <SteppedSetting
      title={m.desktop_launcher_results()}
      tip={m.desktop_launcher_results_tip()}
      value={launcher.maxResults}
      range={RESULTS}
      onchange={count => prefer("maxResults", count)}
    />
    <ToggleRow
      title={m.desktop_launcher_keymap()}
      tip={m.desktop_launcher_keymap_tip()}
      checked={device.showKeymap}
      onchange={on => set("showKeymap", on)}
    />
  </DesktopSection>

  <DesktopSection title={m.desktop_group_launcher_terminal()}>
    <SettingRow title={m.desktop_launcher_terminal()} tip={m.desktop_launcher_terminal_tip()}>
      <Select
        class="w-44 max-sm:w-full"
        label={m.desktop_launcher_terminal()}
        options={terminals}
        value={device.terminal}
        onchange={app => set("terminal", app)}
      />
    </SettingRow>
  </DesktopSection>
{/if}
