import type { SessionUpdate } from "@agentclientprotocol/sdk"
import type { ChatItem, Shell } from "#lib/acp/items.ts"
import type { Canvas } from "#lib/knowledge/canvas.ts"
import type { Editable } from "#lib/knowledge/document.ts"
import type {
  CanvasEntry,
  Change,
  Entry,
  Patch as KgPatch,
  Loaded,
  LoadedCanvas,
  SavedCanvas,
  Version,
} from "#lib/knowledge/store.ts"

export type {
  CanvasEntry,
  Change,
  Entry,
  Loaded,
  LoadedCanvas,
  SavedCanvas,
  Version,
}

export type Saved = { ok: true; entry: Entry } | { ok: false; current: Loaded }

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
  knowledge: { ready: boolean; error: string | null }
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
  queued?: string[]
  shells?: Shell[]
}

export type Patch = Partial<
  Pick<SessionView, "running" | "ask" | "config" | "title">
>

export type Attachment =
  | { kind: "image"; name: string; mimeType: string; data: string }
  | { kind: "text"; name: string; mimeType: string; text: string }

export type Browse = {
  path: string
  parent: string | null
  dirs: { name: string; path: string }[]
}

export type HostRequest =
  | { op: "state" }
  | { op: "fs.browse"; path: string }
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
  | { op: "kg.list" }
  | { op: "kg.canvases" }
  | { op: "kg.canvas.read"; path: string }
  | {
      op: "kg.canvas.save"
      path: string
      etag: string | null
      canvas: Canvas
      device: string
    }
  | { op: "kg.read"; ref: string; versionId?: string }
  | {
      op: "kg.create"
      path: string
      fields: Editable
      body: string
      device: string
    }
  | {
      op: "kg.update"
      ref: string
      etag: string
      patch: KgPatch
      device: string
    }
  | { op: "kg.history"; ref: string }
  | {
      op: "kg.revert"
      ref: string
      versionId: string
      etag: string
      device: string
    }

export type HostEvent =
  | { type: "state"; state: HostState }
  | { type: "update"; sessionId: string; update: SessionUpdate }
  | { type: "patch"; sessionId: string; patch: Patch }
  | { type: "view"; view: SessionView }
  | { type: "kg"; change: Change }

export type HostCall = (request: HostRequest) => Promise<unknown>
