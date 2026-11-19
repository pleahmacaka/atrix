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

const androidModel = () => {
  const model = agent
    .split("Android")[1]
    ?.split(";")[1]
    ?.split(")")[0]
    ?.split(" Build/")[0]
    ?.trim()

  return model && model !== "K" ? model : "Android"
}

export const mobileName =
  platform === "android"
    ? androidModel()
    : platform === "ios"
      ? /iPad/.test(agent)
        ? "iPad"
        : "iPhone"
      : null
