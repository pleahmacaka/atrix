import { MediaQuery } from "svelte/reactivity"
import { desktop } from "#lib/platform.ts"
import {
  ACCENTS,
  quotedFont,
  settings,
  type WindowEffect,
} from "./settings.svelte.ts"

const dark = new MediaQuery("(prefers-color-scheme: dark)")

const handheld = new MediaQuery("(pointer: coarse) and (width < 40rem)")

const HANDHELD_SCALE = 1.15

export const frame = $state({ maximized: false })

const trackFrame = async () => {
  const { getCurrentWindow } = await import("@tauri-apps/api/window")
  const win = getCurrentWindow()

  const sync = async () => {
    frame.maximized = await win.isMaximized()
    document.documentElement.toggleAttribute("data-maximized", frame.maximized)
  }

  await win.onResized(sync)
  await sync()
}

const applyBackdrop = async (effect: WindowEffect) => {
  const { invoke } = await import("@tauri-apps/api/core")

  await invoke("window_backdrop", { glass: effect !== "none" })
}

const applyTheme = async (theme: "light" | "dark" | null) => {
  const { getCurrentWindow } = await import("@tauri-apps/api/window")

  await getCurrentWindow().setTheme(theme)
  // the system backdrop keeps the tint of the theme it was applied under
  await applyBackdrop(settings.effect)
}

export const startAppearance = () => {
  if (desktop) {
    document.documentElement.dataset.desktop = ""
    trackFrame().catch(console.error)
  }

  return $effect.root(() => {
    $effect(() => {
      const isDark =
        settings.theme === "dark" ||
        (settings.theme === "system" && dark.current)
      const hue = ACCENTS.find(a => a.id === settings.accent)?.hue ?? 268
      const root = document.documentElement

      root.dataset.theme = isDark ? "atrix-dark" : "atrix-light"
      root.style.fontSize = `${settings.scale * (handheld.current ? HANDHELD_SCALE : 1)}%`

      const font = settings.interfaceFont.trim()

      if (font) {
        root.style.setProperty("--font-interface", quotedFont(font))
      } else {
        root.style.removeProperty("--font-interface")
      }
      root.style.setProperty(
        "--content-scale",
        String(settings.contentScale / 100),
      )

      if (desktop) {
        applyTheme(
          settings.theme === "system" ? null : isDark ? "dark" : "light",
        ).catch(console.error)
      }
      root.style.setProperty(
        "--color-primary",
        isDark ? `oklch(72% 0.15 ${hue})` : `oklch(53% 0.19 ${hue})`,
      )
      root.style.setProperty(
        "--color-primary-content",
        isDark ? "oklch(16% 0.02 265)" : "oklch(99% 0 0)",
      )
    })

    $effect(() => {
      const effect = desktop ? settings.effect : "none"
      const transparency = desktop ? settings.transparency : 0
      const root = document.documentElement
      root.dataset.effect = effect === "none" ? "off" : "on"
      root.dataset.texture = settings.texture
      root.dataset.shape = settings.shape
      root.dataset.layout = settings.layout
      root.style.setProperty("--surface", String(1 - transparency / 100))

      if (desktop) {
        applyBackdrop(effect).catch(console.error)
      }
    })
  })
}
