<script module lang="ts">
import DOMPurify from "dompurify"
import { Marked } from "marked"

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
})
</script>

<script lang="ts">
let { text, look = "markdown" }: { text: string; look?: "markdown" | "wiki" | "wiki compact" } =
  $props()

const html = $derived(DOMPurify.sanitize(markdown.parse(text, { async: false })))
</script>

<div class={look}>{@html html}</div>
