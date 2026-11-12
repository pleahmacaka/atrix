<script lang="ts">
import Icon from "@iconify/svelte"
import type { Editor } from "@tiptap/core"
import { m } from "#lib/paraglide/messages.js"

let { editor, tick }: { editor: Editor; tick: number } = $props()

type Item = { name: string; icon: string; label: () => string; run: () => void }

let linkOpen = $state(false)

let linkUrl = $state("")

const is = $derived.by(() => {
  void tick

  return (name: string) => editor.isActive(name)
})

const block = $derived.by(() => {
  void tick

  const level = [2, 3, 4].find(l => editor.isActive("heading", { level: l }))

  return level ? String(level) : "p"
})

const history = $derived.by(() => {
  void tick

  return { undo: editor.can().undo(), redo: editor.can().redo() }
})

const chain = () => editor.chain().focus()

const BLOCKS = [
  { value: "p", label: m.editor_paragraph },
  { value: "2", label: m.editor_heading2 },
  { value: "3", label: m.editor_heading3 },
  { value: "4", label: m.editor_heading4 },
]

const MARKS: Item[] = [
  {
    name: "bold",
    icon: "lucide:bold",
    label: m.editor_bold,
    run: () => chain().toggleBold().run(),
  },
  {
    name: "italic",
    icon: "lucide:italic",
    label: m.editor_italic,
    run: () => chain().toggleItalic().run(),
  },
  {
    name: "strike",
    icon: "lucide:strikethrough",
    label: m.editor_strike,
    run: () => chain().toggleStrike().run(),
  },
  {
    name: "code",
    icon: "lucide:code",
    label: m.editor_code,
    run: () => chain().toggleCode().run(),
  },
]

const BLOCK_ITEMS: Item[] = [
  {
    name: "bulletList",
    icon: "lucide:list",
    label: m.editor_bullets,
    run: () => chain().toggleBulletList().run(),
  },
  {
    name: "orderedList",
    icon: "lucide:list-ordered",
    label: m.editor_numbers,
    run: () => chain().toggleOrderedList().run(),
  },
  {
    name: "blockquote",
    icon: "lucide:text-quote",
    label: m.editor_quote,
    run: () => chain().toggleBlockquote().run(),
  },
  {
    name: "codeBlock",
    icon: "lucide:square-code",
    label: m.editor_code_block,
    run: () => chain().toggleCodeBlock().run(),
  },
]

const setBlock = (value: string) => {
  if (value === "p") {
    chain().setParagraph().run()
  } else {
    chain()
      .setHeading({ level: Number(value) as 2 | 3 | 4 })
      .run()
  }
}

const applyLink = () => {
  const url = linkUrl.trim()
  const link = chain().extendMarkRange("link")

  if (url) {
    link.setLink({ href: url }).run()
  } else {
    link.unsetLink().run()
  }

  linkOpen = false
}
</script>

{#snippet item(entry: Item)}
  <button
    type="button"
    class={["btn btn-ghost btn-sm btn-square", is(entry.name) && "btn-active"]}
    aria-label={entry.label()}
    title={entry.label()}
    aria-pressed={is(entry.name)}
    onclick={entry.run}
  >
    <Icon icon={entry.icon} class="size-4" />
  </button>
{/snippet}

<select
  class="select select-sm select-ghost w-28"
  aria-label={m.editor_block()}
  value={block}
  onchange={e => setBlock(e.currentTarget.value)}
>
  {#each BLOCKS as option (option.value)}
    <option value={option.value}>{option.label()}</option>
  {/each}
</select>
<span class="mx-0.5 h-5 w-px bg-base-300"></span>
{#each MARKS as mark (mark.name)}
  {@render item(mark)}
{/each}
<div class={["dropdown", linkOpen && "dropdown-open"]}>
  <button
    type="button"
    class={["btn btn-ghost btn-sm btn-square", is("link") && "btn-active"]}
    aria-label={m.editor_link()}
    title={m.editor_link()}
    onclick={() => {
      linkUrl = editor.getAttributes("link").href ?? ""
      linkOpen = !linkOpen
    }}
  >
    <Icon icon="lucide:link" class="size-4" />
  </button>
  {#if linkOpen}
    <form
      class={[
        "dropdown-content z-30 mt-2 flex w-80 gap-2 rounded-box border",
        "border-base-300 bg-base-100 p-2 shadow-lg",
      ]}
      onsubmit={e => {
        e.preventDefault()
        applyLink()
      }}
    >
      <input
        class="input input-sm min-w-0 flex-1"
        aria-label={m.editor_link()}
        placeholder="https://"
        bind:value={linkUrl}
      />
      <button type="submit" class="btn btn-sm btn-primary">{m.editor_apply()}</button>
    </form>
  {/if}
</div>
<span class="mx-0.5 h-5 w-px bg-base-300"></span>
{#each BLOCK_ITEMS as entry (entry.name)}
  {@render item(entry)}
{/each}
<span class="mx-0.5 h-5 w-px bg-base-300"></span>
<button
  type="button"
  class="btn btn-ghost btn-sm btn-square"
  aria-label={m.editor_undo()}
  title={m.editor_undo()}
  disabled={!history.undo}
  onclick={() => chain().undo().run()}
>
  <Icon icon="lucide:undo-2" class="size-4" />
</button>
<button
  type="button"
  class="btn btn-ghost btn-sm btn-square"
  aria-label={m.editor_redo()}
  title={m.editor_redo()}
  disabled={!history.redo}
  onclick={() => chain().redo().run()}
>
  <Icon icon="lucide:redo-2" class="size-4" />
</button>
