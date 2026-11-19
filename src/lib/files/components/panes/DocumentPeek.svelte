<script lang="ts">
import EmptyState from "#lib/components/ui/EmptyState.svelte"
import { m } from "#lib/paraglide/messages.js"

const { url, name }: { url: string; name: string } = $props()

let failed = $state(false)

const mount = (host: HTMLElement) => {
  let cleanup: (() => void) | undefined
  let gone = false

  Promise.all([
    import("#lib/doc-preview/index.ts"),
    fetch(url).then(response => response.arrayBuffer()),
  ])
    .then(async ([{ renderDocument }, buffer]) => {
      if (gone) {
        return
      }

      const next = await renderDocument(new Uint8Array(buffer), name, host)

      if (gone) {
        next()
      } else {
        cleanup = next
      }
    })
    .catch(() => (failed = true))

  return () => {
    gone = true
    cleanup?.()
  }
}
</script>

{#if failed}
  <EmptyState
    icon="lucide:file-x"
    text={m.files_peek_document_failed()}
    centered
  />
{:else}
  {#key url}
    <div
      {@attach mount}
      class="size-full overflow-auto bg-base-100 select-text"
    ></div>
  {/key}
{/if}
