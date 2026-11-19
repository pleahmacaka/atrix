import "@fontsource-variable/jetbrains-mono"
import nerdSymbols from "@azurity/pure-nerd-font/PureNerdFont.woff2?url"
import jetbrains from "@fontsource-variable/jetbrains-mono/files/jetbrains-mono-latin-wght-normal.woff2?url"
import pretendard from "pretendard/dist/web/variable/woff2/PretendardVariable.woff2?url"
import { TERMINAL_FONT } from "#lib/store/settings.svelte.ts"

export const DEFAULT_FONT = TERMINAL_FONT

const BOLD = 700

const STYLES: Record<number, string> = {
  100: "Thin",
  200: "ExtraLight",
  300: "Light",
  400: "Regular",
  500: "Medium",
  600: "SemiBold",
  700: "Bold",
  800: "ExtraBold",
  900: "Black",
}

const POSTSCRIPT: Record<string, string> = {
  [TERMINAL_FONT]: "JetBrainsMonoNFM",
}

const FALLBACKS = [
  { family: "Pure Nerd Font", url: nerdSymbols, weight: "normal" },
  { family: "Pretendard", url: pretendard, weight: "45 920" },
]

const STACK = ["JetBrains Mono Variable", ...FALLBACKS.map(f => f.family)]
  .map(family => `"${family}"`)
  .join(", ")

let engine: Promise<void> | null = null

let fallbacks: Promise<unknown> | null = null

const aliases = new Map<string, Promise<string | null>>()

const register = () =>
  Promise.all(
    FALLBACKS.map(async ({ family, url, weight }) => {
      const face = new FontFace(family, `url(${url})`, { weight })

      document.fonts.add(await face.load())
    }),
  )

const sources = (family: string, weight: number) => {
  const style = STYLES[weight] ?? "Regular"
  const postscript = POSTSCRIPT[family] ?? family.replaceAll(" ", "")
  const local = [`${postscript}-${style}`, `${family} ${style}`, family].map(
    name => `local("${name}")`,
  )
  const bundled =
    family === TERMINAL_FONT ? [`url("${jetbrains}") format("woff2")`] : []

  return [...local, ...bundled].join(", ")
}

// ghostty-web takes no font weight, so each weight gets its own family whose bold face sits at 700 or above
const alias = async (family: string, weight: number) => {
  const name = `terminal-${family}-${weight}`.replaceAll(/[^a-z0-9-]/gi, "-")
  const bold = Math.max(BOLD, weight)
  const faces = [
    new FontFace(name, sources(family, weight), { weight: String(weight) }),
    new FontFace(name, sources(family, bold), { weight: String(bold) }),
  ]
  const loaded = await Promise.allSettled(faces.map(face => face.load()))

  if (loaded[0].status === "rejected") {
    return null
  }

  faces.forEach((face, index) => {
    if (loaded[index].status === "fulfilled") {
      document.fonts.add(face)
    }
  })

  return name
}

export const loadFont = async (font: string, weight: number) => {
  const family = font.trim().replaceAll('"', "") || TERMINAL_FONT
  const key = `${family}|${weight}`

  fallbacks ??= register().catch(() => [])

  if (!aliases.has(key)) {
    aliases.set(
      key,
      alias(family, weight).catch(() => null),
    )
  }

  const [, named] = await Promise.all([fallbacks, aliases.get(key)])
  const stack = `"${named ?? family}", ${STACK}`

  await document.fonts.load(`1rem ${stack}`).catch(() => [])

  return stack
}

export const prepare = (font: string, weight: number) => {
  engine ??= import("ghostty-web").then(ghostty => ghostty.init())

  return Promise.all([engine, loadFont(font, weight)]).then(
    ([, stack]) => stack,
  )
}
