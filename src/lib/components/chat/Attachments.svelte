<script lang="ts">
import Icon from "@iconify/svelte"
import type { FileRef } from "#lib/acp/items.ts"
import ImageViewer, { type Viewed } from "#lib/components/ui/ImageViewer.svelte"
import { m } from "#lib/paraglide/messages.js"

let { files, mine = false }: { files: FileRef[]; mine?: boolean } = $props()

const images = $derived(
  files.filter(f => f.mimeType.startsWith("image/") && f.url),
)

const others = $derived(files.filter(f => !images.includes(f)))

let zoomed = $state<Viewed | null>(null)

const chip = "island flex h-16 max-w-64 min-w-0 items-center gap-2 px-3 text-sm"
</script>

{#snippet label(file: FileRef)}
  <Icon
    icon={file.mimeType.startsWith("image/") ? "lucide:image" : "lucide:file-text"}
    class="size-5 shrink-0 opacity-70"
  />
  <span class="min-w-0 truncate">{file.name}</span>
{/snippet}

<div class={["flex max-w-xl min-w-0 flex-col gap-2", mine && "items-end self-end"]}>
  {#if images.length > 0}
    <ul
      class={["flex flex-wrap gap-2", mine && "justify-end"]}
      aria-label={m.attach_images()}
    >
      {#each images as file, index (index)}
        <li>
          <button
            type="button"
            class="island block cursor-zoom-in overflow-hidden"
            aria-label={m.attach_zoom({ name: file.name })}
            title={file.name}
            onclick={() => {
              zoomed = { url: file.url ?? "", name: file.name }
            }}
          >
            <img
              src={file.url}
              alt={file.name}
              class="size-32 object-cover"
              loading="lazy"
            />
          </button>
        </li>
      {/each}
    </ul>
  {/if}
  {#if others.length > 0}
    <ul
      class={["flex max-w-full flex-wrap gap-2", mine && "justify-end"]}
      aria-label={m.attach_files()}
    >
      {#each others as file, index (index)}
        <li class="min-w-0">
          {#if file.url}
            <a
              href={file.url}
              download={file.name}
              class={[chip, "cursor-pointer hover:bg-inset"]}
              title={m.attach_download({ name: file.name })}
            >
              {@render label(file)}
            </a>
          {:else}
            <span class={chip} title={file.name}>
              {@render label(file)}
            </span>
          {/if}
        </li>
      {/each}
    </ul>
  {/if}
</div>

<ImageViewer bind:image={zoomed} />
