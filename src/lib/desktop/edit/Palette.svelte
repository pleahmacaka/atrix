<script lang="ts">
  import { removable } from "#lib/desktop/dock/zones.ts"
  import { m } from "#lib/paraglide/messages.js"
  import type { Editor } from "./editor.svelte"
  import ItemChip from "./ItemChip.svelte"

  let { editor }: { editor: Editor } = $props()

  let body = $state<HTMLElement>()

  const accepts = $derived(
    editor.drag !== null && !editor.drag.palette && removable(editor.drag.entry.kind),
  )

  const hinted = $derived(editor.hint === "palette")
</script>

<ul
  bind:this={body}
  class={[
    "flex min-h-12 flex-wrap items-center gap-1 rounded-field p-1",
    "transition-colors",
    hinted && "bg-primary/8 ring-1 ring-primary",
  ]}
  aria-label={m.dock_edit_palette()}
  ondragover={e => {
    if (!accepts) {
      return
    }

    e.preventDefault()
    editor.hint = "palette"
  }}
  ondragleave={e => {
    if (!(e.relatedTarget instanceof Node && body?.contains(e.relatedTarget)) && hinted) {
      editor.hint = null
    }
  }}
  ondrop={e => {
    e.preventDefault()
    editor.dropOn()
  }}
>
  {#each editor.palette as kind (kind)}
    <li class="flex">
      <ItemChip {editor} entry={{ id: kind, kind }} palette />
    </li>
  {/each}

  <li class="flex">
    <ItemChip {editor} entry={{ id: "separator", kind: "separator" }} palette />
  </li>

  {#if editor.palette.length === 0}
    <li class="px-2 text-xs text-base-content/50">{m.dock_edit_palette_empty()}</li>
  {/if}
</ul>
