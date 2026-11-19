<script module lang="ts">
  export const MAGNIFY_BOOST = 0.55
  export const MAGNIFY_SPREAD = 78
  export const APP_DRAG = "application/x-atrix-app"
</script>

<script lang="ts">
  import Icon from "@iconify/svelte"
  import * as native from "#lib/desktop/native/index.js"
  import { m } from "#lib/paraglide/messages.js"
  import { contextMenu, type MenuItem } from "#lib/store/contextMenu.svelte.ts"
  import {
    type DockGroup,
    iconFor,
    refreshDock,
    toggleDockHidden,
    toggleDockPin,
  } from "./dock.svelte"
  import { closePreview, dismissPreview, openPreview, togglePreview } from "./preview.svelte"
  import { rem } from "./rem.svelte"

  type Props = {
    group: DockGroup
    size: number
    edge: "top" | "bottom"
    mac: boolean
    foreground: number | undefined
    hiddenHere?: boolean
    pointerX?: number | null
    strength?: number
    dragging?: boolean
    dropBefore?: boolean
    dropAfter?: boolean
    ondragstart?: () => void
    ondragend?: () => void
  }

  let {
    group,
    size,
    edge,
    mac,
    foreground,
    hiddenHere = false,
    pointerX = null,
    strength = 0,
    dragging = false,
    dropBefore = false,
    dropAfter = false,
    ondragstart,
    ondragend,
  }: Props = $props()

  const MENU_WINDOWS = 5

  let root = $state<HTMLElement>()
  let icon = $state<string | null>(null)

  $effect(() => {
    iconFor(group.path).then(value => {
      icon = value
    })
  })

  const running = $derived(group.windows.length > 0)

  const active = $derived(
    foreground !== undefined && group.windows.some(w => w.hwnd === foreground),
  )

  const magnify = $derived.by(() => {
    if (!mac || pointerX === null || !root || strength === 0) {
      return 1
    }

    const box = root.getBoundingClientRect()
    const distance = Math.abs(box.left + box.width / 2 - pointerX)

    return 1 + MAGNIFY_BOOST * strength * Math.exp(-((distance / MAGNIFY_SPREAD) ** 2))
  })

  const center = () => {
    const box = root?.getBoundingClientRect()

    return box ? box.left + box.width / 2 : null
  }

  const launch = () => native.launchApp(group.path).catch(() => undefined)

  // the poll is a second behind, so the next click would judge a stale window list
  const activate = async () => {
    const [first] = group.windows

    if (!first) {
      return launch()
    }

    const at = center()

    if (group.windows.length > 1 && at !== null) {
      togglePreview(
        group.windows.map(w => w.hwnd),
        at,
      )

      return
    }

    dismissPreview()

    if (active) {
      const current = group.windows.find(w => w.hwnd === foreground) ?? first

      await native.minimizeWindow(current.hwnd).catch(() => undefined)
    } else {
      await native.activateWindow(first.hwnd).catch(() => undefined)
    }

    await refreshDock()
  }

  const closeAll = async () => {
    for (const w of group.windows) {
      await native.closeWindow(w.hwnd).catch(() => undefined)
    }
  }

  const hover = () => {
    const at = center()

    if (running && at !== null && !contextMenu.current) {
      openPreview(
        group.windows.map(w => w.hwnd),
        at,
      )
    }
  }

  $effect(() => dismissPreview)

  const menuItems = (): MenuItem[] => {
    const windows: MenuItem[] = group.windows.slice(0, MENU_WINDOWS).map(w => ({
      label: w.title,
      icon: w.hwnd === foreground ? "lucide:square-dot" : "lucide:app-window",
      run: () => native.activateWindow(w.hwnd),
    }))

    const pinned = group.pinned === "windows" ? !hiddenHere : Boolean(group.pinned)

    return [
      ...windows,
      ...(running ? (["separator"] as const) : []),
      { label: m.dock_app_new_window(), icon: "lucide:plus", run: launch },
      {
        label: m.dock_app_open_location(),
        icon: "lucide:folder-open",
        run: () => native.openLocation(group.path),
      },
      {
        label: pinned ? m.dock_app_unpin() : m.dock_app_pin(),
        icon: pinned ? "lucide:pin-off" : "lucide:pin",
        run: () =>
          group.pinned === "windows"
            ? toggleDockHidden(group.path)
            : toggleDockPin(group.path),
      },
      ...(running
        ? ([
            "separator",
            {
              label: m.dock_app_end_task(),
              icon: "lucide:circle-slash",
              danger: true,
              run: () => native.endTask(group.windows.map(w => w.hwnd)),
            },
            { label: m.dock_app_close_all(), icon: "lucide:x", run: closeAll },
          ] as const)
        : []),
    ]
  }

  const dragStart = (e: DragEvent) => {
    e.dataTransfer?.setData("text/plain", group.path)
    e.dataTransfer?.setData(APP_DRAG, group.path)

    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = "move"
    }

    dismissPreview()
    ondragstart?.()
  }
</script>

<div bind:this={root} class={["relative transition-opacity", dragging && "opacity-30"]}>
  {#if dropBefore || dropAfter}
    <span
      class={[
        "pointer-events-none absolute inset-y-1 z-10 w-0.5",
        "rounded-full bg-primary",
        dropBefore ? "-left-0.5" : "-right-0.5",
      ]}
    ></span>
  {/if}

  <button
    type="button"
    draggable="true"
    ondragstart={dragStart}
    {ondragend}
    class={[
      "relative origin-bottom p-0 will-change-transform",
      mac
        ? "flex cursor-pointer items-center justify-center"
        : ["btn btn-ghost btn-square transition-transform active:scale-90", active && "bg-primary/8"],
    ]}
    style:width={rem(size + 16)}
    style:height={rem(size + 16)}
    style:transform={magnify === 1 ? undefined : `scale(${magnify})`}
    title={running || mac ? undefined : group.name}
    aria-label={group.name}
    aria-haspopup="menu"
    onclick={activate}
    onauxclick={e => {
      if (e.button === 1) {
        e.preventDefault()
        launch()
      }
    }}
    oncontextmenu={e => {
      dismissPreview()
      contextMenu.show(e, menuItems())
    }}
    onmouseenter={hover}
    onmouseleave={closePreview}
  >
    {#if icon}
      <img src={icon} alt="" draggable="false" style:width={rem(size)} style:height={rem(size)} />
    {:else}
      <span class="text-base-content/70" style:width={rem(size)} style:height={rem(size)}>
        <Icon icon="lucide:app-window" class="size-full" />
      </span>
    {/if}

    {#if running}
      <span
        class={[
          "absolute left-1/2 h-1 -translate-x-1/2 rounded-full transition-all",
          edge === "top" ? "top-0.5" : "bottom-0.5",
          active ? "w-4 bg-primary" : "w-1.5 bg-base-content/50",
        ]}
      ></span>
    {/if}
  </button>
</div>
