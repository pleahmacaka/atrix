import { z } from "zod"
import { appendText, type ChatItem, DETAIL_LIMIT, type Log } from "./items.ts"

const part = z.object({ type: z.string(), text: z.string().optional() })

const message = z.object({
  type: z.literal("message"),
  id: z.string().optional(),
  role: z.string(),
  content: z.array(part).catch([]),
})

const reasoning = z.object({
  type: z.literal("reasoning"),
  id: z.string().optional(),
  summary: z.array(part).catch([]),
})

const call = z.object({
  type: z.enum(["function_call", "custom_tool_call"]),
  call_id: z.string(),
  name: z.string(),
  arguments: z.string().optional(),
  input: z.string().optional(),
})

const output = z.object({
  type: z.enum(["function_call_output", "custom_tool_call_output"]),
  call_id: z.string(),
  output: z.union([z.string(), z.array(part)]).catch(""),
})

const record = z.object({
  type: z.string(),
  payload: z.object({ type: z.string() }).loose(),
})

const ENDED = new Set(["task_complete", "turn_aborted"])

const failure = z.object({
  turn_id: z.string().optional(),
  error: z.object({ message: z.string() }),
})

const textOf = (parts: z.infer<typeof part>[]) =>
  parts.map(p => p.text ?? "").join("")

const parseLine = (line: string) => {
  try {
    return record.safeParse(JSON.parse(line))
  } catch {
    return null
  }
}

const applyItem = (items: ChatItem[], payload: unknown) => {
  const msg = message.safeParse(payload)
  const thought = reasoning.safeParse(payload)
  const use = call.safeParse(payload)
  const result = output.safeParse(payload)

  if (msg.success && msg.data.role === "user") {
    const text = textOf(msg.data.content)

    if (text.trim() && !text.trimStart().startsWith("<")) {
      appendText(items, "user", text, undefined)
    }
  } else if (msg.success && msg.data.role === "assistant") {
    appendText(items, "agent", textOf(msg.data.content), msg.data.id)
  } else if (thought.success && textOf(thought.data.summary).trim()) {
    appendText(items, "thought", textOf(thought.data.summary), thought.data.id)
  } else if (use.success) {
    items.push({
      type: "tool",
      id: use.data.call_id,
      title: use.data.name,
      kind: "other",
      status: "in_progress",
      detail: (use.data.input ?? use.data.arguments ?? "").slice(
        0,
        DETAIL_LIMIT,
      ),
    })
  } else if (result.success) {
    const tool = items.find(
      i => i.type === "tool" && i.id === result.data.call_id,
    )
    const text =
      typeof result.data.output === "string"
        ? result.data.output
        : textOf(result.data.output)

    if (tool?.type === "tool") {
      tool.status = "completed"
      tool.detail = [tool.detail, text]
        .filter(Boolean)
        .join("\n\n")
        .slice(0, DETAIL_LIMIT)
    }
  }
}

export const applyRollout = (log: Log, line: string) => {
  const parsed = parseLine(line)

  if (!parsed?.success) {
    return
  }

  const { type, payload } = parsed.data

  if (type === "response_item") {
    applyItem(log.items, payload)
  } else if (type === "event_msg" && payload.type === "task_started") {
    log.running = true
  } else if (type === "event_msg" && ENDED.has(payload.type)) {
    log.running = false

    const failed = failure.safeParse(payload)

    if (failed.success) {
      appendText(
        log.items,
        "agent",
        failed.data.error.message,
        `${failed.data.turn_id}:error`,
      )
    }
  }
}
