import { z } from "zod"
import type { EventInput } from "#lib/calendar/store.ts"
import { type Block, SHOW_UI, showUiInput } from "#lib/chat/blocks.ts"
import { type OpenArgs, openArgs } from "#lib/p2p/protocol.ts"
import type { Caller } from "./bridge.ts"
import { newServer } from "./toolNames.ts"

export type Reachable = {
  id: string
  title: string
  harness: string
  running: boolean
  host?: string
}

export type Message = {
  to: string
  text: string
  thread?: string
  refs?: string[]
}

const fields = {
  title: z.string().min(1).optional(),
  description: z.string().optional(),
  tags: z.array(z.string()).optional(),
  scope: z.string().optional().describe('"network" or "p2p:<namespace>"'),
  links: z
    .array(z.object({ to: z.string(), rel: z.string() }))
    .optional()
    .describe("Typed links to other document ids"),
  sources: z
    .array(z.string())
    .optional()
    .describe(
      "Names of knowledge-flagged datasources (ds_list knowledge: true) that hold this document's data",
    ),
}

const TEXT_RULES = [
  "Documents hold text only: no images, data: URIs, base64 or binary, which are rejected.",
  "External https links, including images hosted elsewhere, are fine.",
  "Put structured data and datasets in a datasource flagged for knowledge (ds_execute with knowledge: true), name it in `sources` and describe or link it in the body.",
].join(" ")

const create = z.object({
  path: z.string().describe("Folder path and name, e.g. storage/versioning.md"),
  ...fields,
  title: z.string().min(1),
  body: z.string(),
})

const update = z.object({
  ref: z.string().describe("Document id (kg_...) or path"),
  etag: z
    .string()
    .describe("ETag from kg_read; the write fails if it is stale"),
  ...fields,
  body: z.string().optional(),
})

export type CreateArgs = z.infer<typeof create>

export type UpdateArgs = z.infer<typeof update>

export type KnowledgeDesk = {
  list: (prefix?: string) => unknown
  read: (ref: string, versionId?: string) => Promise<unknown>
  history: (ref: string) => Promise<unknown>
  create: (caller: string, args: CreateArgs) => Promise<unknown>
  update: (caller: string, args: UpdateArgs) => Promise<unknown>
  delete: (caller: string, ref: string, etag: string) => Promise<unknown>
  watch: (caller: string, ref: string, on: boolean) => unknown
}

export type DatasourceDesk = {
  list: () => Promise<unknown>
  query: (name: string, sql: string, params: unknown[]) => Promise<unknown>
  execute: (
    name: string,
    sql: string,
    params: unknown[],
    create: boolean,
    knowledge: boolean | undefined,
  ) => Promise<unknown>
}

export type AppsDesk = {
  list: () => unknown
  save: (
    caller: string,
    app: { title: string; icon?: string; blocks: unknown[] },
  ) => Promise<unknown>
}

export type CalendarDesk = {
  list: (from: string, to: string) => Promise<unknown>
  add: (caller: string, event: EventInput) => Promise<unknown>
}

export type ChannelDesk = {
  send: (to: string, text: string) => Promise<unknown>
}

export type Desk = {
  apps: AppsDesk
  channels: ChannelDesk
  calendar: CalendarDesk
  knowledge: KnowledgeDesk
  datasource: DatasourceDesk
  show: (caller: string | null, blocks: Block[]) => void
  sessions: (caller: string) => Promise<Reachable[]>
  send: (
    caller: string,
    message: Message,
  ) => Promise<{ thread: string; queued: boolean }>
  open: (caller: string, args: OpenArgs) => Promise<unknown>
  close: (caller: string, session: string) => Promise<unknown>
}

const LEDGER = [
  "Ledger convention: each project's worker keeps its status in the knowledge document ledger/<project>.md and is the only session that writes it;",
  "the orchestrator reads those and writes only ledger/index.md, the overview of all projects.",
].join(" ")

const json = (value: unknown) => ({
  content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }],
})

const callerOf = (caller: Caller) => {
  const id = caller()

  if (!id) {
    throw new Error(
      "session_unbound: this MCP connection has no Atrix session yet",
    )
  }

  return id
}

