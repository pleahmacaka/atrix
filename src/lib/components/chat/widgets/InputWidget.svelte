<script lang="ts">
import Icon from "@iconify/svelte"
import { useComposer } from "#lib/chat/composer.svelte.ts"
import ImageViewer, { type Viewed } from "#lib/components/ui/ImageViewer.svelte"
import Listbox from "#lib/components/ui/Listbox.svelte"
import type { Command } from "#lib/p2p/protocol.ts"
import { m } from "#lib/paraglide/messages.js"
import { getLocale } from "#lib/paraglide/runtime.js"
import { panes, usePane } from "#lib/store/panes.svelte.ts"

const composer = useComposer()

const uid = $props.id()

const pane = usePane()

let field = $state<HTMLTextAreaElement>()

$effect(() => {
  if (field && pane && panes.typing === pane()) {
    field.focus({ preventScroll: true })
    panes.typing = null
  }
})

let list = $state<ReturnType<typeof Listbox<Command>>>()

let active = $state(0)

let dismissed = $state<string | null>(null)

const query = $derived.by(() => {
  const text = composer.text

  return text.startsWith("/") && !/\s/.test(text)
    ? text.slice(1).toLowerCase()
    : null
})

const matches = $derived.by(() => {
  if (query === null) {
    return []
  }

  const found = (composer.props.commands ?? []).filter(c =>
    c.name.toLowerCase().includes(query),
  )

  return found.toSorted(
    (a, b) =>
      Number(!a.name.toLowerCase().startsWith(query)) -
      Number(!b.name.toLowerCase().startsWith(query)),
  )
})

const suggesting = $derived(matches.length > 0 && dismissed !== composer.text)

$effect(() => {
  if (suggesting) {
    list?.move(0, 1)
  }
})

const pick = (c: Command) => {
  composer.text = `/${c.name} `
}

const keydown = (e: KeyboardEvent) => {
  if (suggesting && !e.isComposing) {
    if (e.key === "Escape") {
      e.preventDefault()
      e.stopPropagation()
      dismissed = composer.text

      return
    }

    if (e.key === "Tab" && active >= 0) {
      e.preventDefault()
      pick(matches[active])

      return
    }

    if (list?.navigate(e)) {
      return
    }
  }

  if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
    e.preventDefault()
    composer.submit()
  }
}

const kilobytes = new Intl.NumberFormat(getLocale(), {
  style: "unit",
  unit: "kilobyte",
  maximumFractionDigits: 0,
})

const megabytes = new Intl.NumberFormat(getLocale(), {
  style: "unit",
  unit: "megabyte",
  maximumFractionDigits: 1,
})

const sizeOf = (bytes: number) =>
  bytes < 1024 * 1024
    ? kilobytes.format(Math.max(1, bytes / 1024))
    : megabytes.format(bytes / 1024 / 1024)

const grow = (node: HTMLTextAreaElement) => {
  void composer.text

  const rem = Number.parseFloat(getComputedStyle(document.documentElement).fontSize)
  const from = node.offsetHeight

  node.style.transition = "none"
  node.style.height = "auto"

  const to = node.scrollHeight + node.offsetHeight - node.clientHeight

  node.style.height = `${from / rem}rem`
  void node.offsetHeight
  node.style.transition = ""
  node.style.height = `${to / rem}rem`
}

let zoomed = $state<Viewed | null>(null)

const hasFiles = (e: DragEvent) => !!e.dataTransfer?.types.includes("Files")
</script>

<fieldset
  class="my-auto flex min-w-0 flex-1 flex-col gap-1"
  style:anchor-name={`--${uid}`}
  ondragover={e => {
    if (hasFiles(e)) {
      e.preventDefault()
      e.stopPropagation()
      composer.dropping = true
    }
  }}
  ondragleave={() => {
    composer.dropping = false
  }}
  ondrop={e => {
    if (hasFiles(e)) {
      e.preventDefault()
      e.stopPropagation()
      composer.add(e.dataTransfer?.files ?? [])
    }

    composer.dropping = false
  }}
>
  {#if composer.files.length}
    <ul class="flex flex-wrap gap-2 px-2 pt-2" aria-label={m.attach_list()}>
      {#each composer.files as file, index (index)}
        {@const preview = composer.previews.get(file)}
        <li
          class={[
            "group/chip relative flex h-16 items-center gap-2 overflow-hidden",
            "island",
            preview ? "w-16" : "max-w-64 ps-3 pe-10",
          ]}
          title={file.name}
        >
          {#if preview}
            <button
              type="button"
              class="size-full cursor-zoom-in"
              aria-label={m.attach_zoom({ name: file.name })}
              onclick={() => {
                zoomed = { url: preview, name: file.name }
              }}
            >
              <img src={preview} alt={file.name} class="size-full object-cover" />
            </button>
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
            title={m.chat_remove_attachment({ name: file.name })}
            onclick={() => composer.remove(file)}
          >
            <Icon icon="lucide:x" class="size-3.5" />
          </button>
        </li>
      {/each}
    </ul>
  {/if}
  <textarea
    bind:this={field}
    {@attach grow}
    class={[
      "max-h-40 w-full resize-none transition-[height] duration-140",
      "bg-transparent py-1.5 pr-1.5 pl-0.5 text-sm leading-5 outline-none",
      "placeholder:truncate",
    ]}
    placeholder={composer.props.placeholder}
    aria-label={m.chat_message()}
    rows="1"
    role="combobox"
    aria-autocomplete="list"
    aria-expanded={suggesting}
    aria-controls={`${uid}-list`}
    aria-activedescendant={suggesting && active >= 0 ? `${uid}-${active}` : undefined}
    bind:value={composer.text}
    onkeydown={keydown}
    onpaste={e => {
      if (e.clipboardData?.files.length) {
        e.preventDefault()
        composer.add(e.clipboardData.files)
      }
    }}
  ></textarea>
</fieldset>
{#if composer.dropping}
  <span
    class="pointer-events-none absolute inset-0 rounded-box border border-primary bg-primary/5"
  ></span>
{/if}
<Listbox
  bind:this={list}
  bind:active
  id={uid}
  label={m.chat_commands()}
  anchor={`--${uid}`}
  groups={[{ name: "", items: matches }]}
  open={suggesting}
  up
  title={c => c.description}
  onpick={pick}
>
  {#snippet option(c)}
    <span class="shrink-0 font-medium">/{c.name}</span>
    {#if c.hint}
      <span class="shrink-0 text-base-content/50">{c.hint}</span>
    {/if}
    <span class="min-w-0 flex-1 truncate text-base-content/60">{c.description}</span>
  {/snippet}
</Listbox>
<ImageViewer bind:image={zoomed} />
