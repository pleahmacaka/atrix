import { z } from "zod"
import {
  appendText,
  attachFile,
  attachUi,
  DETAIL_LIMIT,
  type FileRef,
  type Log,
  type Shell,
  settleTool,
  visible,
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

const STANDARD_WINDOW = 200_000

const LONG_WINDOW = 1_000_000

const windowOf = (model: string | undefined, used: number) =>
  used > STANDARD_WINDOW || model?.includes("[1m]")
    ? LONG_WINDOW
    : STANDARD_WINDOW

const record = z.object({
  type: z.string(),
  timestamp: z.string().optional(),
  attachment: z.unknown().optional(),
  operation: z.string().optional(),
  content: z.string().optional(),
  isMeta: z.boolean().optional(),
  isSidechain: z.boolean().optional(),
  subtype: z.string().optional(),
  message: z
    .object({
      id: z.string().optional(),
      model: z.string().optional(),
      usage: z
        .object({
          input_tokens: z.number(),
          output_tokens: z.number(),
          cache_read_input_tokens: z.number(),
          cache_creation_input_tokens: z.number(),
        })
        .partial()
        .optional(),
      content: z.union([z.string(), z.array(z.unknown())]),
    })
    .optional(),
})

type Row = z.infer<typeof record>

const tagged = (text: string, tag: string) => {
  const start = text.indexOf(`<${tag}>`)
  const end = text.indexOf(`</${tag}>`)

  return start === -1 || end < start
    ? ""
    : text.slice(start + tag.length + 2, end).trim()
}

const commandOf = ({ type, content, message }: Row) => {
  const text =
    type === "system"
      ? (content ?? "")
      : type === "user" && typeof message?.content === "string"
        ? message.content
        : ""
  const name = tagged(text, "command-name")

  return name
    ? [name, tagged(text, "command-args")].filter(Boolean).join(" ")
    : ""
}

const subjectOf = (input: Record<string, unknown>) => {
  const key = SUBJECTS.find(k => typeof input[k] === "string")

  return key ? String(input[key]).split("\n")[0] : ""
}

const resultText = (content: z.infer<typeof toolResult>["content"]) =>
  typeof content === "string"
    ? content
    : (content ?? []).map(c => c.text ?? "").join("\n")

const blocksOf = (content: string | unknown[]) =>
  typeof content === "string" ? [{ type: "text", text: content }] : content

const imageOf = (source: z.infer<typeof imageBlock>["source"]): FileRef => ({
  name: "image",
  mimeType: source?.media_type ?? "image/png",
  url: source ? `data:${source.media_type};base64,${source.data}` : null,
})

const parseLine = (line: string) => {
  try {
    return record.safeParse(JSON.parse(line))
  } catch {
    return null
  }
}

const mainRecord = (line: string) => {
  const parsed = parseLine(line)

  return parsed?.success && !parsed.data.isSidechain ? parsed.data : null
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
    if (!queue.includes(content)) {
      queue.push(content)
    }
  } else if (operation === "remove" && queue.includes(content)) {
    unqueue(queue, content)
    sent.push(content)
    appendText(items, "user", content, undefined)
  } else if (operation === "popAll") {
    queue.length = 0
  }
}

export const turnTokens = (log: Log) =>
  [...(log.usage?.values() ?? [])].reduce((a, b) => a + b, 0)

