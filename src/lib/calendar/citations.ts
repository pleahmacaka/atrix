import { docId } from "#lib/knowledge/document.ts"

export type Citation = { id: string; label: string }

const OPEN = "[[kg_"

const CLOSE = "]]"

const parts = (notes: string) => {
  const found: (string | Citation)[] = []
  let rest = notes

  for (;;) {
    const start = rest.indexOf(OPEN)
    const end = start === -1 ? -1 : rest.indexOf(CLOSE, start)

    if (end === -1) {
      found.push(rest)

      return found
    }

    const raw = rest.slice(start, end + CLOSE.length)
    const [id, alias] = rest.slice(start + 2, end).split("|")

    found.push(rest.slice(0, start))
    found.push(docId.safeParse(id).success ? { id, label: alias || id } : raw)
    rest = rest.slice(end + CLOSE.length)
  }
}

export const citationsOf = (notes: string) => {
  const found = parts(notes).filter(p => typeof p !== "string")

  return found.filter((c, i) => found.findIndex(o => o.id === c.id) === i)
}

export const notesText = (notes: string) =>
  parts(notes)
    .map(p => (typeof p === "string" ? p : p.label))
    .join("")

export const cite = (id: string, title: string) =>
  `[[${id}|${title.replaceAll("|", " ").replaceAll("]", " ").trim()}]]`
