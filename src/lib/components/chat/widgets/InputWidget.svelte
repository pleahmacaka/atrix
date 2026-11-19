<script lang="ts">
import Icon from "@iconify/svelte"
import { useComposer } from "#lib/chat/composer.svelte.ts"
import {
  conversations,
  documents,
  people,
  type Suggestion,
  tokenAt,
} from "#lib/chat/mentions.ts"
import ImageViewer, { type Viewed } from "#lib/components/ui/ImageViewer.svelte"
import Listbox, { type ListGroup } from "#lib/components/ui/Listbox.svelte"
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

type Option = Suggestion | { command: Command }

let list = $state<ReturnType<typeof Listbox<Option>>>()

let active = $state(0)

let caret = $state(0)

let dismissed = $state<string | null>(null)

const token = $derived(tokenAt(composer.text, caret))

const commandsFor = (query: string) =>
  (composer.props.commands ?? [])
    .filter(c => c.name.toLowerCase().includes(query))
    .toSorted(
      (a, b) =>
        Number(!a.name.toLowerCase().startsWith(query)) -
        Number(!b.name.toLowerCase().startsWith(query)),
    )
    .map(command => ({ command }))

const groups = $derived.by((): ListGroup<Option>[] => {
  if (!token) {
    return []
  }

  const { trigger, query } = token

  if (trigger === "/") {
    return [{ name: "", items: commandsFor(query) }]
  }

  if (trigger === "@") {
    return [{ name: "", items: (composer.props.people ?? people)(query) }]
  }

  return [
    { name: m.mention_conversations(), items: conversations(query, composer.props.draft) },
    { name: m.mention_knowledge(), items: documents(query) },
  ].filter(g => g.items.length > 0)
})

const matches = $derived(groups.flatMap(g => g.items))

const suggesting = $derived(matches.length > 0 && dismissed !== composer.text)

$effect(() => {
  if (suggesting) {
    list?.move(0, 1)
  }
})

const track = () => {
  if (field) {
    caret = field.selectionStart
  }
}

const pick = (o: Option) => {
  if (!token) {
    return
  }

  const insert = "command" in o ? `/${o.command.name}` : o.token
  const text = composer.text
  const rest = text.slice(token.end)
  const spaced = `${insert}${/^\s/.test(rest) ? "" : " "}`

  if (!("command" in o)) {
    composer.mention(o)
  }

  composer.text = text.slice(0, token.start) + spaced + rest
  caret = token.start + spaced.length

  requestAnimationFrame(() => field?.setSelectionRange(caret, caret))
}

const keydown = (e: KeyboardEvent) => {
  if (e.isComposing) {
    return
  }

  if (suggesting) {
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

  const working = composer.props.busy || composer.props.running

  if (e.key === "Escape" && working && !e.repeat && !composer.stopped) {
    e.preventDefault()
    composer.stop()

    return
  }

  if (e.key === "ArrowUp" && composer.recall()) {
    e.preventDefault()

    return
  }

  if (e.key === "Enter" && !e.shiftKey) {
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
    <ul class="flex flex-wrap gap-2 px-1 pt-1" aria-label={m.attach_list()}>
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
              "btn btn-circle btn-xs absolute top-0.5 right-0.5 size-5 border-0",
              "bg-base-100/80 backdrop-blur",
            ]}
            aria-label={m.chat_remove_attachment({ name: file.name })}
            title={m.chat_remove_attachment({ name: file.name })}
            onclick={() => composer.remove(file)}
          >
            <Icon icon="lucide:x" class="size-3" />
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
      "bg-transparent py-1 pr-1.5 pl-0.5 text-sm leading-5 outline-none",
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
    oninput={track}
    onkeyup={track}
    onclick={track}
    onpaste={e => {
      const data = e.clipboardData

      if (data?.files.length) {
        e.preventDefault()
        composer.add(data.files)
      } else if (data && composer.paste(data.getData("text/plain"))) {
        e.preventDefault()
      }
    }}
  ></textarea>
</fieldset>
{#if composer.dropping}
  <span
    class="pointer-events-none absolute inset-0 rounded-3xl border border-primary bg-primary/5"
  ></span>
{/if}
<Listbox
  bind:this={list}
  bind:active
  id={uid}
  label={token?.trigger === "/" ? m.chat_commands() : m.mention_label()}
  anchor={`--${uid}`}
  {groups}
  open={suggesting}
  up
  title={o => ("command" in o ? o.command.description : o.detail)}
  onpick={pick}
>
  {#snippet option(o)}
    {#if "command" in o}
      <span class="shrink-0 font-medium">/{o.command.name}</span>
      {#if o.command.hint}
        <span class="shrink-0 text-base-content/50">{o.command.hint}</span>
      {/if}
      <span class="min-w-0 flex-1 truncate text-base-content/60">{o.command.description}</span>
    {:else}
      <Icon icon={o.icon} class="size-4 shrink-0 opacity-70" />
      <span class="min-w-0 flex-1 truncate">{o.label}</span>
      <span class="max-w-1/2 min-w-0 truncate text-xs text-base-content/50">{o.detail}</span>
    {/if}
  {/snippet}
</Listbox>
<ImageViewer bind:image={zoomed} />
