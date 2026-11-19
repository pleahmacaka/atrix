<script lang="ts">
  import { loadDevice, onDevice } from "@atrix/settings"
  import Icon from "@iconify/svelte"
  import { getCurrentWindow } from "@tauri-apps/api/window"
  import IconButton from "#lib/components/ui/IconButton.svelte"
  import Select from "#lib/components/ui/Select.svelte"
  import { ZONES } from "#lib/desktop/dock/zones.ts"
  import DockOptions from "#lib/desktop/edit/DockOptions.svelte"
  import { Editor, stopEdit } from "#lib/desktop/edit/index.js"
  import Palette from "#lib/desktop/edit/Palette.svelte"
  import ZoneBox from "#lib/desktop/edit/ZoneBox.svelte"
  import * as native from "#lib/desktop/native/index.js"
  import { listMonitors, type MonitorInfo } from "#lib/desktop/native/windows.js"
  import { m } from "#lib/paraglide/messages.js"
  import { contextMenu } from "#lib/store/contextMenu.svelte.ts"

  const GAP = 2
  const AUTO = ""

  document.documentElement.dataset.surface = "edit"

  const editor = new Editor()

  let monitors = $state<MonitorInfo[]>([])
  let origin = $state({ x: 0, y: 0 })

  const device = $derived(editor.device)

  const rootRem = () =>
    Number.parseFloat(getComputedStyle(document.documentElement).fontSize) || 16

  const home = $derived.by(() => {
    const target =
      monitors.find(entry => entry.id === device.dockMonitor) ??
      monitors.find(entry => entry.primary) ??
      monitors[0]

    if (!target) {
      return null
    }

    const scale = (window.devicePixelRatio || 1) * rootRem()

    return {
      left: (target.x - origin.x) / scale,
      top: (target.y - origin.y) / scale,
      width: target.width / scale,
      height: target.height / scale,
    }
  })

  const displays = $derived([
    { value: AUTO, label: m.dock_edit_display_auto() },
    ...monitors.map((entry, index) => ({
      value: entry.id,
      label: m.dock_edit_display({ index: index + 1, width: entry.width, height: entry.height }),
      detail: entry.primary ? m.dock_edit_display_primary() : undefined,
    })),
  ])

  $effect(() => {
    native.editRaise().catch(() => undefined)

    loadDevice()
      .then(editor.accept)
      .catch(() => undefined)

    listMonitors()
      .then(list => {
        monitors = list
      })
      .catch(() => undefined)

    getCurrentWindow()
      .outerPosition()
      .then(p => {
        origin = { x: p.x, y: p.y }
      })
      .catch(() => undefined)

    const stop = onDevice(editor.accept)

    return () => {
      stop.then(off => off())
    }
  })

  const typing = (target: EventTarget | null) =>
    target instanceof HTMLElement && target.closest("input, textarea, [contenteditable]") !== null

  const keydown = (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      if (!contextMenu.current && !document.querySelector(":popover-open")) {
        e.preventDefault()
        stopEdit()
      }

      return
    }

    if (!(e.ctrlKey || e.metaKey) || typing(e.target)) {
      return
    }

    const key = e.key.toLowerCase()

    if (key === "z" && !e.shiftKey) {
      e.preventDefault()
      editor.undo()
    } else if ((key === "z" && e.shiftKey) || key === "y") {
      e.preventDefault()
      editor.redo()
    }
  }
</script>

<svelte:window onkeydown={keydown} />

