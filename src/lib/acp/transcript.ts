import { z } from "zod"
import {
  appendText,
  attachFile,
  attachUi,
  type ChatItem,
  DETAIL_LIMIT,
  type Log,
  type Shell,
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

const promptBody = z.union([z.string(), z.array(z.unknown())])

const queuedPrompt = z.object({
  type: z.literal("queued_command"),
  prompt: promptBody,
  origin: z.object({ kind: z.literal("human") }),
})

const anyQueued = z.object({
  type: z.literal("queued_command"),
  prompt: promptBody,
})

const promptText = (prompt: z.infer<typeof promptBody>) =>
  typeof prompt === "string"
    ? prompt
    : prompt.flatMap(b => textBlock.safeParse(b).data?.text ?? []).join("")

const promptImages = (prompt: z.infer<typeof promptBody>) =>
  typeof prompt === "string"
    ? []
    : prompt.flatMap(b => imageBlock.safeParse(b).data ?? [])

const SHELL_TOOLS = new Set(["Bash", "PowerShell"])

const STOP_TOOLS = new Set(["TaskStop", "KillShell", "KillBash"])

const NOTIFICATION = "<task-notification>"

const between = (text: string, open: string, close: string) => {
  const start = text.indexOf(open)
  const end = text.indexOf(close, start + open.length)

  return start === -1 || end === -1
    ? null
    : text.slice(start + open.length, end).trim()
}

const finishShell = (shells: Shell[], text: string) => {
  if (!text.includes(NOTIFICATION)) {
    return
  }

  const status = between(text, "<status>", "</status>")
  const use = between(text, "<tool-use-id>", "</tool-use-id>")
  const task = between(text, "<task-id>", "</task-id>")

  if (status && status !== "running") {
    dropShell(shells, s => s.id === use || (!!task && s.task === task))
  }
}

const dropShell = (shells: Shell[], match: (shell: Shell) => boolean) => {
  const at = shells.findIndex(match)

  if (at !== -1) {
    shells.splice(at, 1)
  }
}

const trackUse = (shells: Shell[], use: z.infer<typeof toolUse>) => {
  const { input } = use

  if (SHELL_TOOLS.has(use.name) && input.run_in_background === true) {
    shells.push({
      id: use.id,
      task: null,
      command: String(input.command ?? ""),
      description: String(input.description ?? ""),
    })
  } else if (STOP_TOOLS.has(use.name)) {
    const task = String(input.task_id ?? input.shell_id ?? "")

    dropShell(shells, s => s.task === task)
  }
}

const trackResult = (shells: Shell[], result: z.infer<typeof toolResult>) => {
  const shell = shells.find(s => s.id === result.tool_use_id)
  const text = resultText(result.content)
  const marker = "with ID: "

  if (!shell) {
    return
  }

  if (result.is_error || !text.includes(marker)) {
    dropShell(shells, s => s === shell)

    return
  }

  shell.task =
    text.slice(text.indexOf(marker) + marker.length).split(/[\s.]/)[0] || null
}

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

const applyQueue = (
  { items, queue, sent }: Log,
  operation: string,
  content = "",
) => {
  if (operation === "enqueue" && visible(content) && !content.startsWith("/")) {
    queue.push(content)
  } else if (operation === "remove" && queue.includes(content)) {
    unqueue(queue, content)
    sent.push(content)
    appendText(items, "user", content, undefined)
  } else if (operation === "popAll") {
    queue.length = 0
  }
}

const appendUser = ({ items, queue, sent }: Log, text: string) => {
  unqueue(queue, text)

  const echoed = sent.indexOf(text)

  if (echoed !== -1) {
    sent.splice(echoed, 1)

    return
  }

  appendText(items, "user", text, undefined)
}

export const SHELL_NEEDLES = [
  "run_in_background",
  NOTIFICATION,
  "with ID: ",
  ...STOP_TOOLS,
]

export const applyShells = ({ shells }: Log, line: string) => {
  const parsed = parseLine(line)

  if (!parsed?.success || parsed.data.isSidechain) {
    return
  }

  const notice = anyQueued.safeParse(parsed.data.attachment)

  if (notice.success) {
    finishShell(shells, promptText(notice.data.prompt))
  }

  const { type, message } = parsed.data
  const content = message?.content ?? []
  const blocks =
    typeof content === "string" ? [{ type: "text", text: content }] : content

  for (const b of blocks) {
    const text = textBlock.safeParse(b)
    const use = toolUse.safeParse(b)
    const result = toolResult.safeParse(b)

    if (text.success && type === "user") {
      finishShell(shells, text.data.text)
    } else if (use.success) {
      trackUse(shells, use.data)
    } else if (result.success) {
      trackResult(shells, result.data)
    }
  }
}

export const applyTranscript = (log: Log, line: string) => {
  const { items, shells } = log
  const parsed = parseLine(line)

  if (!parsed?.success || parsed.data.isSidechain) {
    return
  }

  if (parsed.data.type === "queue-operation") {
    applyQueue(log, parsed.data.operation ?? "", parsed.data.content)

    return
  }

  const notice = anyQueued.safeParse(parsed.data.attachment)

  if (notice.success) {
    finishShell(shells, promptText(notice.data.prompt))
  }

  const queued = queuedPrompt.safeParse(parsed.data.attachment)

  const queuedText = queued.success ? promptText(queued.data.prompt) : ""

  if (queued.success && visible(queuedText)) {
    appendUser(log, queuedText)

    for (const { source } of promptImages(queued.data.prompt)) {
      attachFile(items, {
        name: "image",
        mimeType: source?.media_type ?? "image/png",
        url: source ? `data:${source.media_type};base64,${source.data}` : null,
      })
    }

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

    if (text.success && type === "user") {
      finishShell(shells, text.data.text)
    }

    if (text.success && type === "user" && visible(text.data.text)) {
      appendUser(log, text.data.text)
    } else if (text.success && type === "assistant") {
      appendText(items, "agent", text.data.text, message.id)
    } else if (thinking.success && thinking.data.thinking.trim()) {
      appendText(items, "thought", thinking.data.thinking, message.id)
    } else if (use.success) {
      trackUse(shells, use.data)

      const subject = subjectOf(use.data.input)

      items.push({
        type: "tool",
        id: use.data.id,
        title: subject ? `${use.data.name}: ${subject}` : use.data.name,
        kind: KINDS[use.data.name] ?? "other",
        status: "in_progress",
        detail: JSON.stringify(use.data.input, null, 2).slice(0, DETAIL_LIMIT),
      })
      attachUi(items, use.data.id, use.data.name, use.data.input)
    } else if (result.success) {
      trackResult(shells, result.data)
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
