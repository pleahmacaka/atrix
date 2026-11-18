export const TAGS = {
  agent: "agent-instructions",
  agents: "atrix-agents",
  handoff: "conversation-history",
  rules: "group-rules",
  history: "group-history",
  data: "group-data",
} as const

export type Tag = (typeof TAGS)[keyof typeof TAGS]

export const tagged = (tag: Tag, body: string) =>
  `<${tag}>\n${body.replaceAll(`</${tag}>`, `</ ${tag}>`)}\n</${tag}>`

const INJECTED = new RegExp(
  `<(${Object.values(TAGS).join("|")})>[\\s\\S]*?</\\1>\\s*`,
  "g",
)

export const withoutInjected = (text: string) => text.replaceAll(INJECTED, "")
