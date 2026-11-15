type Named = { name: string }

const versionOf = (name: string) => {
  const words = name.split(" ")
  const at = words.findIndex(w => w !== "" && Number.isFinite(Number(w)))

  return at < 0
    ? null
    : {
        family: words.toSpliced(at, 1).join(" ").toLowerCase(),
        parts: words[at]?.split(".").map(Number) ?? [],
      }
}

const newer = (a: number[], b: number[]) => {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const d = (a[i] ?? 0) - (b[i] ?? 0)

    if (d !== 0) {
      return d > 0
    }
  }

  return false
}

export const olderModels = (models: Named[]) => {
  const best = new Map<string, number[]>()

  for (const { name } of models) {
    const v = versionOf(name)
    const known = v && best.get(v.family)

    if (v && (!known || newer(v.parts, known))) {
      best.set(v.family, v.parts)
    }
  }

  return new Set(
    models
      .filter(({ name }) => {
        const v = versionOf(name)
        const top = v && best.get(v.family)

        return !!v && !!top && newer(top, v.parts)
      })
      .map(m => m.name),
  )
}

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
