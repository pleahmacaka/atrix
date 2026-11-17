import type {
  ContentBlock,
  SessionUpdate,
  ToolCall,
  ToolCallContent,
  ToolCallUpdate,
} from "@agentclientprotocol/sdk"
import { type Block, isShowUi, uiBlocksIn } from "#lib/chat/blocks.ts"
import type { ContextUse, Limit } from "#lib/p2p/protocol.ts"
import { baseName } from "#lib/path.ts"

export type ToolItem = {
  type: "tool"
  id: string
  title: string
  kind: string
  status: string
  detail: string
}

export const shownInTurn = (items: ChatItem[], blocks: Block[]) => {
  const wanted = JSON.stringify(blocks)

  for (let i = items.length - 1; i >= 0; i--) {
    const item = items[i]

    if (item.type === "user") {
      return false
    }

    if (item.type === "ui" && JSON.stringify(item.blocks) === wanted) {
      return true
    }
  }

  return false
}

export const attachUi = (
  items: ChatItem[],
  toolId: string,
  name: string,
  input: unknown,
) => {
  const id = `${toolId}:ui`
  const blocks = isShowUi(name) ? uiBlocksIn(input) : null

  if (!blocks || shownInTurn(items, blocks)) {
    return
  }

  const at = items.findIndex(i => i.id === toolId)

  items.splice(at === -1 ? items.length : at + 1, 0, { type: "ui", id, blocks })
}

export type PlanEntry = { content: string; status: string }

export type FileRef = {
  name: string
  mimeType: string
  url: string | null
  path?: string
}

export type TextItem = {
  type: "user" | "agent" | "thought"
  id: string
  text: string
  message?: string
  files?: FileRef[]
}

export type ThoughtItem = TextItem & { type: "thought" }

export type UiItem = { type: "ui"; id: string; blocks: Block[] }

export type ChatItem =
  | TextItem
  | UiItem
  | { type: "plan"; id: string; entries: PlanEntry[] }
  | ToolItem

export type Shell = {
  id: string
  task: string | null
  command: string
  description: string
}

export type Log = {
  items: ChatItem[]
  queue: string[]
  sent: string[]
  running: boolean
  shells: Shell[]
  model?: string
  since?: number
  usage?: Map<string, number>
  context?: ContextUse
  contextFrom?: number
  contextChars?: Record<string, number>
  contextBase?: number
  compacted?: boolean
  toolKinds?: Map<string, string>
  limits?: Limit[]
}

export const DETAIL_LIMIT = 4000

const contentText = (content: ToolCallContent[]) =>
  content
    .map(c => {
      if (c.type === "diff") {
        return `${c.path}\n${c.newText}`
      }

      if (c.type === "content" && c.content.type === "text") {
        return c.content.text
      }

      return ""
    })
    .filter(Boolean)
    .join("\n\n")

const inputText = (input: unknown) => {
  if (input === undefined || input === null) {
    return ""
  }

  if (typeof input === "object" && "command" in input) {
    return String(input.command)
  }

  return JSON.stringify(input, null, 2)
}

const toolOf = (call: ToolCall | ToolCallUpdate, prev?: ToolItem): ToolItem => {
  const detail = [
    inputText(call.rawInput),
    contentText(call.content ?? []),
    (call.locations ?? []).map(l => l.path).join("\n"),
  ]
    .filter(Boolean)
    .join("\n\n")
    .slice(0, DETAIL_LIMIT)

  return {
    type: "tool",
    id: call.toolCallId,
    title: call.title ?? prev?.title ?? "",
    kind: call.kind ?? prev?.kind ?? "other",
    status: call.status ?? prev?.status ?? "pending",
    detail: detail || prev?.detail || "",
  }
}

const TEXT_KINDS = {
  user_message_chunk: "user",
  agent_message_chunk: "agent",
  agent_thought_chunk: "thought",
} as const

export const appendText = (
  items: ChatItem[],
  type: "user" | "agent" | "thought",
  text: string,
  message: string | undefined,
) => {
  const last = items.at(-1)
  const sameMessage =
    last?.type === type &&
    (message ? last.message === message : type !== "user")

  if (sameMessage) {
    last.text += text
  } else {
    items.push({ type, id: crypto.randomUUID(), text, message })
  }
}

const refOf = (content: ContentBlock): FileRef => {
  if (content.type === "image") {
    return {
      name: "image",
      mimeType: content.mimeType,
      url: `data:${content.mimeType};base64,${content.data}`,
    }
  }

  if (content.type === "resource") {
    const name = baseName(content.resource.uri)

    return {
      name: decodeURIComponent(name),
      mimeType: content.resource.mimeType ?? "text/plain",
      url: null,
    }
  }

  if (content.type === "resource_link") {
    return {
      name: content.name,
      mimeType: content.mimeType ?? "application/octet-stream",
      url: null,
    }
  }

  return { name: content.type, mimeType: "application/octet-stream", url: null }
}

export const visible = (text: string) =>
  text.trim() !== "" && !text.trimStart().startsWith("<")

export const settleTool = (
  items: ChatItem[],
  id: string,
  failed: boolean,
  text: string,
) => {
  const tool = items.find(i => i.type === "tool" && i.id === id)

  if (tool?.type !== "tool") {
    return
  }

  tool.status = failed ? "failed" : "completed"
  tool.detail = [tool.detail, text]
    .filter(Boolean)
    .join("\n\n")
    .slice(0, DETAIL_LIMIT)
}

