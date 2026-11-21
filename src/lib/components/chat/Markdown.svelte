<script module lang="ts">
import DOMPurify from "dompurify"
import { Marked } from "marked"

const linkOf = (text: string) => {
  try {
    return new URL(text)
  } catch {
    return null
  }
}

const markdown = new Marked({
  async: false,
  gfm: true,
  breaks: true,
  extensions: [
    {
      name: "wikilink",
      level: "inline",
      start: src => src.indexOf("[["),
      tokenizer: src => {
        const end = src.startsWith("[[kg_") ? src.indexOf("]]") : -1
        const [id, alias] = src.slice(2, end).split("|")

        return end === -1
          ? undefined
          : { type: "wikilink", raw: src.slice(0, end + 2), id, alias }
      },
      renderer: token =>
        `<a class="wikilink" data-kg="${token.id}">${token.alias ?? token.id}</a>`,
    },
    {
      name: "tilde",
      level: "inline",
      start: src => src.indexOf("~"),
      tokenizer: src =>
        src.startsWith("~") && !src.startsWith("~~")
          ? { type: "tilde", raw: "~" }
          : undefined,
      renderer: () => "~",
    },
  ],
  renderer: {
    codespan({ text }) {
      const url = linkOf(text.trim())

      if (url?.protocol !== "http:" && url?.protocol !== "https:") {
        return false
      }

      const shown = text
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")

      return `<a href="${url.href.replaceAll('"', "%22")}"><code>${shown}</code></a>`
    },
  },
})
</script>

<script lang="ts">
let { text, look = "markdown" }: { text: string; look?: "markdown" | "bubble markdown" | "wiki" | "wiki compact" } =
  $props()

const html = $derived(DOMPurify.sanitize(markdown.parse(text, { async: false })))
</script>

<div class={look}>{@html html}</div>
