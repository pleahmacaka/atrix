<script lang="ts">
import type { Editor } from "@tiptap/core"
import IconButton from "#lib/components/ui/IconButton.svelte"
import Popover from "#lib/components/ui/Popover.svelte"
import Select from "#lib/components/ui/Select.svelte"
import Separator from "#lib/components/ui/Separator.svelte"
import { m } from "#lib/paraglide/messages.js"

let { editor, tick }: { editor: Editor; tick: number } = $props()

type Item = { name: string; icon: string; label: () => string; run: () => void }

const BLOCKS = [
  { value: "p", label: m.editor_paragraph() },
  { value: "2", label: m.editor_heading2() },
  { value: "3", label: m.editor_heading3() },
  { value: "4", label: m.editor_heading4() },
]

const MARKS: Item[] = [
  { name: "bold", icon: "lucide:bold", label: m.editor_bold, run: () => chain().toggleBold().run() },
  { name: "italic", icon: "lucide:italic", label: m.editor_italic, run: () => chain().toggleItalic().run() },
  { name: "strike", icon: "lucide:strikethrough", label: m.editor_strike, run: () => chain().toggleStrike().run() },
  { name: "code", icon: "lucide:code", label: m.editor_code, run: () => chain().toggleCode().run() },
]

const BLOCK_ITEMS: Item[] = [
  { name: "bulletList", icon: "lucide:list", label: m.editor_bullets, run: () => chain().toggleBulletList().run() },
  { name: "orderedList", icon: "lucide:list-ordered", label: m.editor_numbers, run: () => chain().toggleOrderedList().run() },
  { name: "blockquote", icon: "lucide:text-quote", label: m.editor_quote, run: () => chain().toggleBlockquote().run() },
  { name: "codeBlock", icon: "lucide:square-code", label: m.editor_code_block, run: () => chain().toggleCodeBlock().run() },
]

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

const setBlock = (value: string) => {
  if (value === "p") {
    chain().setParagraph().run()
  } else {
    chain().setHeading({ level: Number(value) as 2 | 3 | 4 }).run()
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
  <IconButton
    icon={entry.icon}
    label={entry.label()}
    class={[is(entry.name) && "btn-active"]}
    aria-pressed={is(entry.name)}
    onclick={entry.run}
  />
{/snippet}

<Select
  options={BLOCKS}
  value={block}
  label={m.editor_block()}
  class="select-sm select-ghost w-28"
  onchange={setBlock}
/>
<Separator vertical />
{#each MARKS as mark (mark.name)}
  {@render item(mark)}
{/each}
<Popover label={m.editor_link()} width="w-80" sheet bind:open={linkOpen}>
  {#snippet trigger(p)}
    <IconButton
      {...p}
      icon="lucide:link"
      label={m.editor_link()}
      class={[is("link") && "btn-active"]}
      onclick={() => {
        linkUrl = editor.getAttributes("link").href ?? ""
      }}
    />
  {/snippet}
  <form
    class="flex gap-1"
    onsubmit={e => {
      e.preventDefault()
      applyLink()
    }}
  >
    <input
      class="input input-sm min-w-0 flex-1"
      aria-label={m.editor_link()}
      placeholder={m.editor_link_hint()}
      data-autofocus
      bind:value={linkUrl}
    />
    <IconButton type="submit" icon="lucide:check" label={m.editor_apply()} tone="primary" />
  </form>
</Popover>
<Separator vertical />
{#each BLOCK_ITEMS as entry (entry.name)}
  {@render item(entry)}
{/each}
<Separator vertical />
<IconButton
  icon="lucide:undo-2"
  label={m.editor_undo()}
  disabled={!history.undo}
  onclick={() => chain().undo().run()}
/>
<IconButton
  icon="lucide:redo-2"
  label={m.editor_redo()}
  disabled={!history.redo}
  onclick={() => chain().redo().run()}
/>