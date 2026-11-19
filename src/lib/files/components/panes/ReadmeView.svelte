<script lang="ts">
import Markdown from "#lib/components/chat/Markdown.svelte"
import { extensionOf } from "../../locations"
import { previewText, runAddress } from "../../native"

let { path, name, raw }: { path: string; name: string; raw: boolean } =
  $props()

let text = $state<string | null>(null)

const markdown = $derived([".md", ".markdown", ""].includes(extensionOf(name)))

$effect(() => {
  const target = path
  let live = true

  text = null
  previewText(target)
    .catch(() => "")
    .then(value => {
      if (live) {
        text = value
      }
    })

  return () => {
    live = false
  }
})

const withoutFrontmatter = (source: string) => {
  const lines = source.replaceAll("\r\n", "\n").split("\n")
  const close = lines[0]?.trim() === "---" ? lines.indexOf("---", 1) : -1

  return lines
    .slice(close + 1)
    .join("\n")
    .trim()
}

const follow = (e: MouseEvent) => {
  const link = e.target instanceof Element ? e.target.closest("a") : null

  if (!link) {
    return
  }

  e.preventDefault()

  const href = link.getAttribute("href") ?? ""

  if (href.startsWith("https://") || href.startsWith("http://")) {
    runAddress(href, null).catch(() => undefined)
  }
}

const links = (node: HTMLElement) => {
  node.addEventListener("click", follow)

  return () => node.removeEventListener("click", follow)
}
</script>

{#if text === null}
  <div class="flex grow items-center justify-center">
    <span
      class="loading loading-spinner loading-sm text-base-content/40"
    ></span>
  </div>
{:else if raw || !markdown}
  <pre
    class={[
      "min-h-0 grow overflow-auto px-2 py-1 font-sans text-xs leading-relaxed",
      "break-words whitespace-pre-wrap select-text",
    ]}>{text}</pre>
{:else}
  <div class="min-h-0 grow overflow-auto px-2 py-1 select-text" {@attach links}>
    <Markdown text={withoutFrontmatter(text)} look="wiki compact" />
  </div>
{/if}
