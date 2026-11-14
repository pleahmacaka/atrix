import { McpServer } from "@modelcontextprotocol/server"
import { z } from "zod"
import { SHOW_UI, showUiInput } from "#lib/chat/blocks.ts"
import type { Caller } from "./bridge.ts"

export type Reachable = {
  id: string
  title: string
  harness: string
  running: boolean
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
}

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
  read: (ref: string) => Promise<unknown>
  history: (ref: string) => Promise<unknown>
  create: (caller: string, args: CreateArgs) => Promise<unknown>
  update: (caller: string, args: UpdateArgs) => Promise<unknown>
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
  ) => Promise<unknown>
}

export type AppsDesk = {
  list: () => unknown
  save: (
    caller: string,
    app: { title: string; icon?: string; blocks: unknown[] },
  ) => Promise<unknown>
}

export type Desk = {
  apps: AppsDesk
  knowledge: KnowledgeDesk
  datasource: DatasourceDesk
  sessions: (caller: string) => Reachable[]
  send: (
    caller: string,
    message: Message,
  ) => Promise<{ thread: string; queued: boolean }>
}

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
  const server = new McpServer({ name: "atrix", version: "0.1.0" })

  server.registerTool(
    SHOW_UI,
    {
      description: [
        "Show structured UI to the user inside the Atrix chat: card, keyvalue, table, list, bar chart,",
        "image, links, a 3D scene of primitive shapes, buttons (actions) or a form. Buttons and forms",
        "send the user's answer back to you as a new message. Text only, never HTML or scripts.",
      ].join(" "),
      inputSchema: showUiInput,
    },
    async ({ blocks }) => json({ shown: blocks.length }),
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
        "List other Atrix agent sessions on this device that can receive messages.",
      inputSchema: z.object({}),
    },
    async () => json(desk.sessions(callerOf(caller))),
  )

  server.registerTool(
    "send_message",
    {
      description: [
        "Send a message to another Atrix agent session. It arrives there as a new user turn,",
        "or after its current turn ends. Pass `thread` from a received <atrix-message> to reply",
        "in the same thread. Each thread allows a limited number of messages, so reply only",
        "when the message needs an answer.",
      ].join(" "),
      inputSchema: z.object({
        to: z.string().describe("Target session id or exact session title"),
        text: z.string().min(1),
        thread: z.string().optional(),
        refs: z.array(z.string()).optional().describe("Knowledge document ids"),
      }),
    },
    async message => json(await desk.send(callerOf(caller), message)),
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
        "Read one knowledge document: frontmatter, markdown body and the etag needed to update it.",
      inputSchema: z.object({
        ref: z.string().describe("Document id or path"),
      }),
    },
    async ({ ref }) => json(await knowledge.read(ref)),
  )

  server.registerTool(
    "kg_create",
    {
      description:
        "Create a knowledge document. Atrix fills id, timestamps and author. Link other documents with [[kg_id]] in the body or `links`.",
      inputSchema: create,
    },
    async args => json(await knowledge.create(callerOf(caller), args)),
  )

  server.registerTool(
    "kg_update",
    {
      description:
        "Update a knowledge document. Pass the etag you read. On conflict the result holds the latest version: merge it and retry with its etag.",
      inputSchema: update,
    },
    async args => json(await knowledge.update(callerOf(caller), args)),
  )

  server.registerTool(
    "kg_history",
    {
      description:
        "List the versions of a knowledge document with their authors.",
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
        "List Atrix datasources (embedded SQLite databases for generated apps) with their tables. Read a table's columns with ds_query on sqlite_schema or PRAGMA table_info.",
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
      }),
    },
    async ({ name, sql, params, create }) =>
      json(await datasource.execute(name, sql, params, create)),
  )

  return server
}
