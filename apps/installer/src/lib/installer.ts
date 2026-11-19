import { invoke } from "@tauri-apps/api/core"
import { listen } from "@tauri-apps/api/event"

export type Platform = "windows" | "linux" | "macos"

export type Components = {
  agent: boolean
  shell: boolean
  files: boolean
  terminal: boolean
}

export type Overview = {
  version: string
  platform: Platform
  installed: boolean
  outdated: boolean
  available: boolean
  components: Components
}

export type StepId = "stop" | "client" | "components" | "start" | "remove"

export type Step = {
  id: StepId
  state: "running" | "done" | "failed"
  error: string | null
}

export const overview = () => invoke<Overview>("overview")

export const apply = (components: Components) =>
  invoke<void>("apply", { components })

export const uninstall = () => invoke<void>("uninstall")

export const launch = () => invoke<void>("launch")

export const onStep = (handler: (step: Step) => void) =>
  listen<Step>("step", e => handler(e.payload))

export const differs = (a: Components, b: Components) =>
  a.agent !== b.agent ||
  a.shell !== b.shell ||
  a.files !== b.files ||
  a.terminal !== b.terminal
