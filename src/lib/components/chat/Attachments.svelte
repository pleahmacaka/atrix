<script lang="ts">
import Icon from "@iconify/svelte"
import type { FileRef } from "#lib/acp/items.ts"
import { m } from "#lib/paraglide/messages.js"

let { files, mine = false }: { files: FileRef[]; mine?: boolean } = $props()

const images = $derived(
  files.filter(f => f.mimeType.startsWith("image/") && f.url),
)

const others = $derived(files.filter(f => !images.includes(f)))

let dialog = $state<HTMLDialogElement>()

let zoomed = $state<FileRef | null>(null)

const zoom = (file: FileRef) => {
  zoomed = file
  dialog?.showModal()
}
</script>

<div class={["flex max-w-xl flex-col gap-2", mine && "items-end self-end"]}>
  {#if images.length > 0}
    <ul
      class={["flex flex-wrap gap-2", mine && "justify-end"]}
      aria-label={m.attach_images()}
    >
      {#each images as file, index (index)}
        <li>
          <button
            type="button"
            class="cursor-zoom-in overflow-hidden rounded-box border border-base-300"
            aria-label={m.attach_zoom({ name: file.name })}
            title={file.name}
            onclick={() => zoom(file)}
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
      class={["flex flex-wrap gap-2", mine && "justify-end"]}
      aria-label={m.attach_files()}
    >
      {#each others as file, index (index)}
        <li>
          {#if file.url}
            <a
              href={file.url}
              download={file.name}
              class="btn btn-sm max-w-64 font-normal"
              title={m.attach_download({ name: file.name })}
            >
              <Icon icon="lucide:file-text" class="size-4 shrink-0" />
              <span class="truncate">{file.name}</span>
            </a>
          {:else}
            <span
              class="btn btn-sm pointer-events-none max-w-64 font-normal"
              title={file.name}
            >
              <Icon icon="lucide:file-text" class="size-4 shrink-0" />
              <span class="truncate">{file.name}</span>
            </span>
          {/if}
        </li>
      {/each}
    </ul>
  {/if}
</div>

<dialog
  bind:this={dialog}
  class="modal"
  onclose={() => {
    zoomed = null
  }}
>
  <div class="modal-box flex max-h-screen max-w-5xl flex-col gap-4 p-4">
    <div class="flex items-center justify-between gap-2">
      <p class="truncate text-sm font-semibold">{zoomed?.name}</p>
      <form method="dialog">
        <button
          type="submit"
          class="btn btn-ghost btn-sm btn-square"
          aria-label={m.common_close()}
        >
          <Icon icon="lucide:x" class="size-4" />
        </button>
      </form>
    </div>
    {#if zoomed?.url}
      <img
        src={zoomed.url}
        alt={zoomed.name}
        class="min-h-0 w-full rounded-box object-contain"
      />
    {/if}
  </div>
  <form method="dialog" class="modal-backdrop">
    <button type="submit">{m.common_close()}</button>
  </form>
</dialog>
