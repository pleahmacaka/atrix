import type { SessionUpdate } from "@agentclientprotocol/sdk"
import { z } from "zod"
import type { ChatItem, Shell } from "#lib/acp/items.ts"
import type { Reachable } from "#lib/acp/tools.ts"
import { canvas } from "#lib/knowledge/canvas.ts"
import { editable, editablePatch } from "#lib/knowledge/document.ts"
import type {
  CanvasEntry,
  Change,
  Entry,
  Patch as KgPatch,
  Loaded,
  LoadedCanvas,
  Saved,
  SavedCanvas,
  StoredObject,
  Trashed,
  Version,
  WrittenObject,
} from "#lib/knowledge/store.ts"
import { gateway } from "#lib/store/local.svelte.ts"

export type {
  CanvasEntry,
  Change,
  Entry,
  KgPatch,
  Loaded,
  LoadedCanvas,
  Saved,
  SavedCanvas,
  StoredObject,
  Trashed,
  Version,
  WrittenObject,
}

export type HarnessKind = "claude" | "codex"

export type HarnessInfo = {
  id: string
  name: string
  base: string
  kind: HarnessKind | null
  profile: string | null
  enabled: boolean
  local: boolean
  login: string | null
}

const installScope = z.enum(["atrix", "global"])

export type InstallScope = z.infer<typeof installScope>

export type Available = {
  id: string
  name: string
  requires: "node" | "uv" | null
}

export type Installed = { pathHint: string | null }

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
  available: Available[]
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

export type Limit = {
  id: string
  percent: number
  resetsAt: number | null
}

export type ContextUse = { used: number; size: number }

export type SessionView = OpenSession & {
  items: ChatItem[]
  ask: Ask | null
  config: ConfigChoice[]
  external?: boolean
  queued?: string[]
  queuedImages?: Record<string, string>
  context?: ContextUse
  contextFrom?: number
  contextChars?: Record<string, number>
  contextBase?: number
  limits?: Limit[]
  shells?: Shell[]
  model?: string
  since?: number
  tokens?: number
  agents?: Subagent[]
  commands?: Command[]
}

export type Command = { name: string; description: string; hint?: string }

export type Subagent = { id: string; description: string; step: string }

export type Patch = Partial<
  Pick<
    SessionView,
    "running" | "ask" | "config" | "title" | "since" | "commands" | "context"
  >
>

const attachment = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("image"),
    name: z.string(),
    mimeType: z.string(),
    data: z.string(),
  }),
  z.object({
    kind: z.literal("text"),
    name: z.string(),
    mimeType: z.string(),
    text: z.string(),
  }),
])

export type Attachment = z.infer<typeof attachment>

export type Browse = {
  path: string
  parent: string | null
  dirs: { name: string; path: string }[]
}

export type Rows = { columns: string[]; rows: unknown[][] }

export type Executed = { changes: number; lastInsertRowid: number }

const syncConfig = z.object({ url: z.string(), token: z.string() })

export type SyncConfig = z.infer<typeof syncConfig>

export const SESSION_BUSY = "session_busy"

export const isBusyError = (e: unknown) =>
  e instanceof Error && e.message === SESSION_BUSY

export const SESSION_GONE = "session_gone"

export const isGoneError = (e: unknown) =>
  e instanceof Error && e.message === SESSION_GONE

export const openArgs = z.object({
  harness: z
    .string()
    .min(1)
    .describe(
      "Harness id as listed by list_sessions, e.g. the orchestrator's own",
    ),
  cwd: z.string().min(1).describe("Absolute path of the project folder"),
  title: z
    .string()
    .trim()
    .min(1)
    .max(80)
    .describe("Stable worker name, usually the project name"),
  profile: z.string().optional().describe("Profile name of that harness"),
  host: z
    .string()
    .optional()
    .describe(
      "Device name from list_sessions `host` to open the worker on another Atrix device; omit for this device",
    ),
})

export type OpenArgs = z.infer<typeof openArgs>

