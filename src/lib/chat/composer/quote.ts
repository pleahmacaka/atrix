import { SvelteMap } from "svelte/reactivity"

const QUOTE_LIMIT = 600

const quotes = new SvelteMap<string, string>()

export const quoteOf = (draft: string) => quotes.get(draft) ?? null

export const setQuote = (draft: string, text: string) => {
  quotes.set(draft, text)
}

export const clearQuote = (draft: string) => {
  quotes.delete(draft)
}

const clip = (text: string) => {
  const chars = [...text.trim()]

  return chars.length > QUOTE_LIMIT
    ? `${chars.slice(0, QUOTE_LIMIT).join("")}…`
    : text.trim()
}

export const quoted = (text: string) =>
  clip(text)
    .split("\n")
    .map(line => `> ${line}`)
    .join("\n")
