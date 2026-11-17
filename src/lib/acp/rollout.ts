import { z } from "zod"
import {
  appendText,
  type ChatItem,
  DETAIL_LIMIT,
  type Log,
  settleTool,
  visible,
} from "./items.ts"

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

const window = z.object({
  used_percent: z.number(),
  window_minutes: z.number(),
  resets_at: z.number().nullable().optional(),
})

const tokenCount = z.object({
  info: z
    .object({
      last_token_usage: z.object({ total_tokens: z.number() }),
      model_context_window: z.number(),
    })
    .nullable()
    .optional(),
  rate_limits: z
    .object({
      primary: window.nullable().optional(),
      secondary: window.nullable().optional(),
    })
    .nullable()
    .optional(),
})

const limitOf = (w: z.infer<typeof window>) => ({
  id: w.window_minutes >= 10080 ? "week" : `${w.window_minutes}m`,
  percent: w.used_percent,
  resetsAt: w.resets_at ? w.resets_at * 1000 : null,
})

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

    if (visible(text)) {
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
    const { call_id, output } = result.data
    const text = typeof output === "string" ? output : textOf(output)

    settleTool(items, call_id, false, text)
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
  } else if (type === "event_msg" && payload.type === "token_count") {
    const counted = tokenCount.safeParse(payload)

    if (counted.success && counted.data.info) {
      log.context = {
        used: counted.data.info.last_token_usage.total_tokens,
        size: counted.data.info.model_context_window,
      }
    }

    const limits = counted.data?.rate_limits

    if (limits) {
      log.limits = [limits.primary, limits.secondary].flatMap(w =>
        w ? [limitOf(w)] : [],
      )
    }
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
