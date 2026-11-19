import type { ITheme } from "ghostty-web"

type Palette = Record<keyof ITheme, string>

type Hues = Record<
  "red" | "green" | "yellow" | "blue" | "magenta" | "cyan",
  string
>

const ink = (percent: number) =>
  `color-mix(in oklab, var(--color-base-content) ${percent}%, var(--color-base-100))`

const toward = (color: string, percent: number) =>
  `color-mix(in oklab, ${color}, var(--color-base-content) ${percent}%)`

const shift = (hues: Hues, percent: number): Hues => ({
  red: toward(hues.red, percent),
  green: toward(hues.green, percent),
  yellow: toward(hues.yellow, percent),
  blue: toward(hues.blue, percent),
  magenta: toward(hues.magenta, percent),
  cyan: toward(hues.cyan, percent),
})

const css = (dark: boolean): Palette => {
  const tokens: Hues = {
    red: "var(--color-error)",
    green: "var(--color-success)",
    yellow: "var(--color-warning)",
    blue: "var(--color-info)",
    magenta: dark ? "oklch(74% 0.14 320)" : "oklch(62% 0.17 320)",
    cyan: "var(--color-accent)",
  }
  const normal = dark ? tokens : shift(tokens, 30)
  const bright = dark ? shift(tokens, 25) : tokens

  return {
    foreground: "var(--color-base-content)",
    background: "var(--color-base-100)",
    cursor: "var(--color-primary)",
    cursorAccent: "var(--color-primary-content)",
    selectionBackground:
      "color-mix(in oklab, var(--color-primary) 30%, var(--color-base-100))",
    selectionForeground: "var(--color-base-content)",
    black: ink(dark ? 26 : 100),
    brightBlack: ink(dark ? 52 : 62),
    white: ink(dark ? 84 : 34),
    brightWhite: ink(dark ? 100 : 18),
    ...normal,
    brightRed: bright.red,
    brightGreen: bright.green,
    brightYellow: bright.yellow,
    brightBlue: bright.blue,
    brightMagenta: bright.magenta,
    brightCyan: bright.cyan,
  }
}

const hex = (channel: number) => channel.toString(16).padStart(2, "0")

export const THEME_ATTRIBUTES = ["data-theme", "data-effect", "style"]

export const terminalTheme = (): ITheme => {
  const dark = document.documentElement.dataset.theme !== "atrix-light"
  const probe = document.createElement("span")
  const canvas = document.createElement("canvas")
  const context = canvas.getContext("2d", { willReadFrequently: true })

  canvas.width = 1
  canvas.height = 1
  probe.hidden = true
  document.body.append(probe)

  const resolve = (color: string) => {
    probe.style.color = color

    if (!context) {
      return "#000000"
    }

    context.clearRect(0, 0, 1, 1)
    context.fillStyle = getComputedStyle(probe).color
    context.fillRect(0, 0, 1, 1)

    const [red, green, blue] = context.getImageData(0, 0, 1, 1).data

    return `#${hex(red)}${hex(green)}${hex(blue)}`
  }

  const theme = Object.fromEntries(
    Object.entries(css(dark)).map(([key, color]) => [key, resolve(color)]),
  )

  probe.remove()

  return theme
}
