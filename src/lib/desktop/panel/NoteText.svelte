<script lang="ts">
  import { openUrl } from "#lib/desktop/native/index.js"

  let { text, onedit }: { text: string; onedit?: () => void } = $props()

  let markdown = $state<typeof import("@atrix/markdown")>()

  $effect(() => {
    import("@atrix/markdown").then(module => (markdown = module))
  })

  const html = $derived(markdown?.renderMarkdown(text) ?? "")

  const onclick = (e: MouseEvent) => {
    const anchor = e.target instanceof Element ? e.target.closest("a") : null

    if (!anchor) {
      onedit?.()

      return
    }

    e.preventDefault()
    e.stopPropagation()

    if (anchor.hasAttribute("data-external")) {
      openUrl(anchor.href).catch(() => undefined)
    }
  }
</script>

<div role="presentation" class="markdown text-sm text-base-content/85" {onclick}>
  {@html html}
</div>
