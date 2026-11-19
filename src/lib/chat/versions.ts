type Named = { name: string }

export const versionOf = (name: string) => {
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
