<script lang="ts">
  import type { BlockLabels, EditorView } from "@atrix/live-editor"
  import { t } from "svelte-i18n"

  const {
    text,
    onchange,
    onblur,
  }: {
    text: string
    onchange: (text: string) => void
    onblur: () => void
  } = $props()

  const blockLabels = (): BlockLabels => ({
    text: $t("panel.event.blocks.text"),
    h1: $t("panel.event.blocks.h1"),
    h2: $t("panel.event.blocks.h2"),
    h3: $t("panel.event.blocks.h3"),
    todo: $t("panel.event.blocks.todo"),
    bullet: $t("panel.event.blocks.bullet"),
    number: $t("panel.event.blocks.number"),
    quote: $t("panel.event.blocks.quote"),
    code: $t("panel.event.blocks.code"),
    divider: $t("panel.event.blocks.divider"),
    date: $t("panel.event.blocks.date"),
  })

  const mount = (host: HTMLElement) => {
    let view: EditorView | undefined
    let gone = false
    let unsaved = false
    let closingMenu = false

    const noteMenu = (e: KeyboardEvent) => {
      closingMenu = e.key === "Escape" && !!host.querySelector(".cm-tooltip-autocomplete")
    }

    const keepMenuEscape = (e: KeyboardEvent) => {
      if (closingMenu) {
        e.stopPropagation()
      }
    }

    host.addEventListener("keydown", noteMenu, { capture: true })
    host.addEventListener("keydown", keepMenuEscape)

    import("@atrix/live-editor").then(({ createLiveEditor, placeCaretAtEnd }) => {
      if (gone) {
        return
      }

      view = createLiveEditor({
        parent: host,
        doc: text,
        placeholder: $t("panel.event.writeNotes"),
        blocks: blockLabels(),
        onChange: next => {
          unsaved = true
          onchange(next)
        },
        onBlur: () => {
          unsaved = false
          onblur()
        },
      })
      placeCaretAtEnd(view)
    })

    // closing the panel removes the editor without a blur, so pending text is saved here
    return () => {
      gone = true
      host.removeEventListener("keydown", noteMenu, { capture: true })
      host.removeEventListener("keydown", keepMenuEscape)
      view?.destroy()

      if (unsaved) {
        onblur()
      }
    }
  }
</script>

<div
  {@attach mount}
  class="memo -mx-2 min-h-7 rounded-field bg-base-content/6 px-2 py-1 text-sm"
></div>
