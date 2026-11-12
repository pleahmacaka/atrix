import { McpServer } from "@modelcontextprotocol/server"
import { z } from "zod"
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

export type Desk = {
  knowledge: KnowledgeDesk
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

  return server
}
