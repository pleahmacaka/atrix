import { isTauri } from "@tauri-apps/api/core"

const agent = navigator.userAgent

const mobile = /Android|iPhone|iPad/.test(agent)

export const desktop = isTauri() && !mobile

export const client = !desktop

export const mobileApp = isTauri() && mobile

const platformName = () => {
  if (/Android/.test(agent)) {
    return "android"
  }

  if (/iPhone|iPad/.test(agent)) {
    return "ios"
  }

  if (!desktop) {
    return "web"
  }

  if (/Windows/.test(agent)) {
    return "windows"
  }

  if (/Mac/.test(agent)) {
    return "macos"
  }

  return "linux"
}

export const platform = platformName()
