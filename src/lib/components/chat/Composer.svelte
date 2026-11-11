<script lang="ts">
import Icon from "@iconify/svelte"
import type { Snippet } from "svelte"
import { SvelteMap } from "svelte/reactivity"
import { isImage } from "#lib/chat/attachments.ts"
import { m } from "#lib/paraglide/messages.js"

let {
  busy,
  disabled = false,
  placeholder,
  tools,
  onSend,
  onStop,
}: {
  busy: boolean
  disabled?: boolean
  placeholder: string
  tools?: Snippet
  onSend: (text: string, files: File[]) => void
  onStop: () => void
} = $props()

let text = $state("")

let files = $state<File[]>([])

let dropping = $state(false)

let picker = $state<HTMLInputElement>()

const previews = new SvelteMap<File, string>()

const add = (list: Iterable<File>) => {
  const added = [...list]

  for (const file of added) {
    if (isImage(file)) {
      previews.set(file, URL.createObjectURL(file))
    }
  }

  files = [...files, ...added]
}

const remove = (file: File) => {
  const url = previews.get(file)

  if (url) {
    URL.revokeObjectURL(url)
    previews.delete(file)
  }

  files = files.filter(f => f !== file)
}

const submit = () => {
  const value = text.trim()

  if ((!value && files.length === 0) || busy || disabled) {
    return
  }

  onSend(value, files)

  for (const file of files) {
    remove(file)
  }

  text = ""
}

const keydown = (e: KeyboardEvent) => {
  if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
    e.preventDefault()
    submit()
  }
}

const sizeOf = (bytes: number) =>
  bytes < 1024 * 1024
    ? `${Math.max(1, Math.round(bytes / 1024))}KB`
    : `${(bytes / 1024 / 1024).toFixed(1)}MB`

const hasFiles = (e: DragEvent) => !!e.dataTransfer?.types.includes("Files")
</script>

<form
  class="mx-auto w-full max-w-3xl px-4 pb-4"
  onsubmit={e => {
    e.preventDefault()
    submit()
  }}
>
  <fieldset
    class={[
      "flex min-w-0 flex-col gap-1 overflow-hidden rounded-box border bg-raised p-2",
      "transition-colors",
      dropping
        ? "border-primary bg-primary/5"
        : "border-base-300 focus-within:border-primary",
    ]}
    ondragover={e => {
      if (hasFiles(e)) {
        e.preventDefault()
        e.stopPropagation()
        dropping = true
      }
    }}
    ondragleave={() => {
      dropping = false
    }}
    ondrop={e => {
      if (hasFiles(e)) {
        e.preventDefault()
        e.stopPropagation()
        add(e.dataTransfer?.files ?? [])
      }

      dropping = false
    }}
  >
    {#if files.length}
      <ul class="flex flex-wrap gap-2 px-1 pt-1" aria-label={m.attach_list()}>
        {#each files as file, index (index)}
          {@const preview = previews.get(file)}
          <li
            class={[
              "group/chip relative flex h-16 items-center gap-2 overflow-hidden",
              "rounded-box border border-base-300 bg-base-100",
              preview ? "w-16" : "max-w-64 ps-3 pe-10",
            ]}
            title={file.name}
          >
            {#if preview}
              <img src={preview} alt={file.name} class="size-full object-cover" />
            {:else}
              <Icon icon="lucide:file-text" class="size-5 shrink-0 opacity-70" />
              <div class="flex min-w-0 flex-col">
                <span class="truncate text-sm">{file.name}</span>
                <span class="text-xs text-base-content/60 tabular-nums">
                  {sizeOf(file.size)}
                </span>
              </div>
            {/if}
            <button
              type="button"
              class={[
                "btn btn-circle btn-xs absolute top-1 right-1 border-0",
                "bg-base-100/80 backdrop-blur",
              ]}
              aria-label={m.chat_remove_attachment({ name: file.name })}
              onclick={() => remove(file)}
            >
              <Icon icon="lucide:x" class="size-3" />
            </button>
          </li>
        {/each}
      </ul>
    {/if}
    <textarea
      class={[
        "field-sizing-content max-h-60 min-h-12 w-full resize-none",
        "bg-transparent px-2 py-1 outline-none",
      ]}
      {placeholder}
      aria-label={m.chat_message()}
      rows="1"
      bind:value={text}
      onkeydown={keydown}
      onpaste={e => {
        if (e.clipboardData?.files.length) {
          e.preventDefault()
          add(e.clipboardData.files)
        }
      }}
    ></textarea>
    <div class="flex items-end gap-2">
      <button
        type="button"
        class="btn btn-ghost btn-sm btn-square"
        aria-label={m.chat_attach()}
        title={m.chat_attach()}
        onclick={() => picker?.click()}
      >
        <Icon icon="lucide:paperclip" class="size-4" />
      </button>
      <input
        bind:this={picker}
        type="file"
        multiple
        hidden
        onchange={e => {
          add(e.currentTarget.files ?? [])
          e.currentTarget.value = ""
        }}
      />
      <div class="flex min-w-0 flex-1 flex-wrap items-center gap-1">
        {@render tools?.()}
      </div>
      {#if busy}
        <button
          type="button"
          class="btn btn-primary btn-sm btn-square"
          aria-label={m.chat_stop()}
          onclick={onStop}
        >
          <Icon icon="lucide:square" class="size-3.5" />
        </button>
      {:else}
        <button
          type="submit"
          class="btn btn-primary btn-sm btn-square"
          aria-label={m.chat_send()}
          disabled={(!text.trim() && files.length === 0) || disabled}
        >
          <Icon icon="lucide:arrow-up" class="size-4" />
        </button>
      {/if}
    </div>
  </fieldset>
</form>
