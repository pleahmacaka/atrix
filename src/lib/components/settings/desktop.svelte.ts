import { relaunch } from "@tauri-apps/plugin-process"
import { isEqual } from "es-toolkit"
import { Attempt } from "#lib/components/ui/attempt.svelte.ts"
import {
  type DeviceSettings,
  type LauncherPrefs,
  loadDevice,
  loadProfile,
  onDevice,
  onProfile,
  updateDevice,
  updateProfile,
} from "#lib/desktop/settings/index.ts"
import { platform } from "#lib/platform.ts"
import {
  type Components,
  DESKTOP_SECTIONS,
  type DesktopPage,
  type DesktopSection,
  launchedComponents,
  loadComponents,
  saveComponents,
} from "./desktopSettings.ts"

export const windows = platform === "windows"

class DesktopSettings {
  page = $state<DesktopPage>("general")

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
      const [launched, components, device, profile] = await Promise.all([
        launchedComponents(),
        loadComponents(),
        windows ? loadDevice() : null,
        windows ? loadProfile() : null,
      ])

      this.launched = launched
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

  open = (section: string | null) => {
    const target = DESKTOP_SECTIONS.find(s => s.id === section)

    if (target) {
      this.page = target.page
      this.focus = target.id
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
}

export const desktopSettings = new DesktopSettings()
