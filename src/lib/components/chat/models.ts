import { olderModels } from "#lib/chat/versions.ts"
import { m } from "#lib/paraglide/messages.js"

const isVersion = (word: string) =>
  word.length > 0 && word.length <= 2 && Number.isInteger(Number(word))

const modelLabel = (id: string) => {
  const words = id
    .toLowerCase()
    .split("[")[0]
    .split("-")
    .filter(w => w !== "claude")
  const family = words.find(w => Number.isNaN(Number(w))) ?? id
  const version = words.filter(isVersion).join(".")
  const name = family.charAt(0).toUpperCase() + family.slice(1)

  return version ? `${name} ${version}` : name
}

const TERMINAL_MODELS = ["fable", "opus", "sonnet", "haiku"]

export const terminalModel = (model: string | undefined) =>
  TERMINAL_MODELS.find(alias => model?.includes(alias)) ?? ""

export const terminalChoices = (
  model: string | undefined,
  known: { value: string; name: string }[],
) =>
  TERMINAL_MODELS.map(alias => {
    if (model?.includes(alias)) {
      return { value: alias, name: modelLabel(model) }
    }

    const found = known.filter(c =>
      `${c.value} ${c.name}`.toLowerCase().includes(alias),
    )
    const older = olderModels(found)

    return {
      value: alias,
      name: found.find(c => !older.has(c.name))?.name ?? modelLabel(alias),
    }
  })

export const PRIMARY = ["mode", "model", "thought_level"]

export const OPTION_ICONS: Record<string, string> = {
  mode: "lucide:shield-check",
  model: "lucide:cpu",
  thought_level: "lucide:brain",
}

export const efforts = () => [
  { value: "", name: m.effort_default() },
  { value: "low", name: m.effort_low() },
  { value: "medium", name: m.effort_medium() },
  { value: "high", name: m.effort_high() },
  { value: "xhigh", name: m.effort_xhigh() },
  { value: "max", name: m.effort_max() },
]
