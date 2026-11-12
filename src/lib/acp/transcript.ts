import { z } from "zod"
import {
  appendText,
  attachFile,
  type ChatItem,
  DETAIL_LIMIT,
  type Log,
} from "./items.ts"

const KINDS: Record<string, string> = {
  Bash: "execute",
  PowerShell: "execute",
  Read: "read",
  Write: "edit",
  Edit: "edit",
  MultiEdit: "edit",
  NotebookEdit: "edit",
  Grep: "search",
  Glob: "search",
  WebFetch: "fetch",
  WebSearch: "fetch",
  Agent: "think",
  Task: "think",
}

const SUBJECTS = [
  "description",
  "file_path",
  "pattern",
  "url",
  "query",
  "command",
  "prompt",
]

const textBlock = z.object({ type: z.literal("text"), text: z.string() })

const imageBlock = z.object({
  type: z.literal("image"),
  source: z.object({ media_type: z.string(), data: z.string() }).optional(),
})

const thinkingBlock = z.object({
  type: z.literal("thinking"),
  thinking: z.string(),
})

const toolUse = z.object({
  type: z.literal("tool_use"),
  id: z.string(),
  name: z.string(),
  input: z.record(z.string(), z.unknown()).catch({}),
})

const toolResult = z.object({
  type: z.literal("tool_result"),
  tool_use_id: z.string(),
  is_error: z.boolean().optional(),
  content: z
    .union([z.string(), z.array(z.object({ text: z.string().optional() }))])
    .optional(),
})

const queuedPrompt = z.object({
  type: z.literal("queued_command"),
  prompt: z.string(),
  origin: z.object({ kind: z.literal("human") }),
})

const record = z.object({
  type: z.string(),
  attachment: z.unknown().optional(),
  operation: z.string().optional(),
  content: z.string().optional(),
  isMeta: z.boolean().optional(),
  isSidechain: z.boolean().optional(),
  message: z
    .object({
      id: z.string().optional(),
      content: z.union([z.string(), z.array(z.unknown())]),
    })
    .optional(),
})

const visible = (text: string) =>
  text.trim() !== "" && !text.trimStart().startsWith("<")

const subjectOf = (input: Record<string, unknown>) => {
  const key = SUBJECTS.find(k => typeof input[k] === "string")

  return key ? String(input[key]).split("\n")[0] : ""
}

const resultText = (content: z.infer<typeof toolResult>["content"]) =>
  typeof content === "string"
    ? content
    : (content ?? []).map(c => c.text ?? "").join("\n")

const settle = (items: ChatItem[], result: z.infer<typeof toolResult>) => {
  const tool = items.find(i => i.type === "tool" && i.id === result.tool_use_id)

  if (tool?.type !== "tool") {
    return
  }

  tool.status = result.is_error ? "failed" : "completed"
  tool.detail = [tool.detail, resultText(result.content)]
    .filter(Boolean)
    .join("\n\n")
    .slice(0, DETAIL_LIMIT)
}

const parseLine = (line: string) => {
  try {
    return record.safeParse(JSON.parse(line))
  } catch {
    return null
  }
}

const unqueue = (queue: string[], text: string) => {
  const at = queue.indexOf(text)

  if (at !== -1) {
    queue.splice(at, 1)
  }
}

const applyQueue = (queue: string[], operation: string, content = "") => {
  if (operation === "enqueue" && visible(content) && !content.startsWith("/")) {
    queue.push(content)
  } else if (operation === "remove") {
    unqueue(queue, content)
  } else if (operation === "popAll") {
    queue.length = 0
  }
}

const appendUser = (items: ChatItem[], queue: string[], text: string) => {
  unqueue(queue, text)
  appendText(items, "user", text, undefined)
}

export const applyTranscript = ({ items, queue }: Log, line: string) => {
  const parsed = parseLine(line)

  if (!parsed?.success || parsed.data.isSidechain) {
    return
  }

  if (parsed.data.type === "queue-operation") {
    applyQueue(queue, parsed.data.operation ?? "", parsed.data.content)

    return
  }

  const queued = queuedPrompt.safeParse(parsed.data.attachment)

  if (queued.success && visible(queued.data.prompt)) {
    appendUser(items, queue, queued.data.prompt)

    return
  }

  const { type, isMeta, message } = parsed.data

  if (!message || isMeta || (type !== "user" && type !== "assistant")) {
    return
  }

  const blocks =
    typeof message.content === "string"
      ? [{ type: "text", text: message.content }]
      : message.content

  for (const b of blocks) {
    const text = textBlock.safeParse(b)
    const thinking = thinkingBlock.safeParse(b)
    const use = toolUse.safeParse(b)
    const result = toolResult.safeParse(b)
    const image = imageBlock.safeParse(b)

    if (text.success && type === "user" && visible(text.data.text)) {
      appendUser(items, queue, text.data.text)
    } else if (text.success && type === "assistant") {
      appendText(items, "agent", text.data.text, message.id)
    } else if (thinking.success && thinking.data.thinking.trim()) {
      appendText(items, "thought", thinking.data.thinking, message.id)
    } else if (use.success) {
      const subject = subjectOf(use.data.input)

      items.push({
        type: "tool",
        id: use.data.id,
        title: subject ? `${use.data.name}: ${subject}` : use.data.name,
        kind: KINDS[use.data.name] ?? "other",
        status: "in_progress",
        detail: JSON.stringify(use.data.input, null, 2).slice(0, DETAIL_LIMIT),
      })
    } else if (result.success) {
      settle(items, result.data)
    } else if (image.success && type === "user") {
      const source = image.data.source

      attachFile(items, {
        name: "image",
        mimeType: source?.media_type ?? "image/png",
        url: source ? `data:${source.media_type};base64,${source.data}` : null,
      })
    }
  }
}
