import type { ChatItem } from "#lib/acp/items.ts"
import { hostById, LOCAL } from "#lib/p2p/hosts.svelte.ts"
import { m } from "#lib/paraglide/messages.js"
import { chats } from "../chats.svelte.ts"

const TRANSCRIPT_CHARS = 20_000

const transcriptOf = (items: ChatItem[]) =>
  items
    .flatMap(i =>
      i.type === "user"
        ? `User: ${i.text}`
        : i.type === "agent"
          ? `Assistant: ${i.text}`
          : [],
    )
    .join("\n\n")
    .slice(-TRANSCRIPT_CHARS)

const sessionText = async (host: string, id: string) => {
  const view = hostById(host)

  if (!view) {
    throw new Error(m.chat_no_device())
  }

  const opened = !!view.views[id]

  await view.open(id)

  const text = transcriptOf(view.views[id]?.items ?? [])

  if (!opened) {
    await view.close(id).catch(() => {})
  }

  return text
}

const chatText = (id: string) =>
  (chats.find(id)?.messages ?? [])
    .map(message => {
      const text = message.parts
        .flatMap(p => (p.type === "text" ? p.text : []))
        .join("")

      return `${message.role === "user" ? "User" : "Assistant"}: ${text}`
    })
    .join("\n\n")
    .slice(-TRANSCRIPT_CHARS)

type ConversationRef =
  | { kind: "session"; host: string; id: string }
  | { kind: "chat"; id: string }

const fileOf = (body: string, title: string) =>
  new File([body], `${title}.md`, { type: "text/markdown" })

export const documentFile = async (key: string, title: string) => {
  const doc = await hostById(LOCAL)?.readDoc(key)

  return fileOf(
    `<atrix-document key="${key}" title="${title}">\n${doc?.text ?? ""}\n</atrix-document>`,
    title,
  )
}

export const conversationFile = async (ref: ConversationRef, title: string) => {
  const text =
    ref.kind === "session"
      ? await sessionText(ref.host, ref.id)
      : chatText(ref.id)

  return fileOf(
    `<atrix-conversation title="${title}">\n${text}\n</atrix-conversation>`,
    title,
  )
}
