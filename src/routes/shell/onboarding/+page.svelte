<script lang="ts">
import { type DeviceSettings, updateDevice } from "@atrix/settings"
import Icon from "@iconify/svelte"
import { relaunch } from "@tauri-apps/plugin-process"
import { isEqual } from "es-toolkit"
import {
  type Components,
  loadComponents,
  saveComponents,
  TRIGGERS,
} from "#lib/components/settings/desktopSettings.ts"
import LauncherShortcut from "#lib/components/settings/LauncherShortcut.svelte"
import ToggleRow from "#lib/components/settings/ToggleRow.svelte"
import { Attempt } from "#lib/components/ui/attempt.svelte.ts"
import ErrorAlert from "#lib/components/ui/ErrorAlert.svelte"
import IconButton from "#lib/components/ui/IconButton.svelte"
import Section from "#lib/components/ui/Section.svelte"
import Segmented from "#lib/components/ui/Segmented.svelte"
import SettingRow from "#lib/components/ui/SettingRow.svelte"
import { ensureDevice } from "#lib/desktop/device.ts"
import {
  setLauncherShortcut,
  setWinKeyCapture,
} from "#lib/desktop/native/dock.ts"
import { hideWindow, onWindowShown } from "#lib/desktop/native/windows.ts"
import { m } from "#lib/paraglide/messages.js"

type Choices = Pick<
  DeviceSettings,
  "features" | "launcherTrigger" | "launcherShortcut"
>

let launched = $state<Components | null>(null)

let components = $state<Components | null>(null)

let choices = $state<Choices | null>(null)

const finishing = new Attempt()

const setComponent = (key: keyof Components, on: boolean) => {
  if (components) {
    components[key] = on
  }
}

const choose = <K extends keyof Choices>(key: K, value: Choices[K]) => {
  if (choices) {
    choices[key] = value
  }
}

const restart = $derived(
  launched !== null && components !== null && !isEqual(launched, components),
)

const load = async () => {
  const [saved, device] = await Promise.all([loadComponents(), ensureDevice()])

  launched = saved
  components = { ...saved }
  choices = {
    features: device.features,
    launcherTrigger: device.launcherTrigger,
    launcherShortcut: device.launcherShortcut,
  }
}

$effect(() => {
  finishing.run(load)

  const stop = onWindowShown("onboarding", () => finishing.run(load))

  return () => {
    stop.then(unlisten => unlisten())
  }
})

const finish = () =>
  finishing.run(async () => {
    if (!components || !choices) {
      return
    }

    const { features, launcherTrigger, launcherShortcut } = choices

    await setLauncherShortcut(
      features.launcher && launcherTrigger !== "win" ? launcherShortcut : null,
    ).catch(() => {
      throw new Error(m.desktop_shortcut_failed())
    })
    await setWinKeyCapture(features.launcher && launcherTrigger !== "shortcut")
    await saveComponents($state.snapshot(components))
    await updateDevice(d => ({
      ...d,
      launcherTrigger,
      launcherShortcut,
      onboarded: true,
    }))

    if (restart) {
      await relaunch()
    } else {
      await hideWindow("onboarding")
    }
  })
</script>

<main
  class={[
    "flex min-h-0 flex-1 flex-col overflow-hidden",
    "rounded-box border border-base-300 bg-base-200",
  ]}
>
  <header data-tauri-drag-region class="flex items-center gap-3 px-6 pt-5 pb-2">
    <Icon icon="lucide:monitor" class="pointer-events-none size-5 text-primary" />
    <h1 class="pointer-events-none min-w-0 flex-1 truncate text-base font-semibold">
      {m.desktop_setup_title()}
    </h1>
    <IconButton
      icon="lucide:x"
      label={m.common_close()}
      onclick={() => hideWindow("onboarding")}
    />
  </header>
  <div class="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto px-6 py-2">
    <p class="px-1 text-sm text-base-content/70">{m.desktop_setup_text()}</p>
    {#if components && choices}
      <Section icon="lucide:blocks" title={m.desktop_components()}>
        <ToggleRow
          title={m.desktop_component_shell()}
          checked={components.shell}
          onchange={on => setComponent("shell", on)}
        />
        <ToggleRow
          title={m.desktop_component_files()}
          checked={components.files}
          onchange={on => setComponent("files", on)}
        />
        <ToggleRow
          title={m.desktop_component_terminal()}
          checked={components.terminal}
          onchange={on => setComponent("terminal", on)}
        />
      </Section>
      {#if choices.features.launcher}
        <Section icon="lucide:search" title={m.desktop_launcher()}>
          <SettingRow title={m.desktop_launcher_trigger()}>
            <Segmented
              label={m.desktop_launcher_trigger()}
              items={TRIGGERS}
              value={choices.launcherTrigger}
              onpick={trigger => choose("launcherTrigger", trigger)}
            />
          </SettingRow>
          {#if choices.launcherTrigger !== "win"}
            <SettingRow title={m.desktop_launcher_shortcut()}>
              <LauncherShortcut
                value={choices.launcherShortcut}
                onchange={shortcut => choose("launcherShortcut", shortcut)}
              />
            </SettingRow>
          {/if}
        </Section>
      {/if}
    {/if}
    <ErrorAlert message={finishing.failure} />
  </div>
  <footer class="flex justify-end px-6 pt-2 pb-5">
    <button
      type="button"
      class="btn btn-primary btn-sm"
      disabled={!components || finishing.busy}
      onclick={finish}
    >
      {restart ? m.update_restart() : m.desktop_setup_start()}
    </button>
  </footer>
</main>
