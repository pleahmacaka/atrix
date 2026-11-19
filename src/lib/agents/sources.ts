import type {
  GlobalSkill,
  GlobalTool,
  SkillRef,
  ToolRef,
} from "#lib/p2p/protocol.ts"
import { m } from "#lib/paraglide/messages.js"

type Origin = Pick<GlobalSkill, "owner" | "scope">

type OwnerName = (owner: string) => string

export const SHARED = "shared"

const originLabel = (origin: Origin, name: OwnerName) =>
  origin.scope === "project"
    ? m.agent_source_project({ origin: name(origin.owner) })
    : m.agent_source_global({ origin: name(origin.owner) })

export const sourceLabel = (ref: SkillRef | ToolRef, name: OwnerName) =>
  ref.source === "atrix" ? m.agent_source_atrix() : originLabel(ref, name)

export const byOrigin = <T extends Origin>(items: T[], name: OwnerName) => {
  const groups = new Map<string, T[]>()

  for (const item of items) {
    const label = originLabel(item, name)

    groups.set(label, [...(groups.get(label) ?? []), item])
  }

  return [...groups].map(([label, entries]) => ({ label, entries }))
}

export const toolName = (ref: ToolRef) =>
  ref.source === "atrix" ? ref.server.name : ref.name

export const sameSkill = (ref: SkillRef, skill: GlobalSkill) =>
  ref.source === "global" && ref.dir === skill.dir

export const sameTool = (ref: ToolRef, tool: GlobalTool) =>
  ref.source === "global" && ref.path === tool.path && ref.name === tool.name

const FORBIDDEN = ["/", "\\", ":"]

export const validSkillName = (name: string) =>
  !!name && !name.startsWith(".") && !FORBIDDEN.some(c => name.includes(c))
