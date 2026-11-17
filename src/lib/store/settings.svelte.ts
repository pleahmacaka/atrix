import { m } from "#lib/paraglide/messages.js"
import { desktop } from "#lib/platform.ts"

export type Theme = "system" | "light" | "dark"

export type WindowEffect = "none" | "glass"

export type PanelShape = "rounded" | "square"

export type Layout = "flat" | "island"

export type SidebarCollapse = "compact" | "hidden"

export type Texture = "none" | "soft" | "strong"

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

export const SCALES = [90, 100, 110, 125]

class Settings {
  deviceName = $state<string>(
    read(
      "device-name",
      desktop ? m.device_default_desktop() : m.device_default_browser(),
    ),
  )

  userName = $state<string>(read("user-name", ""))

  theme = $state<Theme>(read("theme", "system"))

  accent = $state<Accent>(read("accent", "indigo"))

  effect = $state<WindowEffect>(
    read<string>("window-effect", "glass") === "none" ? "none" : "glass",
  )

  shape = $state<PanelShape>(read("panel-shape", "rounded"))

  layout = $state<Layout>(
    read<string>("layout", "flat") === "island" ? "island" : "flat",
  )

  texture = $state<Texture>(read("window-texture", "none"))

  sidebarCollapse = $state<SidebarCollapse>(
    read<string>("sidebar-collapse", "compact") === "hidden"
      ? "hidden"
      : "compact",
  )

  transparency = $state<number>(
    Number(read("window-transparency", this.effect === "none" ? "0" : "60")),
  )

  voiceURL = $state<string>(read("voice-url", ""))

  setVoiceURL = (url: string) => {
    this.voiceURL = url.trim().replace(/\/+$/, "")
    localStorage.setItem("voice-url", this.voiceURL)
  }

  voiceRate = $state<number>(Number(read("voice-rate", "1")) || 1)

  setVoiceRate = (rate: number) => {
    this.voiceRate = rate
    localStorage.setItem("voice-rate", String(rate))
  }

  setName = (name: string) => {
    this.deviceName = name.trim() || this.deviceName
    localStorage.setItem("device-name", this.deviceName)
  }

  setUserName = (name: string) => {
    this.userName = name.trim()
    localStorage.setItem("user-name", this.userName)
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

  setLayout = (layout: Layout) => {
    this.layout = layout
    localStorage.setItem("layout", layout)
  }

  setShape = (shape: PanelShape) => {
    this.shape = shape
    localStorage.setItem("panel-shape", shape)
  }

  scale = $state<number>(
    SCALES.includes(Number(read("ui-scale", "100")))
      ? Number(read("ui-scale", "100"))
      : 100,
  )

  setScale = (scale: number) => {
    this.scale = scale
    localStorage.setItem("ui-scale", String(scale))
  }

  setSidebarCollapse = (mode: SidebarCollapse) => {
    this.sidebarCollapse = mode
    localStorage.setItem("sidebar-collapse", mode)
  }

  setTexture = (texture: Texture) => {
    this.texture = texture
    localStorage.setItem("window-texture", texture)
  }

  setTransparency = (percent: number) => {
    this.transparency = percent
    localStorage.setItem("window-transparency", String(percent))
  }

  mailTokenCap = $state<number>(Number(read("mail-token-cap", "0")) || 0)

  setMailTokenCap = (cap: number) => {
    this.mailTokenCap = cap
    localStorage.setItem("mail-token-cap", String(cap))
  }
}

export const settings = new Settings()
