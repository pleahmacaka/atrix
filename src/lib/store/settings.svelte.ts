import { m } from "#lib/paraglide/messages.js"
import { desktop } from "#lib/platform.ts"

export type Theme = "system" | "light" | "dark"

export type WindowEffect = "none" | "acrylic" | "mica"

export const ACCENTS = [
  { id: "indigo", label: m.accent_indigo(), hue: 268 },
  { id: "blue", label: m.accent_blue(), hue: 245 },
  { id: "teal", label: m.accent_teal(), hue: 195 },
  { id: "green", label: m.accent_green(), hue: 150 },
  { id: "amber", label: m.accent_amber(), hue: 70 },
  { id: "orange", label: m.accent_orange(), hue: 45 },
  { id: "rose", label: m.accent_rose(), hue: 10 },
  { id: "violet", label: m.accent_violet(), hue: 300 },
] as const

export type Accent = (typeof ACCENTS)[number]["id"]

const read = <T extends string>(key: string, fallback: T) =>
  (localStorage.getItem(key) as T | null) ?? fallback

class Settings {
  deviceName = $state<string>(
    read(
      "device-name",
      desktop ? m.device_default_desktop() : m.device_default_browser(),
    ),
  )

  theme = $state<Theme>(read("theme", "system"))

  accent = $state<Accent>(read("accent", "indigo"))

  effect = $state<WindowEffect>(read("window-effect", "none"))

  setName = (name: string) => {
    this.deviceName = name.trim() || this.deviceName
    localStorage.setItem("device-name", this.deviceName)
  }

  setTheme = (theme: Theme) => {
    this.theme = theme
    localStorage.setItem("theme", theme)
  }

  setAccent = (accent: Accent) => {
    this.accent = accent
    localStorage.setItem("accent", accent)
  }

  setEffect = (effect: WindowEffect) => {
    this.effect = effect
    localStorage.setItem("window-effect", effect)
  }
}

export const settings = new Settings()
