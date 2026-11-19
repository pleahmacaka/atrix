import { type InferUITools, tool, type UIMessage } from "ai"
import { z } from "zod"
import { hostList } from "#lib/p2p/hosts.svelte.ts"
import { m } from "#lib/paraglide/messages.js"
import { SHOW_UI } from "./blocks.ts"
import { showUiInput } from "./ui/part.ts"

const showUi = tool({
  description:
    "Show structured content to the user: card, keyvalue, table, list, bar chart, image, link buttons or a 3D scene of primitive shapes. Text only, never HTML or scripts.",
  inputSchema: showUiInput,
  execute: async ({ blocks }) => ({ shown: blocks.length }),
})

const knowledgeHosts = () => {
  const hosts = hostList()

  if (hosts.length === 0) {
    throw new Error(m.error_host_missing())
  }

  return hosts
}

const kgList = tool({
  description:
    "List the user's shared knowledge documents across connected devices with host, id, path, title and tags.",
  inputSchema: z.object({ prefix: z.string().optional() }),
  execute: async ({ prefix = "" }) => {
    const lists = await Promise.allSettled(
      knowledgeHosts().map(async h => {
        const entries = await h.view.call({ op: "kg.list" })

        return entries
          .filter(e => e.key.startsWith(prefix))
          .map(e => ({
            host: h.id,
            device: h.name,
            id: e.meta.id,
            path: e.key,
            title: e.meta.title,
            tags: e.meta.tags,
          }))
      }),
    )

    return lists.flatMap(l => (l.status === "fulfilled" ? l.value : []))
  },
})

const kgRead = tool({
  description:
    "Read one knowledge document by id or path: frontmatter and markdown body.",
  inputSchema: z.object({
    ref: z.string().describe("Document id or path"),
    host: z.string().optional().describe("host from kg_list"),
  }),
  execute: async ({ ref, host }) => {
    const hosts = knowledgeHosts().filter(h => !host || h.id === host)
    let failure: unknown = new Error(m.error_host_missing())

    for (const h of hosts) {
      try {
        const { key, meta, body } = await h.view.readDoc(ref)

        return { device: h.name, path: key, frontmatter: meta, body }
      } catch (e) {
        failure = e
      }
    }

    throw failure
  },
})

export const TOOLS = { [SHOW_UI]: showUi, kg_list: kgList, kg_read: kgRead }

export type ChatMessage = UIMessage<unknown, never, InferUITools<typeof TOOLS>>
