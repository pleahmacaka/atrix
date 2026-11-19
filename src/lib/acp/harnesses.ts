import type * as acp from "@agentclientprotocol/sdk"
import type { Channel } from "@tauri-apps/api/core"
import { native } from "#lib/native.ts"
import type {
  Available,
  GlobalItems,
  McpServer,
  Skipped,
} from "#lib/p2p/protocol.ts"
import type { Provider } from "./provider.ts"

export type Spec = {
  harness: string
  home: string
  carry: boolean
  native: boolean
  cwd: string | null
  provider: Provider | null
  model: string | null
  skills: (
    | { source: "atrix"; name: string; content: string }
    | { source: "global"; dir: string }
  )[]
  tools: (
    | { source: "atrix"; server: McpServer }
    | { source: "global"; path: string; name: string }
  )[]
  instructions: string | null
}

export type HarnessSession = {
  newSession: acp.NewSessionRequest
  model: { configId: string | null; value: string } | null
  skipped: Skipped[]
}

export const listHarnesses = (refresh: boolean) =>
  native<Available[]>("harness_list", { refresh })

export const installHarness = (id: string, channel: Channel<string>) =>
  native("harness_install", { id, channel })

export const uninstallHarness = (id: string, channel: Channel<string>) =>
  native("harness_uninstall", { id, channel })

export const globalItems = (project: string | null) =>
  native<GlobalItems>("harness_global", { project })

export const spawnHarness = <T>(key: string, spec: Spec, channel: Channel<T>) =>
  native<Skipped[]>("harness_spawn", { key, spec, channel })

export const sessionOf = (key: string, capabilities: unknown) =>
  native<HarnessSession>("harness_session", { key, capabilities })