export const attachFile = (items: ChatItem[], file: FileRef) => {
  const last = items.at(-1)

  if (last?.type === "user") {
    last.files = [...(last.files ?? []), file]
  } else {
    items.push({
      type: "user",
      id: crypto.randomUUID(),
      text: "",
      files: [file],
    })
  }
}

export const applyUpdate = (items: ChatItem[], update: SessionUpdate) => {
  if (
    update.sessionUpdate === "user_message_chunk" &&
    update.content.type !== "text"
  ) {
    attachFile(items, refOf(update.content))

    return
  }

  if (update.sessionUpdate in TEXT_KINDS) {
    const kind = TEXT_KINDS[update.sessionUpdate as keyof typeof TEXT_KINDS]
    const content = "content" in update ? update.content : null

    if (content && !Array.isArray(content) && content.type === "text") {
      const message =
        "messageId" in update ? (update.messageId ?? undefined) : undefined

      appendText(items, kind, content.text, message)
    }

    return
  }

  if (
    update.sessionUpdate === "tool_call" ||
    update.sessionUpdate === "tool_call_update"
  ) {
    const index = items.findIndex(
      i => i.type === "tool" && i.id === update.toolCallId,
    )
    const prev = items[index]

    if (index === -1) {
      items.push(toolOf(update))
    } else if (prev.type === "tool") {
      items[index] = toolOf(update, prev)
    }

    const tool = items.find(i => i.id === update.toolCallId)

    if (tool?.type === "tool" && update.rawInput !== undefined) {
      attachUi(items, update.toolCallId, tool.title, update.rawInput)
    }

    return
  }

  if (update.sessionUpdate === "plan") {
    const plan: ChatItem = {
      type: "plan",
      id: crypto.randomUUID(),
      entries: update.entries.map(e => ({
        content: e.content,
        status: e.status,
      })),
    }
    const index = items.findIndex(i => i.type === "plan")

    if (index === -1) {
      items.push(plan)
    } else {
      items[index] = plan
    }
  }
}

const ATTACHMENT = "attachment:///"

const CONTEXT_OPEN = '<context ref="'

const CONTEXT_CLOSE = "</context>"

const IMAGE_DATA = "](data:image/"

const nameOfRef = (ref: string) =>
  decodeURIComponent(
    ref.startsWith(ATTACHMENT) ? ref.slice(ATTACHMENT.length) : baseName(ref),
  )

export const splitContext = (text: string) => {
  const names = new Set<string>()
  let rest = text

  for (
    let open = rest.indexOf(CONTEXT_OPEN);
    open !== -1;
    open = rest.indexOf(CONTEXT_OPEN)
  ) {
    const close = rest.indexOf(CONTEXT_CLOSE, open)

    if (close === -1) {
      break
    }

    const refStart = open + CONTEXT_OPEN.length

    names.add(nameOfRef(rest.slice(refStart, rest.indexOf('"', refStart))))
    rest = rest.slice(0, open) + rest.slice(close + CONTEXT_CLOSE.length)
  }

  for (
    let at = rest.indexOf(ATTACHMENT);
    at !== -1;
    at = rest.indexOf(ATTACHMENT)
  ) {
    const end = rest.slice(at).search(/\s/)
    const stop = end === -1 ? rest.length : at + end

    names.add(nameOfRef(rest.slice(at, stop)))
    rest = rest.slice(0, at) + rest.slice(stop)
  }

  const images: FileRef[] = []

  for (
    let at = rest.indexOf(IMAGE_DATA);
    at !== -1;
    at = rest.indexOf(IMAGE_DATA)
  ) {
    const bracket = rest.lastIndexOf("[", at)
    const start = rest[bracket - 1] === "!" ? bracket - 1 : bracket
    const end = rest.indexOf(")", at)

    if (bracket === -1 || end === -1) {
      break
    }

    const url = rest.slice(at + 2, end)
    const alt = rest.slice(bracket + 1, at).replace("@", "")

    images.push({
      name: alt || "image",
      mimeType: url.slice("data:".length, url.indexOf(";")),
      url,
    })
    rest = rest.slice(0, start) + rest.slice(end + 1)
  }

  const files: FileRef[] = [...names].map(name => ({
    name,
    mimeType: "text/plain",
    url: null,
  }))

  return { text: rest.trim(), files: [...images, ...files] }
}

const QUEUED_IMAGES = ["[Image #", "[Image: source: "]

export const splitQueued = (
  text: string,
  numbered: (n: string) => string,
  imageOf: (n: string) => string | undefined = () => undefined,
) => {
  const files: FileRef[] = []
  let rest = text

  for (const marker of QUEUED_IMAGES) {
    for (
      let at = rest.indexOf(marker);
      at !== -1;
      at = rest.indexOf(marker, at)
    ) {
      const end = rest.indexOf("]", at)

      if (end === -1) {
        break
      }

      const inner = rest.slice(at + marker.length, end).trim()
      const name =
        marker === QUEUED_IMAGES[0] ? numbered(inner) : baseName(inner)

      files.push({
        name,
        mimeType: "image/png",
        url: marker === QUEUED_IMAGES[0] ? (imageOf(inner) ?? null) : null,
        ...(marker === QUEUED_IMAGES[1] && { path: inner }),
      })
      rest = rest.slice(0, at) + rest.slice(end + 1)
    }
  }

  return { text: rest.trim(), files }
}