const letter = z.object({
  from: z.string(),
  sender: z.string(),
  to: z.string(),
  thread: z.string().optional(),
  refs: z.array(z.string()),
  text: z.string(),
})

const request = <Op extends string, Shape extends z.ZodRawShape>(
  op: Op,
  shape: Shape,
) => z.object({ op: z.literal(op), ...shape })

const named = { name: z.string() }

const statement = {
  name: z.string(),
  sql: z.string(),
  params: z.array(z.unknown()),
}

const datasourceRequest = z.discriminatedUnion("op", [
  request("ds.list", {}),
  request("ds.create", named),
  request("ds.delete", named),
  request("ds.tables", named),
  request("ds.query", statement),
  request("ds.execute", statement),
  request("ds.sync.get", {}),
  request("ds.sync.set", { name: z.string(), config: syncConfig.nullable() }),
  request("ds.sync", named),
  request("ds.knowledge.get", {}),
  request("ds.knowledge.set", { name: z.string(), on: z.boolean() }),
])

export type DatasourceRequest = z.infer<typeof datasourceRequest>

const session = { sessionId: z.string() }

const harness = { harness: z.string() }

const device = { device: z.string() }

export const hostRequest = z.discriminatedUnion("op", [
  ...datasourceRequest.options,
  request("state", {}),
  request("mail.sessions", {}),
  request("mail.post", { letter }),
  request("mail.notice", { to: z.string(), text: z.string() }),
  request("mail.open", {
    caller: z.string(),
    args: openArgs.omit({ host: true }),
  }),
  request("mail.close", { caller: z.string(), session: z.string() }),
  request("fs.browse", { path: z.string() }),
  request("list", harness),
  request("new", { ...harness, cwd: z.string() }),
  request("load", {
    ...harness,
    ...session,
    cwd: z.string(),
    title: z.string().optional(),
  }),
  request("prompt", {
    ...session,
    text: z.string(),
    attachments: z.array(attachment),
  }),
  request("cancel", session),
  request("close", session),
  request("speech.stt", { audio: z.string(), mime: z.string() }),
  request("speech.tts", { text: z.string() }),
  request("rename", { ...session, title: z.string() }),
  request("permit", { ...session, optionId: z.string().nullable() }),
  request("option", { ...session, configId: z.string(), value: z.string() }),
  request("harness.toggle", { ...harness, enabled: z.boolean() }),
  request("harness.detect", {}),
  request("harness.install", { ...harness, scope: installScope }),
  request("harness.uninstall", harness),
  request("harness.read", harness),
  request("harness.write", {
    ...harness,
    doc: z.string(),
    content: z.string(),
  }),
  request("skill.write", {
    ...harness,
    name: z.string(),
    content: z.string(),
  }),
  request("skill.remove", { ...harness, name: z.string() }),
  request("profile.create", {
    ...harness,
    name: z.string(),
    fork: z.boolean(),
  }),
  request("profile.remove", harness),
  request("kg.list", {}),
  request("kg.canvases", {}),
  request("kg.folders", {}),
  request("kg.apps", {}),
  request("kg.object.read", { key: z.string() }),
  request("kg.object.write", {
    ...device,
    key: z.string(),
    etag: z.string().nullable(),
    value: z.unknown().optional(),
  }),
  request("kg.folder.create", { ...device, path: z.string() }),
  request("kg.remove", { ...device, path: z.string() }),
  request("kg.move", { ...device, from: z.string(), to: z.string() }),
  request("kg.canvas.read", { path: z.string() }),
  request("kg.canvas.save", {
    ...device,
    path: z.string(),
    etag: z.string().nullable(),
    canvas,
  }),
  request("kg.read", { ref: z.string(), versionId: z.string().optional() }),
  request("kg.create", {
    ...device,
    path: z.string(),
    fields: editable,
    body: z.string(),
  }),
  request("kg.update", {
    ...device,
    ref: z.string(),
    etag: z.string(),
    patch: z.object({
      fields: editablePatch.optional(),
      body: z.string().optional(),
    }),
  }),
  request("kg.history", { ref: z.string() }),
  request("kg.trash", {}),
  request("kg.restore", {
    ...device,
    ref: z.string(),
    versionId: z.string(),
  }),
  request("kg.revert", {
    ...device,
    ref: z.string(),
    versionId: z.string(),
    etag: z.string(),
  }),
])

