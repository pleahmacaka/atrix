<script lang="ts">
import Icon from "@iconify/svelte"
import { native } from "#lib/native.ts"
import { baseName } from "#lib/path.ts"
import Thumbnail from "./Thumbnail.svelte"

let { path, title }: { path: string; title?: string } = $props()

const MIME: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  bmp: "image/bmp",
  pdf: "application/pdf",
  html: "text/html",
  htm: "text/html",
}

const name = $derived(baseName(path))

const mime = $derived(MIME[name.split(".").at(-1)?.toLowerCase() ?? ""])

let url = $state<string | null>(null)

$effect(() => {
  if (!mime) {
    return
  }

  let made: string | null = null

  native<ArrayBuffer>("read_view", { path })
    .then(bytes => {
      made = URL.createObjectURL(new Blob([bytes], { type: mime }))
      url = made
    })
    .catch(() => {})

  return () => {
    if (made) {
      URL.revokeObjectURL(made)
    }
  }
})
</script>

{#if url && mime?.startsWith("image/")}
  <Thumbnail {url} name={title ?? name} />
{:else if url && mime === "text/html"}
  <iframe
    title={title ?? name}
    sandbox="allow-scripts"
    src={url}
    class="h-120 w-full rounded-field border-0 bg-white"
  ></iframe>
{:else if url}
  <iframe title={title ?? name} src={url} class="h-120 w-full rounded-field border-0"></iframe>
{:else}
  <p class="flex min-w-0 items-center gap-2 text-sm text-base-content/70" title={path}>
    <Icon icon="lucide:file" class="size-4 shrink-0" />
    <span class="min-w-0 truncate">{name}</span>
  </p>
{/if}
