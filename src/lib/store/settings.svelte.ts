import { m } from "#lib/paraglide/messages.js"
import { desktop } from "#lib/platform.ts"

export type Theme = "system" | "light" | "dark"

export type WindowEffect = "none" | "glass"

export type PanelShape = "rounded" | "square"

export type Layout = "flat" | "island"

export type SidebarCollapse = "compact" | "hidden"

export type Texture = "none" | "soft" | "strong"

export type UsageRing = "both" | "context" | "week"

export const SUBMIT_HOURS = [1, 6, 24]

export const LOCK_IDLE = [0, 5, 15, 30, 60]

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

const read = <T extends string>(key: string, fallback: T) => {
  const raw = localStorage.getItem(key)

  return raw === null ? fallback : (raw as T)
}

export const TERMINAL_FONT = "JetBrainsMono Nerd Font Mono"

export type Bounds = { min: number; max: number; step: number; base: number }

export const SCALE: Bounds = { min: 70, max: 150, step: 10, base: 100 }

export const CONTENT_SCALE: Bounds = { min: 70, max: 200, step: 10, base: 100 }

export const TERMINAL_SIZE: Bounds = { min: 8, max: 32, step: 1, base: 13 }

export const TERMINAL_SCROLL: Bounds = {
  min: 25,
  max: 400,
  step: 25,
  base: 100,
}

export const TERMINAL_WEIGHT: Bounds = {
  min: 100,
  max: 800,
  step: 100,
  base: 400,
}

export const quotedFont = (font: string) =>
  font.includes(",") ? font.trim() : `"${font.trim().replaceAll('"', "")}"`

const within = (raw: string, range: Bounds) => {
  const value = Number(raw)

  return Number.isFinite(value) && value >= range.min && value <= range.max
    ? value
    : range.base
}

const ranged = (key: string, range: Bounds) =>
  within(read(key, String(range.base)), range)

const write = (key: string, value: string) => localStorage.setItem(key, value)

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

  usageRing = $state<UsageRing>(read("usage-ring", "both"))

  tokscale = $state(read<string>("tokscale", "off") === "on")

  tokscaleSubmit = $state<number>(
    SUBMIT_HOURS.find(h => h === Number(read("tokscale-submit", "0"))) ?? 0,
  )

  setTokscaleSubmit = (hours: number) => {
    this.tokscaleSubmit = hours
    write("tokscale-submit", String(hours))
  }

  lockIdle = $state<number>(
    LOCK_IDLE.find(m => m === Number(read("lock-idle", "30"))) ?? 30,
  )

  setLockIdle = (minutes: number) => {
    this.lockIdle = minutes
    write("lock-idle", String(minutes))
  }

  setTokscale = (on: boolean) => {
    this.tokscale = on
    write("tokscale", on ? "on" : "off")
  }

  setUsageRing = (ring: UsageRing) => {
    this.usageRing = ring
    write("usage-ring", ring)
  }

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
    write("voice-url", this.voiceURL)
  }

  voiceRate = $state<number>(Number(read("voice-rate", "1")) || 1)

  setVoiceRate = (rate: number) => {
    this.voiceRate = rate
    write("voice-rate", String(rate))
  }

  setName = (name: string) => {
    this.deviceName = name.trim() || this.deviceName
    write("device-name", this.deviceName)
  }

  setUserName = (name: string) => {
    this.userName = name.trim()
    write("user-name", this.userName)
  }

  setTheme = (theme: Theme) => {
    this.theme = theme
    write("theme", theme)
  }

  setAccent = (accent: Accent) => {
    this.accent = accent
    write("accent", accent)
  }

  setEffect = (effect: WindowEffect) => {
    this.effect = effect
    write("window-effect", effect)
  }

  setLayout = (layout: Layout) => {
    this.layout = layout
    write("layout", layout)
  }

  setShape = (shape: PanelShape) => {
    this.shape = shape
    write("panel-shape", shape)
  }

  scale = $state<number>(ranged("ui-scale", SCALE))

  contentScale = $state<number>(ranged("content-scale", CONTENT_SCALE))

  interfaceFont = $state<string>(read("interface-font", ""))

  terminalFont = $state<string>(read("terminal-font", ""))

  terminalSize = $state<number>(ranged("terminal-size", TERMINAL_SIZE))

  terminalScroll = $state<number>(ranged("terminal-scroll", TERMINAL_SCROLL))

  terminalWeight = $state<number>(ranged("terminal-weight", TERMINAL_WEIGHT))

  setTerminalWeight = (weight: number) => {
    this.terminalWeight = weight
    write("terminal-weight", String(weight))
  }

  setInterfaceFont = (font: string) => {
    this.interfaceFont = font
    write("interface-font", font)
  }

  setTerminalFont = (font: string) => {
    this.terminalFont = font
    write("terminal-font", font)
  }

  setTerminalSize = (size: number) => {
    this.terminalSize = size
    write("terminal-size", String(size))
  }

  setTerminalScroll = (percent: number) => {
    this.terminalScroll = percent
    write("terminal-scroll", String(percent))
  }

  setContentScale = (scale: number) => {
    this.contentScale = scale
    write("content-scale", String(scale))
  }

  setScale = (scale: number) => {
    this.scale = scale
    write("ui-scale", String(scale))
  }

  setSidebarCollapse = (mode: SidebarCollapse) => {
    this.sidebarCollapse = mode
    write("sidebar-collapse", mode)
  }

  setTexture = (texture: Texture) => {
    this.texture = texture
    write("window-texture", texture)
  }

  setTransparency = (percent: number) => {
    this.transparency = percent
    write("window-transparency", String(percent))
  }

  mailTokenCap = $state<number>(Number(read("mail-token-cap", "0")) || 0)

  setMailTokenCap = (cap: number) => {
    this.mailTokenCap = cap
    write("mail-token-cap", String(cap))
  }
}

export const settings = new Settings()
