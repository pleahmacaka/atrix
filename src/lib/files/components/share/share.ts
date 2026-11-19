import { invoke } from "@tauri-apps/api/core"

export type Scope = "drives" | "home" | "folders"

export type Browse = { scope: Scope; folders: string[]; always: string[] }

export type Member = { id: string; name: string }

export type RemoteEntry = {
  name: string
  path: string
  dir: boolean
  size: number
  modified: number
}

export type Browsed =
  | { kind: "listing"; path: string | null; entries: RemoteEntry[] }
  | { kind: "pending" }
  | { kind: "denied" }

export type ShareState = {
  devices: Member[]
  browse: Browse
  browseAsks: Member[]
}

export type Answer = "once" | "always" | "deny"

export const shareState = () =>
  invoke<ShareState>("plugin:atrix-files|share_state")

export const takeAttention = () =>
  invoke<boolean>("plugin:atrix-files|share_take_attention")

export const browseDevice = (device: string, path: string | null) =>
  invoke<Browsed>("plugin:atrix-files|share_browse", { device, path })

export const fetchRemote = (device: string, path: string) =>
  invoke<string | null>("plugin:atrix-files|share_browse_fetch", {
    device,
    path,
  })

export const answerBrowse = (device: string, answer: Answer) =>
  invoke<void>("plugin:atrix-files|share_browse_answer", { device, answer })

export const revokeBrowse = (device: string) =>
  invoke<void>("plugin:atrix-files|share_browse_revoke", { device })

export const setBrowseScope = (scope: Scope, folders: string[]) =>
  invoke<void>("plugin:atrix-files|share_browse_scope", { scope, folders })
