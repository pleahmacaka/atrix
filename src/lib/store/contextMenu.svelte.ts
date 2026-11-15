import { m } from "#lib/paraglide/messages.js"

export type MenuAction = {
  label: string
  icon?: string
  hint?: string
  danger?: boolean
  confirm?: string
  disabled?: boolean
  run: () => unknown
}

export type MenuItem = MenuAction | "separator"

type Open = { x: number; y: number; items: MenuItem[] }

const focusableOf = (target: EventTarget | null) =>
  target instanceof Element
    ? target.closest<HTMLElement>(
        "button, a, input, textarea, select, [tabindex]",
      )
    : null

class ContextMenu {
  current = $state<Open | null>(null)

  private invoker: HTMLElement | null = null

  show = (e: MouseEvent, items: MenuItem[]) => {
    e.preventDefault()
    e.stopPropagation()

    const active = document.activeElement

    if (!this.current) {
      this.invoker =
        active instanceof HTMLElement && active !== document.body
          ? active
          : focusableOf(e.target)
    }

    this.current = { x: e.clientX, y: e.clientY, items }
  }

  close = () => {
    if (!this.current) {
      return
    }

    this.current = null

    const invoker = this.invoker
    const active = document.activeElement

    this.invoker = null

    if (!active || active === document.body || active.closest("[role=menu]")) {
      invoker?.focus({ preventScroll: true })
    }
  }
}

export const contextMenu = new ContextMenu()

type Editable = HTMLInputElement | HTMLTextAreaElement

const editableOf = (target: EventTarget | null): Editable | null => {
  if (target instanceof HTMLTextAreaElement) {
    return target
  }

  if (
    target instanceof HTMLInputElement &&
    !["checkbox", "radio", "range", "file"].includes(target.type)
  ) {
    return target
  }

  return null
}

const replace = (field: Editable, text: string) => {
  const start = field.selectionStart ?? field.value.length
  const end = field.selectionEnd ?? start

  field.setRangeText(text, start, end, "end")
  field.dispatchEvent(new Event("input", { bubbles: true }))
}

const selected = (field: Editable) =>
  field.value.slice(field.selectionStart ?? 0, field.selectionEnd ?? 0)

const editMenu = (field: Editable): MenuItem[] => {
  const hasSelection = selected(field) !== ""

  return [
    {
      label: m.menu_cut(),
      icon: "lucide:scissors",
      disabled: !hasSelection || field.readOnly,
      run: async () => {
        await navigator.clipboard.writeText(selected(field))
        replace(field, "")
      },
    },
    {
      label: m.menu_copy(),
      icon: "lucide:copy",
      disabled: !hasSelection,
      run: () => navigator.clipboard.writeText(selected(field)),
    },
    {
      label: m.menu_paste(),
      icon: "lucide:clipboard-paste",
      disabled: field.readOnly,
      run: async () => {
        field.focus()
        replace(field, await navigator.clipboard.readText())
      },
    },
    "separator",
    {
      label: m.menu_select_all(),
      icon: "lucide:text-select",
      run: () => field.select(),
    },
  ]
}

export const handleContextMenu = (e: MouseEvent) => {
  if (e.defaultPrevented || (import.meta.env.DEV && e.shiftKey)) {
    return
  }

  const field = editableOf(e.target)

  if (field) {
    contextMenu.show(e, editMenu(field))

    return
  }

  const text = getSelection()?.toString() ?? ""

  if (text) {
    contextMenu.show(e, [
      {
        label: m.menu_copy(),
        icon: "lucide:copy",
        run: () => navigator.clipboard.writeText(text),
      },
    ])

    return
  }

  e.preventDefault()
}
