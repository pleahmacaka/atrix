import { MediaQuery } from "svelte/reactivity"
import { desktop } from "#lib/platform.ts"
import { ACCENTS, settings, type WindowEffect } from "./settings.svelte.ts"

const dark = new MediaQuery("(prefers-color-scheme: dark)")

const applyEffect = async (effect: WindowEffect) => {
  const { Effect, getCurrentWindow } = await import("@tauri-apps/api/window")
  const win = getCurrentWindow()

  if (effect === "none") {
    await win.clearEffects()

    return
  }

  await win.setEffects({
    effects: [Effect.Acrylic],
  })
}

export const startAppearance = () =>
  $effect.root(() => {
    $effect(() => {
      const isDark =
        settings.theme === "dark" ||
        (settings.theme === "system" && dark.current)
      const hue = ACCENTS.find(a => a.id === settings.accent)?.hue ?? 268
      const root = document.documentElement

      root.dataset.theme = isDark ? "atrix-dark" : "atrix-light"
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
      root.style.setProperty("--surface", String(1 - transparency / 100))

      if (desktop) {
        applyEffect(effect).catch(console.error)
      }
    })
  })
