import {
  type DeviceSettings,
  type LauncherPrefs,
  loadDevice,
  loadProfile,
  onDevice,
  onProfile,
  updateDevice,
  updateProfile,
} from "@atrix/settings"
import { invoke } from "@tauri-apps/api/core"
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow"
import { relaunch } from "@tauri-apps/plugin-process"
import { isEqual } from "es-toolkit"
import { Attempt } from "#lib/components/ui/attempt.svelte.ts"
import { desktop, platform } from "#lib/platform.ts"
import { openSettings } from "#lib/store/nav.svelte.ts"
import {
  type Components,
  DESKTOP_SETTINGS,
  type DesktopSection,
  loadComponents,
  saveComponents,
} from "./desktopSettings.ts"

export const windows = platform === "windows"

class DesktopSettings {
  focus = $state<DesktopSection | null>(null)

  launched = $state<Components | null>(null)

  components = $state<Components | null>(null)

  device = $state<DeviceSettings | null>(null)

  launcher = $state<LauncherPrefs | null>(null)

  saving = new Attempt()

  restartPending = $derived(
    this.launched !== null &&
      this.components !== null &&
      !isEqual(this.launched, this.components),
  )

  load = () =>
    this.saving.run(async () => {
      const [components, device, profile] = await Promise.all([
        loadComponents(),
        windows ? loadDevice() : null,
        windows ? loadProfile() : null,
      ])

      this.components = components
      this.device = device
      this.launcher = profile?.launcher ?? null
    })

  watch = () => {
    const stops = [
      onDevice(device => {
        this.device = device
      }),
      onProfile(profile => {
        this.launcher = profile.launcher
      }),
    ]

    return () => {
      for (const stop of stops) {
        stop.then(unlisten => unlisten())
      }
    }
  }

  setComponent = (key: keyof Components, on: boolean) => {
    if (!this.components) {
      return
    }

    const next = { ...this.components, [key]: on }

    this.components = next
    this.saving.run(() => saveComponents(next))
  }

  setDevice = <K extends keyof DeviceSettings>(
    key: K,
    value: DeviceSettings[K],
  ) => {
    if (this.device) {
      this.device[key] = value
    }

    this.saving.run(() => updateDevice(d => ({ ...d, [key]: value })))
  }

  setLauncher = <K extends keyof LauncherPrefs>(
    key: K,
    value: LauncherPrefs[K],
  ) => {
    if (this.launcher) {
      this.launcher[key] = value
    }

    this.saving.run(() =>
      updateProfile(p => ({ ...p, launcher: { ...p.launcher, [key]: value } })),
    )
  }

  restart = () => this.saving.run(relaunch)

  start = () => {
    if (!desktop) {
      return
    }

    loadComponents()
      .then(components => {
        this.launched = components
      })
      .catch(() => undefined)

    const main = getCurrentWebviewWindow()
    const stop = main.listen<DesktopSection | null>(
      DESKTOP_SETTINGS,
      async e => {
        await main.unminimize()
        await invoke("show_window", { label: "main" })
        this.focus = e.payload
        openSettings("desktop")
      },
    )

    return () => {
      stop.then(unlisten => unlisten())
    }
  }
}

export const desktopSettings = new DesktopSettings()
