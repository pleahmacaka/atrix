<script lang="ts">
  import type { ShellItem } from "@atrix/settings"
  import Icon from "@iconify/svelte"
  import { tick } from "svelte"
  import { BARS, canPlace, locate, removable, ZONES, zoneEnd } from "#lib/desktop/dock/zones.ts"
  import { m } from "#lib/paraglide/messages.js"
  import { contextMenu, type MenuItem } from "#lib/store/contextMenu.svelte.ts"
  import type { Editor } from "./editor.svelte"
  import { ICONS, LABELS, PLACES } from "./labels"

  let {
    editor,
    entry,
    palette = false,
  }: { editor: Editor; entry: ShellItem; palette?: boolean } = $props()

  const label = $derived(LABELS[entry.kind]())

  const dragging = $derived(editor.drag?.entry.id === entry.id && editor.drag.palette === palette)

  const focus = async () => {
    await tick()
    document
      .querySelector<HTMLElement>(`[data-chip="${CSS.escape(entry.id)}"]`)
      ?.focus({ preventScroll: true })
  }

  const places = (): MenuItem[] =>
    BARS.filter(bar => canPlace(entry.kind, bar) && (bar === "dock" || editor.device.topBar)).flatMap(
      bar =>
        ZONES.map(zone => ({
          label: palette ? PLACES[bar][zone].add() : PLACES[bar][zone].move(),
          icon: palette ? "lucide:plus" : "lucide:move",
          run: () => {
            const target = zoneEnd(editor.view, bar, zone)

            if (palette) {
              editor.show(entry.kind, target)
            } else {
              editor.move(entry, target)
              focus()
            }
          },
        })),
    )

  const step = (dir: -1 | 1) => {
    if (editor.step(entry, dir)) {
      focus()
    }
  }

  const items = (): MenuItem[] => {
    if (palette) {
      return [
        ...(entry.kind === "separator"
          ? []
          : ([
              {
                label: m.dock_edit_show_here(),
                icon: "lucide:eye",
                run: () => editor.show(entry.kind),
              },
              "separator",
            ] as const)),
        ...places(),
      ]
    }

    const found = locate(editor.view, entry.id)

    return [
      { label: m.dock_edit_move_left(), icon: "lucide:arrow-left", hint: "Alt+←", run: () => step(-1) },
      { label: m.dock_edit_move_right(), icon: "lucide:arrow-right", hint: "Alt+→", run: () => step(1) },
      ...(found
        ? [
            {
              label: m.dock_edit_split(),
              icon: "lucide:square-split-horizontal",
              run: () => {
                editor.move(entry, { bar: found.bar, zone: found.zone, at: found.group + 1 })
                focus()
              },
            },
          ]
        : []),
      "separator",
      ...places(),
      ...(removable(entry.kind)
        ? ([
            "separator",
            {
              label: entry.kind === "separator" ? m.common_delete() : m.dock_hide(),
              icon: entry.kind === "separator" ? "lucide:trash-2" : "lucide:eye-off",
              danger: entry.kind === "separator",
              run: () => editor.hide(entry),
            },
          ] as const)
        : []),
    ]
  }

  const openMenu = (e: MouseEvent) => contextMenu.show(e, items())

  const openAt = (node: HTMLElement) => {
    const box = node.getBoundingClientRect()

    contextMenu.show(
      new MouseEvent("contextmenu", { clientX: box.left, clientY: box.bottom }),
      items(),
    )
  }

  const keydown = (e: KeyboardEvent) => {
    if (palette) {
      return
    }

    if (e.altKey && (e.key === "ArrowLeft" || e.key === "ArrowRight")) {
      e.preventDefault()
      step(e.key === "ArrowLeft" ? -1 : 1)

      return
    }

    if ((e.key === "Delete" || e.key === "Backspace") && removable(entry.kind)) {
      e.preventDefault()
      editor.hide(entry)
    }
  }
</script>

<button
  type="button"
  class={[
    "btn btn-sm max-w-48 cursor-grab gap-1.5 px-2 font-normal",
    "active:cursor-grabbing",
    dragging && "opacity-40",
    palette && "btn-dash",
  ]}
  draggable="true"
  data-chip={palette ? undefined : entry.id}
  title={label}
  aria-label={label}
  aria-haspopup="menu"
  ondragstart={e => {
    e.dataTransfer?.setData("text/plain", entry.kind)

    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = "move"
    }

    editor.drag = { entry, palette }
  }}
  ondragend={() => {
    editor.drag = null
    editor.hint = null
  }}
  onclick={e => openAt(e.currentTarget)}
  oncontextmenu={openMenu}
  onkeydown={keydown}
>
  <Icon icon={ICONS[entry.kind]} class="size-4 shrink-0" />
  <span class="min-w-0 truncate">{label}</span>
</button>
