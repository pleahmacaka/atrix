import { drafts } from "./composer.svelte.ts"

const QUOTE_LIMIT = 600

const quoted = (text: string) => {
  const trimmed = text.trim()
  const chars = [...trimmed]
  const short =
    chars.length > QUOTE_LIMIT
      ? `${chars.slice(0, QUOTE_LIMIT).join("")}…`
      : trimmed

  return short
    .split("\n")
    .map(line => `> ${line}`)
    .join("\n")
}

export const quoteInto = (draft: string, text: string, mention = "") => {
  const head = mention ? `${mention}\n` : ""
  const rest = drafts.get(draft)
  const block = `${head}${quoted(text)}\n\n`

  drafts.set(draft, `${block}${rest}`)

  requestAnimationFrame(() => {
    const field = document.querySelector<HTMLTextAreaElement>(
      `[data-draft="${CSS.escape(draft)}"] textarea`,
    )

    field?.focus()
    field?.setSelectionRange(block.length, block.length)
  })
}

export const quoteTarget = (node: Node | null) =>
  (node instanceof Element ? node : node?.parentElement)?.closest<HTMLElement>(
    "[data-quote]",
  )?.dataset.quote ?? null