export const atrixTools = (caller: Caller, desk: Desk) => {
  const server = newServer()

  server.registerTool(
    SHOW_UI,
    {
      description: [
        "Render native UI blocks in the user's Atrix chat, right after this tool call. This is your rendering primitive:",
        "use it instead of ASCII art or long markdown when a table, chart, key facts, links, image, 3D scene or a choice helps the user.",
        "Blocks: card, keyvalue, table, list, bar, image, links, scene (primitive 3D shapes, y up), actions (buttons) and form.",
        "A pressed button or a submitted form comes back to you as the user's next message.",
        "A query block shows live rows from an Atrix datasource (see ds_list). Text only, never HTML or scripts.",
        "To keep a view for later, save the same blocks with app_save.",
      ].join(" "),
      inputSchema: showUiInput,
    },
    async ({ blocks }) => {
      desk.show(caller(), blocks)

      return json({ shown: blocks.length })
    },
  )

  server.registerTool(
    "app_list",
    {
      description:
        "List apps the user saved in Atrix. Each app is a set of show_ui blocks the user can reopen from the Apps home.",
      inputSchema: z.object({}),
    },
    async () => json(desk.apps.list()),
  )

  server.registerTool(
    "app_save",
    {
      description: [
        "Save a reusable app to the user's Atrix Apps home. An app is a titled set of show_ui blocks.",
        "Use query blocks to show live datasource data so the app stays current every time it opens.",
      ].join(" "),
      inputSchema: z.object({
        title: z.string().trim().min(1).max(80),
        icon: z
          .string()
          .max(80)
          .optional()
          .describe("Iconify name such as lucide:chart-bar"),
        blocks: showUiInput.shape.blocks,
      }),
    },
    async app => json(await desk.apps.save(callerOf(caller), app)),
  )

  server.registerTool(
    "list_sessions",
    {
      description:
        "List other Atrix agent sessions that can receive messages, on this device and on every online Atrix device in the user's network. Sessions on other devices have ids ending in @<device> and a `host` field naming the device.",
      inputSchema: z.object({}),
    },
    async () => json(await desk.sessions(callerOf(caller))),
  )

  server.registerTool(
    "send_message",
    {
      description: [
        "Send a message to another Atrix agent session. It arrives there as a new user turn,",
        "or after its current turn ends. Pass `thread` from a received <atrix-message> to reply",
        "in the same thread. Each thread allows 20 messages per 10 minutes, so reply only",
        "when the message needs an answer. If a queued message cannot be delivered later,",
        "you get an <atrix-message-failed> message with the reason.",
      ].join(" "),
      inputSchema: z.object({
        to: z
          .string()
          .describe(
            "Target session id from list_sessions, or exact session title; append @<device> for a session on another device",
          ),
        text: z.string().min(1),
        thread: z.string().optional(),
        refs: z.array(z.string()).optional().describe("Knowledge document ids"),
      }),
    },
    async message => json(await desk.send(callerOf(caller), message)),
  )

  server.registerTool(
    "open_session",
    {
      description: [
        "Open a long-lived worker session for one project, or get the existing one with the same title and cwd (also after a restart).",
        "Pattern: one orchestrator session talks to the user and delegates; each project gets one worker that does the work in its own folder.",
        "Give the worker its task with send_message using the returned id; its replies come back to you as <atrix-message>.",
        "Workers stay open and are restored when Atrix restarts. The worker reuses the model, mode and effort last chosen for that harness and folder.",
        LEDGER,
      ].join(" "),
      inputSchema: openArgs,
    },
    async args => json(await desk.open(callerOf(caller), args)),
  )

  server.registerTool(
    "close_session",
    {
      description: [
        "Close a worker session that was opened with open_session, when its project needs no more work.",
        "A session cannot close itself. The worker's ledger/<project>.md stays in the knowledge graph.",
      ].join(" "),
      inputSchema: z.object({
        session: z.string().min(1).describe("Worker session id or exact title"),
      }),
    },
    async ({ session }) => json(await desk.close(callerOf(caller), session)),
  )

  server.registerTool(
    "channel_send",
    {
      description: [
        "Post a message to a chat channel bound to an Atrix session in Settings > Channels.",
        "Only bound Discord channels are accepted. Long text is split automatically.",
      ].join(" "),
      inputSchema: z.object({
        to: z.string().describe("Discord channel id of a bound channel"),
        text: z.string().min(1),
      }),
    },
    async ({ to, text }) => json(await desk.channels.send(to, text)),
  )

  const { knowledge } = desk

  server.registerTool(
    "kg_list",
    {
      description:
        "List shared knowledge documents with id, path, title and etag.",
      inputSchema: z.object({ prefix: z.string().optional() }),
    },
    async ({ prefix }) => json(knowledge.list(prefix)),
  )

  server.registerTool(
    "kg_read",
    {
      description:
        "Read one knowledge document: frontmatter, markdown body and the etag needed to update it. Pass a versionId from kg_history to read an older version, also of a deleted document.",
      inputSchema: z.object({
        ref: z.string().describe("Document id or path"),
        versionId: z.string().optional(),
      }),
    },
    async ({ ref, versionId }) => json(await knowledge.read(ref, versionId)),
  )

  server.registerTool(
    "kg_create",
    {
      description: [
        "Create a knowledge document. Atrix fills id, timestamps and author. Link other documents with [[kg_id]] in the body or `links`.",
        TEXT_RULES,
      ].join(" "),
      inputSchema: create,
    },
    async args => json(await knowledge.create(callerOf(caller), args)),
  )

  server.registerTool(
    "kg_update",
    {
      description: [
        "Update a knowledge document. Pass the etag you read. On conflict the result holds the latest version: merge it and retry with its etag.",
        TEXT_RULES,
      ].join(" "),
      inputSchema: update,
    },
    async args => json(await knowledge.update(callerOf(caller), args)),
  )

  server.registerTool(
    "kg_delete",
    {
      description:
        "Delete a knowledge document. Pass the etag you read; on conflict the result holds the latest version. History is kept: kg_history and kg_read with a versionId still reach every earlier version.",
      inputSchema: z.object({
        ref: z.string().describe("Document id or path"),
        etag: z.string().describe("ETag from kg_read"),
      }),
    },
    async ({ ref, etag }) =>
      json(await knowledge.delete(callerOf(caller), ref, etag)),
  )

  server.registerTool(
    "kg_history",
    {
      description:
        "List the versions of a knowledge document with their authors, also after it was deleted. A deleted: true entry marks the deletion.",
      inputSchema: z.object({ ref: z.string() }),
    },
    async ({ ref }) => json(await knowledge.history(ref)),
  )

  server.registerTool(
    "kg_subscribe",
    {
      description:
        "Get a <atrix-knowledge-change id=...> message whenever someone else changes this document. Set `on` to false to stop.",
      inputSchema: z.object({ ref: z.string(), on: z.boolean().default(true) }),
    },
    async ({ ref, on }) =>
      json({ id: knowledge.watch(callerOf(caller), ref, on), on }),
  )

  const { calendar } = desk

  const instant = z
    .string()
    .min(1)
    .describe("ISO 8601 date-time, or YYYY-MM-DD for local midnight")

  server.registerTool(
    "calendar_list",
    {
      description:
        "List the user's Atrix calendar events that overlap the range from `from` to `to`.",
      inputSchema: z.object({ from: instant, to: instant }),
    },
    async ({ from, to }) => json(await calendar.list(from, to)),
  )

  server.registerTool(
    "calendar_add",
    {
      description: [
        "Add an event to the user's Atrix calendar. For an all-day event set allDay",
        "and pass dates; `end` is exclusive, so a one-day event ends the next day.",
        "Set recurrence to repeat it.",
      ].join(" "),
      inputSchema: z.object({
        title: z.string().trim().min(1).max(200),
        start: instant,
        end: instant,
        allDay: z.boolean().optional(),
        note: z.string().max(4000).optional(),
        recurrence: z
          .enum(["none", "daily", "weekdays", "weekly", "monthly", "yearly"])
          .optional(),
        until: z.iso
          .date()
          .optional()
          .describe("Last date of a recurring series, YYYY-MM-DD"),
        shift: z
          .enum(["next", "previous"])
          .optional()
          .describe(
            "Move weekly, monthly or yearly occurrences that land on a weekend or holiday",
          ),
        tags: z
          .array(z.string().trim().min(1).max(60))
          .max(20)
          .optional()
          .describe("Tag names; missing tags are created"),
      }),
    },
    async event => json(await calendar.add(callerOf(caller), event)),
  )

  const { datasource } = desk

  const statement = {
    name: z.string().describe("Database name from ds_list"),
    sql: z
      .string()
      .min(1)
      .describe("Exactly one SQLite statement with ? placeholders"),
    params: z
      .array(z.union([z.string(), z.number(), z.boolean(), z.null()]))
      .default([])
      .describe("Values bound to the ? placeholders, in order"),
  }

  server.registerTool(
    "ds_list",
    {
      description:
        "List Atrix datasources (embedded SQLite databases for generated apps and knowledge data) with their tables. knowledge: true marks a datasource for the knowledge base, which documents may name in `sources`. Read a table's columns with ds_query on sqlite_schema or PRAGMA table_info.",
      inputSchema: z.object({}),
    },
    async () => json(await datasource.list()),
  )

  server.registerTool(
    "ds_query",
    {
      description:
        "Run one read statement on a datasource and get columns and rows. Put every value in `params`, never inline it into `sql`. Multiple statements are rejected.",
      inputSchema: z.object(statement),
    },
    async ({ name, sql, params }) =>
      json(await datasource.query(name, sql, params)),
  )

  server.registerTool(
    "ds_execute",
    {
      description:
        "Run one write or schema statement on a datasource and get the changed row count and last insert rowid. Put every value in `params`, never inline it into `sql`. Multiple statements are rejected; send them one call at a time.",
      inputSchema: z.object({
        ...statement,
        create: z
          .boolean()
          .default(false)
          .describe("Create the database first when it does not exist"),
        knowledge: z
          .boolean()
          .optional()
          .describe(
            "Set true when the database holds data for knowledge documents; false clears the flag",
          ),
      }),
    },
    async ({ name, sql, params, create, knowledge }) =>
      json(await datasource.execute(name, sql, params, create, knowledge)),
  )

  return server
}
