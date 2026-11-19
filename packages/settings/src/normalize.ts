import { defaultAppearance, defaultDevice, defaultProfile } from "./defaults"
import type {
  Appearance,
  AtrixStyle,
  DeviceSettings,
  DockWidget,
  DockWidgetKind,
  Profile,
  ThemePrefs,
} from "./model"

const WIDGET_KINDS: DockWidgetKind[] = ["lead", "apps", "tray", "spacer"]

export const sanitizeWidgets = (
  saved: DockWidget[] | undefined,
): DockWidget[] => {
  const seen = new Set<string>()
  const list = (saved ?? []).filter(
    widget =>
      WIDGET_KINDS.includes(widget.kind) &&
      !seen.has(widget.id) &&
      seen.add(widget.id),
  )

  for (const widget of defaultDevice.dockWidgets) {
    if (!list.some(w => w.kind === widget.kind)) {
      list.push({ ...widget })
    }
  }

  return list.map(widget => ({
    ...widget,
    size: widget.kind === "spacer" ? Math.max(8, widget.size || 24) : 0,
  }))
}

export const withDeviceDefaults = (
  saved?: Partial<DeviceSettings> | null,
): DeviceSettings => ({
  ...defaultDevice,
  ...saved,
  dockWidgets: sanitizeWidgets(saved?.dockWidgets),
  features: { ...defaultDevice.features, ...saved?.features },
})

export const withProfileDefaults = (
  saved?: Partial<Profile> | null,
): Profile => ({
  ...defaultProfile,
  ...saved,
  appearance: { ...defaultAppearance, ...saved?.appearance },
  launcher: { ...defaultProfile.launcher, ...saved?.launcher },
  calendar: { ...defaultProfile.calendar, ...saved?.calendar },
  todo: { ...defaultProfile.todo, ...saved?.todo },
})

export const standaloneAppearance = (
  style: AtrixStyle,
  prefs: ThemePrefs,
): Appearance =>
  style.linked && prefs.followAtrix
    ? withProfileDefaults(style.profile).appearance
    : { ...defaultAppearance, mode: prefs.mode, ...prefs.look }
