import type { z } from "zod"

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
      if (JSON.stringify(value) === JSON.stringify(this.empty)) {
        localStorage.removeItem(this.prefix + id)
      } else {
        localStorage.setItem(this.prefix + id, JSON.stringify(value))
      }
    } catch {
      return
    }
  }
}
