<script lang="ts">
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow"
import { getCurrentWindow } from "@tauri-apps/api/window"
import { calendar, WEEKS } from "#lib/calendar/calendar.svelte.ts"
import { addDays, startOfDay } from "#lib/calendar/dates.ts"
import { CalendarEditor } from "#lib/calendar/editor.svelte.ts"
import { format } from "#lib/calendar/format.ts"
import DayAgenda from "#lib/components/calendar/DayAgenda.svelte"
import MonthGrid from "#lib/components/calendar/MonthGrid.svelte"
import TaskList from "#lib/components/calendar/TaskList.svelte"
import IconButton from "#lib/components/ui/IconButton.svelte"
import { askAtrix } from "#lib/desktop/launcher/atrix.ts"
import { hideWindow, onWindowShown } from "#lib/desktop/native/windows.ts"
import QuickMemo from "#lib/desktop/panel/QuickMemo.svelte"
import { overlayOpen, windowRegion } from "#lib/desktop/panel/region.ts"
import {
  type DeviceSettings,
  defaultDevice,
  loadDevice,
  onDevice,
} from "#lib/desktop/settings/index.ts"
import { logFailure } from "#lib/logging.ts"
import { askNav, type HostEntry, RemoteHosts } from "#lib/p2p/float.svelte.ts"
import { hostList } from "#lib/p2p/hosts.svelte.ts"
import { m } from "#lib/paraglide/messages.js"

const PICKERS = ["date", "datetime-local", "time", "color", "file"]

const BLUR_GRACE_MS = 400

const POSITIONS: Record<DeviceSettings["panelPosition"], string> = {
  left: "left-0",
  center: "left-1/2 -translate-x-1/2",
  right: "right-0",
}

const win = getCurrentWindow()

const remotes = new RemoteHosts()

let device = $state<DeviceSettings>(defaultDevice)

let landed = false

let shownAt = 0

const hide = () => {
  landed = false
  hideWindow("panel").catch(e => logFailure("panel hide", e))
}

const openDoc = (id: string) => {
  askAtrix({ kind: "doc", id }).catch(e => logFailure("panel open doc", e))
  hide()
}

const editor = new CalendarEditor(() => hostList().map(h => h.view), openDoc)

const title = $derived(
  format(addDays(calendar.start, 7), { year: "numeric", month: "long" }),
)

const anchorTop = $derived(
  device.dockEdge === "top" || (device.topBar && device.features.dock),
)

const shift = (pages: number) => {
  calendar.start = addDays(calendar.start, pages * WEEKS * 7)
}

const today = () => editor.choose(startOfDay(new Date()))

const isPicker = (el: Element | null) =>
  el instanceof HTMLSelectElement ||
  (el instanceof HTMLInputElement && PICKERS.includes(el.type))

const keydown = (e: KeyboardEvent) => {
  if (e.key !== "Escape" || e.defaultPrevented || overlayOpen()) {
    return
  }

  if (editor.editing) {
    editor.editing = null
  } else {
    hide()
  }
}

$effect(() => {
  const stop = getCurrentWebviewWindow().listen<HostEntry[]>(
    "float:hosts",
    ({ payload }) => remotes.connect(payload),
  )

  stop.then(() => askNav()).catch(e => logFailure("panel hosts", e))

  return () => {
    stop.then(f => f())
    remotes.stop()
  }
})

$effect(() => {
  loadDevice()
    .then(d => {
      device = d
    })
    .catch(e => logFailure("panel device", e))

  const stops = [
    onDevice(d => {
      device = d
    }),
    win.onFocusChanged(({ payload: focused }) => {
      if (focused) {
        if (!landed) {
          landed = true
          shownAt = Date.now()
        }

        return
      }

      const settling = Date.now() - shownAt < BLUR_GRACE_MS

      if (landed && !settling && !isPicker(document.activeElement)) {
        hide()
      }
    }),
    onWindowShown("panel", () => {
      landed = false
      shownAt = Date.now()
      today()
    }),
  ]

  return () => {
    for (const stop of stops) {
      stop.then(f => f())
    }
  }
})
</script>

<svelte:window onkeydown={keydown} />

<main
  {@attach windowRegion}
  class={[
    "fixed flex h-128 w-3xl gap-2 rounded-box border border-base-300 bg-base-200 p-2",
    "shadow-xl select-none",
    anchorTop ? "top-0" : "bottom-0",
    POSITIONS[device.panelPosition],
  ]}
>
  <div class="flex min-w-0 flex-1 flex-col gap-2">
    <header
      class={[
        "flex h-10 shrink-0 items-center gap-1 ps-3 pe-1.5",
        "rounded-box border border-base-300 bg-base-100",
      ]}
    >
      <h1 class="min-w-0 flex-1 truncate text-sm font-semibold tabular-nums">
        {title}
      </h1>
      {#if !editor.ready}
        <span class="loading loading-spinner loading-xs opacity-60"></span>
      {/if}
      <IconButton
        icon="lucide:chevron-left"
        label={m.calendar_prev()}
        onclick={() => shift(-1)}
      />
      <button type="button" class="btn btn-ghost btn-sm" onclick={today}>
        {m.calendar_today()}
      </button>
      <IconButton
        icon="lucide:chevron-right"
        label={m.calendar_next()}
        onclick={() => shift(1)}
      />
      <IconButton icon="lucide:x" label={m.common_close()} onclick={hide} />
    </header>
    <div
      class={["flex min-h-0 flex-1 flex-col gap-2", !editor.ready && "opacity-60"]}
      inert={!editor.ready}
    >
      <div class="flex shrink-0">
        <MonthGrid
          start={calendar.start}
          selected={calendar.selected}
          events={editor.events}
          tags={editor.tags}
          onpick={editor.choose}
        />
      </div>
      <TaskList {editor} class="min-h-0 flex-1 overflow-y-auto" />
    </div>
  </div>
  <div
    class={["flex w-xs shrink-0 flex-col gap-2", !editor.ready && "opacity-60"]}
    inert={!editor.ready}
  >
    <DayAgenda {editor} class="min-h-0 flex-1 overflow-y-auto" />
    <QuickMemo onopen={openDoc} />
  </div>
</main>
