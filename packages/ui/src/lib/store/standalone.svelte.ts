import {
  applyAppearance,
  type AtrixStyle,
  standaloneAppearance,
  type ThemePrefs,
} from "@atrix/settings"
import { invoke } from "@tauri-apps/api/core"
import { listen } from "@tauri-apps/api/event"
import { getCurrentWindow } from "@tauri-apps/api/window"
import { tick } from "svelte"

export const atrixStyle = $state<AtrixStyle>({ linked: false, profile: null })

type FollowOptions = {
  command?: string
  reveal?: boolean
}

export const followAtrix = (
  prefs: ThemePrefs,
  { command = "atrix_style", reveal = true }: FollowOptions = {},
) => {
  $effect(() => {
    const look = standaloneAppearance(atrixStyle, prefs)
    const scheme = window.matchMedia("(prefers-color-scheme: dark)")
    const apply = () => applyAppearance(look, { restingShadow: true })

    apply()
    scheme.addEventListener("change", apply)

    return () => scheme.removeEventListener("change", apply)
  })

  $effect(() => {
    const current = getCurrentWindow()

    invoke<AtrixStyle>(command)
      .then(next => {
        Object.assign(atrixStyle, next)

        return tick()
      })
      .finally(() => {
        if (reveal && !Reflect.get(window, "__ATRIX_HEADLESS__")) {
          return current.show().then(() => current.setFocus())
        }
      })

    const stop = listen<AtrixStyle>("atrix-style", e => {
      Object.assign(atrixStyle, e.payload)
    })

    return () => {
      stop.then(unlisten => unlisten())
    }
  })
}
