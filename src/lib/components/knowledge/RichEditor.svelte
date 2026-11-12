<script lang="ts">
import { Editor } from "@tiptap/core"
import Image from "@tiptap/extension-image"
import { TaskItem, TaskList } from "@tiptap/extension-list"
import { TableKit } from "@tiptap/extension-table"
import { Placeholder } from "@tiptap/extensions"
import { Markdown } from "@tiptap/markdown"
import StarterKit from "@tiptap/starter-kit"
import { onDestroy, onMount, untrack } from "svelte"
import { WikiLink } from "#lib/knowledge/wikilink.ts"
import { m } from "#lib/paraglide/messages.js"
import Toolbar from "./Toolbar.svelte"

let {
  markdown,
  editable,
  title,
  open,
  onchange,
  root = $bindable(null),
  lossy = $bindable(false),
}: {
  markdown: string
  editable: boolean
  title: (id: string) => string | null
  open: (id: string) => void
  onchange: (markdown: string) => void
  root?: HTMLElement | null
  lossy?: boolean
} = $props()

let element = $state<HTMLDivElement>()

let editor = $state<Editor | null>(null)

let tick = $state(0)

const squash = (text: string) => text.replace(/\s+/g, "")

onMount(() => {
  editor = new Editor({
    element,
    extensions: [
      StarterKit.configure({
        link: { openOnClick: false, autolink: true },
      }),
      Markdown,
      Image,
      TableKit.configure({ table: { resizable: false } }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Placeholder.configure({ placeholder: m.knowledge_placeholder() }),
      WikiLink.configure({ title, open }),
    ],
    content: markdown,
    contentType: "markdown",
    editable,
    editorProps: { attributes: { class: "wiki min-h-96 outline-none" } },
    onTransaction: () => {
      untrack(() => tick++)
    },
    onUpdate: ({ editor }) => onchange(editor.getMarkdown()),
  })
  root = element ?? null
  lossy = squash(editor.getMarkdown()) !== squash(markdown)
})

onDestroy(() => editor?.destroy())

$effect(() => {
  editor?.setEditable(editable, false)
})

$effect(() => {
  const next = markdown

  if (editor && !editor.isFocused && next !== editor.getMarkdown()) {
    editor.commands.setContent(next, {
      contentType: "markdown",
      emitUpdate: false,
    })
  }
})
</script>

<div class="relative">
  {#if editor && editable}
    <div
      class={[
        "sticky top-0 z-20 -mx-2 mb-6 flex flex-wrap items-center gap-1",
        "rounded-box border border-base-300 bg-base-100/95 p-1.5 backdrop-blur",
      ]}
    >
      <Toolbar {editor} {tick} />
    </div>
  {/if}
  <div bind:this={element}></div>
</div>