export type HostRequest = z.infer<typeof hostRequest>

export type HostEvent =
  | { type: "state"; state: HostState }
  | { type: "update"; sessionId: string; update: SessionUpdate }
  | { type: "patch"; sessionId: string; patch: Patch }
  | { type: "view"; view: SessionView }
  | { type: "kg"; change: Change }
  | { type: "ds"; name: string | null }
  | { type: "install"; harness: string; line: string }

export type Answers = {
  state: HostState
  "mail.sessions": Reachable[]
  "mail.post": { thread: string; queued: boolean }
  "mail.notice": null
  "mail.open": { id: string; title: string; reopened: boolean }
  "mail.close": { closed: string; title: string }
  "fs.browse": Browse
  list: Listed[]
  new: SessionView
  load: SessionView
  prompt: null
  cancel: null
  close: null
  "speech.stt": { text: string }
  "speech.tts": { audio: string; mime: string }
  rename: null
  permit: null
  option: null
  "harness.toggle": null
  "harness.detect": null
  "harness.install": Installed
  "harness.uninstall": null
  "harness.read": HarnessConfig
  "harness.write": null
  "skill.write": null
  "skill.remove": null
  "profile.create": { harness: HarnessInfo; skipped: string[] }
  "profile.remove": null
  "kg.list": Entry[]
  "kg.canvases": CanvasEntry[]
  "kg.folders": string[]
  "kg.apps": CanvasEntry[]
  "kg.object.read": StoredObject | null
  "kg.object.write": WrittenObject
  "kg.folder.create": null
  "kg.remove": null
  "kg.move": null
  "kg.canvas.read": LoadedCanvas
  "kg.canvas.save": SavedCanvas
  "kg.read": Loaded
  "kg.create": Saved
  "kg.update": Saved
  "kg.history": Version[]
  "kg.trash": Trashed[]
  "kg.restore": Saved
  "kg.revert": Saved
  "ds.list": string[]
  "ds.create": null
  "ds.delete": null
  "ds.tables": string[]
  "ds.query": Rows
  "ds.execute": Executed
  "ds.sync.get": Record<string, SyncConfig>
  "ds.sync.set": null
  "ds.sync": boolean
  "ds.knowledge.get": string[]
  "ds.knowledge.set": null
}

export type Op = HostRequest["op"]

export type RequestOf<K extends Op> = {
  [P in K]: Extract<HostRequest, { op: P }>
}[K]

export type Answer<R extends HostRequest> = Answers[R["op"]]

export type Handlers<K extends Op = Op> = {
  [P in K]: (request: RequestOf<P>) => Promise<Answers[P]>
}

export type HostCall = <K extends Op>(
  request: RequestOf<K>,
) => Promise<Answers[K]>

export const reply = z.discriminatedUnion("ok", [
  z.object({ ok: z.literal(true), value: z.unknown().optional() }),
  z.object({ ok: z.literal(false), error: z.string() }),
])

export type Reply = z.infer<typeof reply>

const EVENT_TYPES: Record<HostEvent["type"], true> = {
  state: true,
  update: true,
  patch: true,
  view: true,
  kg: true,
  ds: true,
  install: true,
}

const hostEvent = z.custom<HostEvent>(
  value =>
    typeof value === "object" &&
    value !== null &&
    "type" in value &&
    typeof value.type === "string" &&
    Object.hasOwn(EVENT_TYPES, value.type),
)

export const frame = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("event"), event: hostEvent }),
  z.object({ kind: z.literal("gateways"), gateways: z.array(gateway) }),
])

export type Frame = z.infer<typeof frame>
