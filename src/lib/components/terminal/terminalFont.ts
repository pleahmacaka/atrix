import "@fontsource-variable/jetbrains-mono"
import bundled from "@fontsource-variable/jetbrains-mono/files/jetbrains-mono-latin-wght-normal.woff2?url"

import { TERMINAL_FONT } from "#lib/store/settings.svelte.ts"

const FALLBACK = `"JetBrains Mono Variable", "JetBrains Mono"`

const WEIGHTS: Record<number, string> = {
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

const BOLD = 700

const POSTSCRIPT: Record<string, string> = {
  [TERMINAL_FONT]: "JetBrainsMonoNFM",
}

const sources = (family: string, weight: number) => {
  const style = WEIGHTS[weight] ?? "Regular"
  const postscript = POSTSCRIPT[family] ?? family.replaceAll(" ", "")
  const local = [`${postscript}-${style}`, `${family} ${style}`, family].map(
    n => `local("${n.replaceAll('"', "")}")`,
  )

  const fallback =
    family === TERMINAL_FONT ? [`url("${bundled}") format("woff2")`] : []

  return [...local, ...fallback].join(", ")
}

const loaded = new Map<string, Promise<string | null>>()

const alias = async (family: string, weight: number) => {
  const name = `atrix-terminal-${family}-${weight}`.replaceAll(
    /[^a-z0-9-]/gi,
    "-",
  )
  const faces = [
    new FontFace(name, sources(family, weight), { weight: String(weight) }),
    new FontFace(name, sources(family, Math.max(BOLD, weight)), {
      weight: String(Math.max(BOLD, weight)),
    }),
  ]
  const ready = await Promise.allSettled(faces.map(f => f.load()))

  if (ready[0].status === "rejected") {
    return null
  }

  for (const [i, face] of faces.entries()) {
    if (ready[i].status === "fulfilled") {
      document.fonts.add(face)
    }
  }

  return name
}

export const terminalFamily = async (font: string, weight: number) => {
  const family = font.trim() || TERMINAL_FONT
  const key = `${family}|${weight}`

  if (!loaded.has(key)) {
    loaded.set(
      key,
      alias(family, weight).catch(() => null),
    )
  }

  const named = await loaded.get(key)

  await document.fonts.load('13px "JetBrains Mono Variable"').catch(() => [])

  return named
    ? `"${named}", ${FALLBACK}`
    : `"${family.replaceAll('"', "")}", ${FALLBACK}`
}