<div class="relative size-full select-none">
  <button
    type="button"
    class="absolute inset-0 cursor-default bg-base-100/50"
    aria-label={m.dock_edit_done()}
    onclick={stopEdit}
  ></button>

  {#if home}
    <div
      role="dialog"
      aria-label={m.dock_edit_title()}
      class={[
        "absolute flex w-5xl -translate-x-1/2 -translate-y-1/2",
        "flex-col gap-3 overflow-y-auto",
        "rounded-box border border-base-300 bg-base-200 p-3 shadow-lg",
      ]}
      style:left="{home.left + home.width / 2}rem"
      style:top="{home.top + home.height / 2}rem"
      style:max-width="{home.width - GAP * 2}rem"
      style:max-height="{home.height - GAP * 2}rem"
    >
      <header class="flex flex-wrap items-center gap-2 px-1">
        <Icon icon="lucide:layout-template" class="size-5 shrink-0 text-primary" />

        <h2 class="min-w-0 flex-1 truncate font-medium">{m.dock_edit_title()}</h2>

        {#if monitors.length > 1}
          <Select
            class="w-60"
            label={m.dock_edit_display_label()}
            options={displays}
            value={device.dockMonitor ?? AUTO}
            onchange={value => editor.setMonitor(value || null)}
          />

          {#if device.dockMonitor}
            <label class="flex cursor-pointer items-center gap-2 text-sm">
              <input
                type="checkbox"
                class="toggle toggle-primary toggle-sm"
                checked={editor.separate}
                onchange={e => editor.setSeparate(e.currentTarget.checked)}
              />
              {m.dock_edit_separate()}
            </label>
          {/if}
        {/if}

        <div class="flex items-center gap-1">
          <IconButton
            icon="lucide:undo-2"
            label={m.dock_edit_undo()}
            title={m.dock_edit_undo_hint()}
            disabled={editor.past.length === 0}
            onclick={editor.undo}
          />

          <IconButton
            icon="lucide:redo-2"
            label={m.dock_edit_redo()}
            title={m.dock_edit_redo_hint()}
            disabled={editor.future.length === 0}
            onclick={editor.redo}
          />

          <IconButton icon="lucide:rotate-ccw" label={m.dock_edit_reset()} onclick={editor.reset} />
        </div>

        <button type="button" class="btn btn-primary btn-sm" onclick={stopEdit}>
          {m.dock_edit_done()}
        </button>
      </header>

      <section class="flex flex-col gap-2 rounded-box border border-base-300 bg-base-100 p-3">
        <header class="flex min-h-8 items-center gap-2">
          <Icon icon="lucide:panel-top" class="size-4 shrink-0 text-base-content/60" />

          <h3 class="min-w-0 flex-1 truncate text-sm font-medium">{m.dock_top_bar()}</h3>

          <input
            type="checkbox"
            class="toggle toggle-primary toggle-sm"
            aria-label={m.dock_top_bar()}
            checked={device.topBar}
            onchange={e => editor.setTopBar(e.currentTarget.checked)}
          />
        </header>

        {#if device.topBar}
          <div class="grid grid-cols-3 gap-2">
            {#each ZONES as id (id)}
              <ZoneBox {editor} bar="top" {id} />
            {/each}
          </div>
        {/if}
      </section>

      <section class="flex flex-col gap-2 rounded-box border border-base-300 bg-base-100 p-3">
        <header class="flex min-h-8 items-center gap-2">
          <Icon icon="lucide:panel-bottom" class="size-4 shrink-0 text-base-content/60" />

          <h3 class="min-w-0 flex-1 truncate text-sm font-medium">{m.dock_dock()}</h3>

          <DockOptions {editor} />
        </header>

        <div class="grid grid-cols-3 gap-2">
          {#each ZONES as id (id)}
            <ZoneBox {editor} bar="dock" {id} />
          {/each}
        </div>
      </section>

      <section class="flex flex-col gap-2 rounded-box border border-base-300 bg-base-100 p-3">
        <header class="flex min-h-8 items-center gap-2">
          <Icon icon="lucide:shapes" class="size-4 shrink-0 text-base-content/60" />

          <h3 class="min-w-0 flex-1 truncate text-sm font-medium">{m.dock_edit_palette()}</h3>
        </header>

        <Palette {editor} />
      </section>
    </div>
  {/if}
</div>
