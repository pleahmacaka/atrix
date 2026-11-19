import {
  agentInstructions,
  agents,
  providerOf,
} from "#lib/agents/agents.svelte.ts"
import { hostById, LOCAL } from "#lib/p2p/hosts.svelte.ts"
import { m } from "#lib/paraglide/messages.js"
import { recents } from "#lib/store/recent.ts"
import { conversationFile, documentFile } from "./mentions/file.ts"
import { TAGS, tagged } from "./tags.ts"

export type Mention =
  | { kind: "session"; host: string; id: string; title: string }
  | { kind: "chat"; id: string; title: string }
  | { kind: "doc"; key: string; title: string }
  | { kind: "agent"; id: string; title: string }
  | { kind: "member"; id: string; title: string }

export type Suggestion = {
  token: string
  label: string
  detail: string
  icon: string
  mention: Mention
}

export type Trigger = "/" | "#" | "@"

export type Token = {
  trigger: Trigger
  query: string
  start: number
  end: number
}

const TRIGGERS = new Set<string>(["/", "#", "@"])

const LIMIT = 50

export const tokenAt = (text: string, caret: number): Token | null => {
  const before = text.slice(0, caret)
  const start =
    Math.max(...[" ", "\n", "\t"].map(c => before.lastIndexOf(c))) + 1
  const word = before.slice(start)
  const trigger = word[0]

  if (!trigger || !TRIGGERS.has(trigger) || (trigger === "/" && start > 0)) {
    return null
  }

  return {
    trigger: trigger === "/" || trigger === "#" ? trigger : "@",
    query: word.slice(1).toLowerCase(),
    start,
    end: caret,
  }
}

const byPrefix = (query: string) => (a: Suggestion, b: Suggestion) =>
  Number(!a.label.toLowerCase().startsWith(query)) -
  Number(!b.label.toLowerCase().startsWith(query))

const matching = (items: Suggestion[], query: string) =>
  items
    .filter(s => s.label.toLowerCase().includes(query))
    .toSorted(byPrefix(query))
    .slice(0, LIMIT)

export const conversations = (query: string, self: string) =>
  matching(
    recents().flatMap((r): Suggestion[] => {
      const { current } = r

      if (current.kind === "session" && current.id !== self) {
        return [
          {
            token: `#${r.title}`,
            label: r.title,
            detail: r.source,
            icon: r.icon,
            mention: {
              kind: "session",
              host: current.host,
              id: current.id,
              title: r.title,
            },
          },
        ]
      }

      if (current.kind === "chat" && current.id !== self) {
        return [
          {
            token: `#${r.title}`,
            label: r.title,
            detail: r.source,
            icon: r.icon,
            mention: { kind: "chat", id: current.id, title: r.title },
          },
        ]
      }

      return []
    }),
    query,
  )

export const documents = (query: string) =>
  matching(
    (hostById(LOCAL)?.knowledge ?? []).map(e => {
      const title = e.meta.title || e.key

      return {
        token: `#${title}`,
        label: title,
        detail: e.key,
        icon: "lucide:file-text",
        mention: { kind: "doc", key: e.key, title },
      }
    }),
    query,
  )

export const people = (query: string) =>
  matching(
    agents.list.map(a => ({
      token: `@${a.name}`,
      label: a.name,
      detail: providerOf(a)?.label ?? "",
      icon: providerOf(a)?.icon ?? "lucide:bot",
      mention: { kind: "agent", id: a.id, title: a.name },
    })),
    query,
  )

const agentLine = (id: string) => {
  const agent = agents.find(id)

  if (!agent) {
    return []
  }

  const provider = providerOf(agent)
  const reach =
    provider?.kind === "harness"
      ? [
          `harness "${provider.harness}"`,
          provider.host !== LOCAL && `on device "${provider.detail}"`,
        ]
          .filter(Boolean)
          .join(" ")
      : "an API model, not reachable as an Atrix session"
  const facts = [
    `provider: ${reach}`,
    agent.model && `model: ${agent.model}`,
    agent.effort && `effort: ${agent.effort}`,
    agent.cwd && `folder: ${agent.cwd}`,
  ].filter(Boolean)

  return [
    `- [@${agent.name}] (agent id ${agent.id}; ${facts.join("; ")})`,
    "  Instructions:",
    ...agentInstructions(agent, agent.cwd)
      .split("\n")
      .map(line => `  ${line}`),
  ]
}

const agentBlock = (ids: string[]) => {
  const lines = ids.flatMap(agentLine)

  if (lines.length === 0) {
    return ""
  }

  return tagged(
    TAGS.agents,
    [
      "The user mentioned these Atrix agents. Use each one as a subagent for this request, not as a chat room.",
      ...lines,
      "How to call one:",
      "- With the atrix MCP tools: open_session with its harness (and host when a device is named), its folder and a title, then send its instructions and the task with send_message. The reply comes back as <atrix-message>.",
      "- Without those tools, or for an API model: run it with your own subagent or task tool, passing its instructions and model.",
      "You decide whether to keep the subagent alive and reuse it (same title, or resume the same subagent) or to call it fresh without context (close_session and a new title, or a new subagent).",
    ].join("\n"),
  )
}

const mentioned = new Map<string, Suggestion[]>()

export const remember = (draft: string, suggestion: Suggestion) => {
  const known = (mentioned.get(draft) ?? []).filter(
    s => s.token !== suggestion.token,
  )

  mentioned.set(draft, [...known, suggestion])
}

const usedIn = (draft: string, text: string) => {
  const longest = (mentioned.get(draft) ?? []).toSorted(
    (a, b) => b.token.length - a.token.length,
  )
  let rest = text

  return longest.filter(s => {
    const found = rest.includes(s.token)

    rest = rest.replaceAll(s.token, "\u0000")

    return found
  })
}

const bracket = (text: string, used: Suggestion[]) => {
  const marked = used.reduce(
    (out, s, i) => out.replaceAll(s.token, `\u0000${i}\u0000`),
    text,
  )

  return used.reduce(
    (out, s, i) => out.replaceAll(`\u0000${i}\u0000`, `[${s.token}]`),
    marked,
  )
}

const fileOf = (s: Suggestion) => {
  const { mention } = s

  if (mention.kind === "doc") {
    return documentFile(mention.key, mention.title)
  }

  if (mention.kind === "session" || mention.kind === "chat") {
    return conversationFile(mention, mention.title)
  }

  return Promise.reject(new Error(m.chat_no_device()))
}

export const expand = async (draft: string, text: string) => {
  const used = usedIn(draft, text)

  if (used.length === 0) {
    return { text, files: [] }
  }

  const files = await Promise.all(
    used
      .filter(s => s.mention.kind !== "agent" && s.mention.kind !== "member")
      .map(s => fileOf(s).catch(() => [])),
  )
  const block = agentBlock(
    used.flatMap(s => (s.mention.kind === "agent" ? s.mention.id : [])),
  )

  return {
    text: [bracket(text, used), block].filter(Boolean).join("\n\n"),
    files: files.flat(),
  }
}
