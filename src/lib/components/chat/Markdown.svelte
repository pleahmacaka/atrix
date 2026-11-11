<script module lang="ts">
import DOMPurify from "dompurify"
import { Marked } from "marked"

const markdown = new Marked({
  async: false,
  gfm: true,
  extensions: [
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
let { text }: { text: string } = $props()

const html = $derived(DOMPurify.sanitize(markdown.parse(text, { async: false })))
</script>

<div class="markdown">{@html html}</div>

<style>
  .markdown {
    line-height: 1.7;
    overflow-wrap: anywhere;
    word-break: keep-all;
  }

  .markdown > :global(* + *) {
    margin-top: 1rem;
  }

  .markdown :global(h1),
  .markdown :global(h2),
  .markdown :global(h3),
  .markdown :global(h4) {
    font-weight: 600;
    line-height: 1.35;
    margin-top: 1.5rem;
  }

  .markdown :global(h1) {
    font-size: 1.375rem;
  }

  .markdown :global(h2) {
    font-size: 1.1875rem;
  }

  .markdown :global(h3) {
    font-size: 1.0625rem;
  }

  .markdown :global(ul) {
    list-style: disc;
    padding-left: 1.5rem;
  }

  .markdown :global(ol) {
    list-style: decimal;
    padding-left: 1.5rem;
  }

  .markdown :global(li + li) {
    margin-top: 0.25rem;
  }

  .markdown :global(a) {
    text-decoration: underline;
    text-underline-offset: 0.2em;
  }

  .markdown :global(blockquote) {
    border-left: 0.25rem solid var(--color-base-300);
    padding-left: 1rem;
    opacity: 0.8;
  }

  .markdown :global(code) {
    background: var(--color-base-200);
    border-radius: var(--radius-field);
    padding: 0 0.25rem;
    font-size: 0.875em;
    font-variant-numeric: tabular-nums;
  }

  .markdown :global(pre) {
    background: var(--color-base-200);
    border: var(--border) solid var(--color-base-300);
    border-radius: var(--radius-box);
    padding: 0.75rem 1rem;
    overflow-x: auto;
    font-size: 0.875rem;
    line-height: 1.6;
  }

  .markdown :global(pre code) {
    background: none;
    padding: 0;
    font-size: inherit;
  }

  .markdown :global(table) {
    border-collapse: collapse;
    font-variant-numeric: tabular-nums;
    display: block;
    overflow-x: auto;
  }

  .markdown :global(th),
  .markdown :global(td) {
    border: var(--border) solid var(--color-base-300);
    padding: 0.5rem 0.75rem;
    text-align: left;
  }

  .markdown :global(hr) {
    border-color: var(--color-base-300);
  }
</style>
