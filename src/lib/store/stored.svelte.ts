import type { z } from "zod"

export const persist = <T>(key: string, value: T, empty: T) => {
  const raw = JSON.stringify(value)

  if (raw === JSON.stringify(empty)) {
    localStorage.removeItem(key)
  } else {
    localStorage.setItem(key, raw)
  }
}

export const persisted = <T>(
  key: string,
  fallback: T,
  schema: z.ZodType<T>,
): T => {
  try {
    const raw = localStorage.getItem(key)

    if (raw === null) {
      return fallback
    }

    const parsed = schema.safeParse(JSON.parse(raw))

    return parsed.success ? parsed.data : fallback
  } catch {
    return fallback
  }
}

export class Stored<T> {
  #values = $state<Record<string, T>>({})

  constructor(
    private readonly prefix: string,
    private readonly empty: T,
    private readonly schema: z.ZodType<T>,
  ) {}

  get = (id: string): T =>
    id in this.#values
      ? this.#values[id]
      : persisted(this.prefix + id, this.empty, this.schema)

  set = (id: string, value: T) => {
    this.#values[id] = value

    try {
      persist(this.prefix + id, value, this.empty)
    } catch {
      return
    }
  }
}
