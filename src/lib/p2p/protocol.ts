import type { SessionUpdate } from "@agentclientprotocol/sdk"
import type { ChatItem } from "#lib/acp/items.ts"

export type HarnessKind = "claude" | "codex"

export type HarnessInfo = {
  id: string
  name: string
  base: string
  kind: HarnessKind | null
  profile: string | null
  enabled: boolean
}

export type ConfigDoc = {
  id: string
  file: string
  format: "markdown" | "json" | "toml"
  content: string
}

export type Skill = { name: string; content: string }

export type HarnessConfig = { dir: string; docs: ConfigDoc[]; skills: Skill[] }

export type OpenSession = {
  id: string
  harness: string
  cwd: string
  title: string
  running: boolean
}

export type HostState = {
  home: string
  harnesses: HarnessInfo[]
  open: OpenSession[]
  external: { id: string; busy: boolean }[]
}

export type Listed = {
  sessionId: string
  cwd: string
  title: string
  updatedAt: string | null
}

export type Ask = {
  title: string
  options: { optionId: string; name: string; kind: string }[]
}

export type ConfigChoice = {
  id: string
  name: string
  category: string | null
  current: string
  values: { value: string; name: string }[]
}

export type SessionView = OpenSession & {
  items: ChatItem[]
  ask: Ask | null
  config: ConfigChoice[]
  external?: boolean
}

export type Patch = Partial<
  Pick<SessionView, "running" | "ask" | "config" | "title">
>

export type Attachment =
  | { kind: "image"; name: string; mimeType: string; data: string }
  | { kind: "text"; name: string; mimeType: string; text: string }

export type HostRequest =
  | { op: "state" }
  | { op: "list"; harness: string }
  | { op: "new"; harness: string; cwd: string }
  | { op: "load"; harness: string; sessionId: string; cwd: string }
  | {
      op: "prompt"
      sessionId: string
      text: string
      attachments: Attachment[]
    }
  | { op: "cancel"; sessionId: string }
  | { op: "close"; sessionId: string }
  | { op: "permit"; sessionId: string; optionId: string | null }
  | { op: "option"; sessionId: string; configId: string; value: string }
  | { op: "harness.toggle"; harness: string; enabled: boolean }
  | { op: "harness.detect" }
  | { op: "harness.read"; harness: string }
  | { op: "harness.write"; harness: string; doc: string; content: string }
  | { op: "skill.write"; harness: string; name: string; content: string }
  | { op: "skill.remove"; harness: string; name: string }
  | { op: "profile.create"; harness: string; name: string; fork: boolean }
  | { op: "profile.remove"; harness: string }

export type HostEvent =
  | { type: "state"; state: HostState }
  | { type: "update"; sessionId: string; update: SessionUpdate }
  | { type: "patch"; sessionId: string; patch: Patch }
  | { type: "view"; view: SessionView }

export type HostCall = (request: HostRequest) => Promise<unknown>