const startTurn = (log: Log, at: string | undefined) => {
  log.since = at ? Date.parse(at) : Date.now()
  log.usage = new Map()
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

const trackShells = (shells: Shell[], data: Row) => {
  const notice = anyQueued.safeParse(data.attachment)

  if (notice.success) {
    finishShell(shells, promptText(notice.data.prompt))
  }

  finishShell(shells, data.content ?? "")

  const { type, message } = data

  if (type !== "user" && type !== "assistant") {
    return
  }

  for (const b of blocksOf(message?.content ?? [])) {
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

const toolCategory = (name: string) =>
  name === "Skill" ? "skill" : name.startsWith("mcp__") ? "mcp" : "tool"

const countContext = (log: Log, type: string, content: string | unknown[]) => {
  log.contextChars ??= {}

  const chars = log.contextChars
  const add = (id: string, n: number) => {
    chars[id] = (chars[id] ?? 0) + n
  }

  for (const b of blocksOf(content)) {
    const text = textBlock.safeParse(b)
    const thinking = thinkingBlock.safeParse(b)
    const use = toolUse.safeParse(b)
    const result = toolResult.safeParse(b)

    if (text.success) {
      add(type === "user" ? "user" : "agent", text.data.text.length)
    } else if (thinking.success) {
      add("thought", thinking.data.thinking.length)
    } else if (use.success) {
      const id = toolCategory(use.data.name)

      log.toolKinds ??= new Map()
      log.toolKinds.set(use.data.id, id)
      add(id, JSON.stringify(use.data.input).length)
    } else if (result.success) {
      add(
        log.toolKinds?.get(result.data.tool_use_id) ?? "tool",
        resultText(result.data.content).length,
      )
    }
  }
}

const applyRecord = (log: Log, data: Row) => {
  const { items } = log

  if (data.subtype === "compact_boundary") {
    log.contextFrom = items.length
    log.context = undefined
    log.contextChars = {}
    log.contextBase = undefined
    log.compacted = true
  }

  if (data.type === "queue-operation") {
    applyQueue(log, data.operation ?? "", data.content)

    return
  }

  const queued = queuedPrompt.safeParse(data.attachment)
  const queuedText = queued.success ? promptText(queued.data.prompt) : ""

  if (queued.success && visible(queuedText)) {
    appendUser(log, queuedText)

    for (const { source } of promptImages(queued.data.prompt)) {
      attachFile(items, imageOf(source))
    }

    return
  }

  const { type, isMeta, message, timestamp } = data
  const command = isMeta ? "" : commandOf(data)

  if (command) {
    startTurn(log, timestamp)
    appendUser(log, command)

    return
  }

  if (!message || isMeta || (type !== "user" && type !== "assistant")) {
    return
  }

  if (message.model && !message.model.startsWith("<")) {
    log.model = message.model
  }

  if (type === "assistant" && message.id && message.usage?.output_tokens) {
    log.usage ??= new Map()
    log.usage.set(message.id, message.usage.output_tokens)
  }

  if (type === "assistant" && message.usage?.input_tokens !== undefined) {
    const u = message.usage
    const used =
      (u.input_tokens ?? 0) +
      (u.cache_read_input_tokens ?? 0) +
      (u.cache_creation_input_tokens ?? 0) +
      (u.output_tokens ?? 0)

    log.context = { used, size: windowOf(log.model, used) }

    if (log.compacted && log.contextBase === undefined) {
      log.contextBase = used
    }
  }

  countContext(log, type, message.content)

  for (const b of blocksOf(message.content)) {
    const text = textBlock.safeParse(b)
    const thinking = thinkingBlock.safeParse(b)
    const use = toolUse.safeParse(b)
    const result = toolResult.safeParse(b)
    const image = imageBlock.safeParse(b)

    if (text.success && type === "user" && visible(text.data.text)) {
      startTurn(log, timestamp)
      appendUser(log, text.data.text)
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
      attachUi(items, use.data.id, use.data.name, use.data.input)
    } else if (result.success) {
      settleTool(
        items,
        result.data.tool_use_id,
        !!result.data.is_error,
        resultText(result.data.content),
      )
    } else if (image.success && type === "user") {
      attachFile(items, imageOf(image.data.source))
    }
  }
}

export const SHELL_NEEDLES = [
  "run_in_background",
  NOTIFICATION,
  "with ID: ",
  ...STOP_TOOLS,
]

export const applyShells = ({ shells }: Log, line: string) => {
  const data = mainRecord(line)

  if (data) {
    trackShells(shells, data)
  }
}

export const applyTranscript = (log: Log, line: string) => {
  const data = mainRecord(line)

  if (data) {
    trackShells(log.shells, data)
    applyRecord(log, data)
  }
}

export const stepOf = (lines: string[]) => {
  for (const line of lines.toReversed()) {
    const parsed = parseLine(line)
    const content = parsed?.success ? parsed.data.message?.content : undefined

    if (parsed?.data?.type !== "assistant" || !Array.isArray(content)) {
      continue
    }

    for (const b of content.toReversed()) {
      const use = toolUse.safeParse(b)
      const text = textBlock.safeParse(b)

      if (use.success) {
        return [use.data.name, subjectOf(use.data.input)]
          .filter(Boolean)
          .join(" ")
      }

      if (text.success && text.data.text.trim()) {
        return text.data.text.trim().split("\n")[0]
      }
    }
  }

  return ""
}
