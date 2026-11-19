import type * as acp from "@agentclientprotocol/sdk"
import { startsSubagent } from "./claudeTools.ts"

export class Subagents {
  #running = new Map<string, Map<string, string>>()

  list = (sessionId: string) =>
    [...(this.#running.get(sessionId) ?? [])].map(([id, description]) => ({
      id,
      description,
    }))

  forget = (sessionId: string) => {
    this.#running.delete(sessionId)
  }

  track = (sessionId: string, update: acp.SessionUpdate) => {
    if (
      update.sessionUpdate !== "tool_call" &&
      update.sessionUpdate !== "tool_call_update"
    ) {
      return false
    }

    const running = this.#running.get(sessionId) ?? new Map<string, string>()

    if (!running.has(update.toolCallId) && !startsSubagent(update._meta)) {
      return false
    }

    const before = running.size

    if (update.status === "completed" || update.status === "failed") {
      running.delete(update.toolCallId)
    } else {
      running.set(
        update.toolCallId,
        update.title ?? running.get(update.toolCallId) ?? "",
      )
    }

    this.#running.set(sessionId, running)

    return running.size !== before
  }
}
