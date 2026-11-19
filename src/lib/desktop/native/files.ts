import { invoke } from "@tauri-apps/api/core"

export type FilesDefault = { supported: boolean; enabled: boolean }

export const filesDefault = (enable?: boolean) =>
  enable === undefined
    ? invoke<FilesDefault>("plugin:atrix-files|default_app_status")
    : invoke<FilesDefault>("plugin:atrix-files|set_default_app", {
        enabled: enable,
      })

export const openAtrixFiles = (path: string | null = null) =>
  invoke<void>("plugin:atrix-files|new_window", { path })

export const openFilesDefaults = () =>
  invoke<void>("plugin:atrix-files|open_default_apps")
