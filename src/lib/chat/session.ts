import {
  type ChatItem,
  type FileRef,
  splitContext,
  type TextItem,
  type ThoughtItem,
  type ToolItem,
} from "#lib/acp/items.ts"
import { plainText } from "./plain.ts"
import { withoutInjected } from "./tags.ts"

const INTERRUPTED = "[Request interrupted by user"

const COMPACTED = "This session is being continued from a previous conversation"

export type Activity = ToolItem | ThoughtItem

export type Segment =
  | { kind: "activity"; key: string; items: Activity[] }
  | { kind: "item"; key: string; item: ChatItem }

export type Turn = { id: string; prompt: string; reply: string }

export type Prompt = {
  text: string
  files: FileRef[]
  interrupted: boolean
  compacted: boolean
}

const isActivity = (item: ChatItem): item is Activity => item.type === "tool"

export const promptOf = (item: TextItem): Prompt => {
  const split = splitContext(withoutInjected(item.text))
  const own = item.files ?? []

  return {
    text: split.text,
    files: [
      ...own,
      ...split.files.filter(f => !own.some(g => g.name === f.name)),
    ],
    interrupted: split.text.trim().startsWith(INTERRUPTED),
    compacted: split.text.trim().startsWith(COMPACTED),
  }
}

export const segmentsOf = (items: ChatItem[]) =>
  items.reduce<Segment[]>((all, item) => {
    const last = all.at(-1)

    if (isActivity(item) && last?.kind === "activity") {
      last.items.push(item)
    } else if (isActivity(item)) {
      all.push({ kind: "activity", key: item.id, items: [item] })
    } else {
      all.push({ kind: "item", key: item.id, item })
    }

    return all
  }, [])

export const hasTimeline = (turns: Turn[]) => turns.length > 1

export const turnsOf = (items: ChatItem[]) =>
  items.reduce<Turn[]>((all, item) => {
    if (item.type === "user") {
      const prompt = promptOf(item)
      const text = prompt.text.trim()

      if (text && !prompt.interrupted && !prompt.compacted) {
        all.push({ id: item.id, prompt: plainText(text), reply: "" })
      }
    } else if (item.type === "agent") {
      const last = all.at(-1)

      if (last && !last.reply) {
        last.reply = plainText(item.text)
      }
    }

    return all
  }, [])
