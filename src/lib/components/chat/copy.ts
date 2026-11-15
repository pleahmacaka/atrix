import { m } from "#lib/paraglide/messages.js"
import { contextMenu } from "#lib/store/contextMenu.svelte.ts"

export const copyMenu = (e: MouseEvent, text: string) => {
  if (!text || getSelection()?.toString()) {
    return
  }

  contextMenu.show(e, [
    {
      label: m.menu_copy_message(),
      icon: "lucide:copy",
      run: () => navigator.clipboard.writeText(text),
    },
  ])
}
