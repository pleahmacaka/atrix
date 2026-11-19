import { drafts, quotes } from "./composer.svelte.ts"

export const quoteInto = (draft: string, text: string, mention = "") => {
  quotes.set(draft, text.trim())

  if (mention && !drafts.get(draft).startsWith(mention)) {
    drafts.set(draft, `${mention} ${drafts.get(draft)}`)
  }

  requestAnimationFrame(() => {
    const field = document.querySelector<HTMLTextAreaElement>(
      `[data-draft="${CSS.escape(draft)}"] textarea`,
    )

    field?.focus()
  })
}

export const quoteTarget = (node: Node | null) =>
  (node instanceof Element ? node : node?.parentElement)?.closest<HTMLElement>(
    "[data-quote]",
  )?.dataset.quote ?? null
