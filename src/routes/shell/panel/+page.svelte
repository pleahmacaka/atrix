<script lang="ts">
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow"
import { getCurrentWindow } from "@tauri-apps/api/window"
import { tick } from "svelte"
import { agentLaunched } from "#lib/components/settings/desktopSettings.ts"
import { askAtrix } from "#lib/desktop/launcher/atrix.ts"
import { setShareWatch, watchScreenShare } from "#lib/desktop/native/share.ts"
import {
  hideWindow,
  onWindowHidden,
  onWindowShown,
} from "#lib/desktop/native/windows.ts"
import CompactPanel from "#lib/desktop/panel/CompactPanel.svelte"
import MonthGrid from "#lib/desktop/panel/MonthGrid.svelte"
import { Morph } from "#lib/desktop/panel/morph.svelte.ts"
import PanelAside from "#lib/desktop/panel/PanelAside.svelte"
import PanelHeader from "#lib/desktop/panel/PanelHeader.svelte"
import { Panel } from "#lib/desktop/panel/panel.svelte.ts"
import {
  type DeviceSettings,
  defaultDevice,
  loadDevice,
  onDevice,
} from "#lib/desktop/settings/index.ts"
import { logFailure } from "#lib/logging.ts"
import { askNav, type HostEntry, RemoteHosts } from "#lib/p2p/float.svelte.ts"
import { hostList } from "#lib/p2p/hosts.svelte.ts"

const PICKERS = ["date", "datetime-local", "time", "color", "file"]

const BLUR_GRACE_MS = 400

const CLOCK_MS = 60_000

const POSITIONS: Record<DeviceSettings["panelPosition"], string> = {
  left: "left-0",
  center: "left-1/2 -translate-x-1/2",
  right: "right-0",
}

const win = getCurrentWindow()

const remotes = new RemoteHosts()

const morph = new Morph()

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

const panel = new Panel(() => hostList().map(h => h.view), openDoc)

const anchorTop = $derived(
  device.dockEdge === "top" || (device.topBar && device.features.dock),
)

const hidesWhileSharing = $derived(panel.tags.some(t => t.hideWhileSharing))

const rest = () =>
  morph.snap(false, () => {
    panel.revealedDays = []
    panel.close()
  })

const collapse = () => {
  panel.close()
  morph.collapse()
}

const isPicker = (el: Element | null) =>
  el instanceof HTMLSelectElement ||
  (el instanceof HTMLInputElement && PICKERS.includes(el.type))

const keydown = (e: KeyboardEvent) => {
  if (e.key !== "Escape" || document.querySelector(":popover-open")) {
    return
  }

  if (panel.asking) {
    panel.asking.answer(null)
  } else if (panel.detailOpen) {
    panel.close()
  } else if (morph.expanded) {
    collapse()
  } else {
    hide()
  }
}

$effect(() => {
  void [device.panelPosition, anchorTop]
  tick().then(morph.fit)
})

$effect(() => {
  if (hidesWhileSharing) {
    setShareWatch(true).catch(e => logFailure("panel share watch", e))
  }
})

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
  agentLaunched().then(on => {
    panel.knowledge = on
  })
  loadDevice()
    .then(d => {
      device = d
    })
    .catch(e => logFailure("panel device", e))

  const clock = setInterval(() => {
    panel.now = new Date()
  }, CLOCK_MS)

  const stops = [
    onDevice(d => {
      device = d
    }),
    watchScreenShare(sharing => {
      panel.sharing = sharing

      if (!sharing) {
        panel.revealedDays = []
      }
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
      panel.reset()
    }),
    onWindowHidden("panel", rest),
  ]

  return () => {
    clearInterval(clock)

    for (const stop of stops) {
      stop.then(f => f())
    }
  }
})
</script>

<svelte:window onkeydown={keydown} onresize={morph.fit} />

<div
  {@attach morph.overlays}
  class="contents"
  inert={!panel.ready}
>
  <div
    class={[
      "absolute flex transition-opacity select-none",
      anchorTop ? "top-0 items-start" : "bottom-0 items-end",
      POSITIONS[device.panelPosition],
      morph.expanded
        ? "pointer-events-none opacity-0 duration-140"
        : "delay-160 duration-200",
      morph.snapping && "transition-none",
    ]}
    inert={morph.expanded}
  >
    <CompactPanel {panel} {morph} />
  </div>

  <div
    class={[
      "absolute inset-0 transition-all duration-200 select-none",
      !morph.expanded && "pointer-events-none",
      morph.snapping && "transition-none",
    ]}
    style:clip-path={morph.clipPath}
    inert={!morph.expanded}
    ontransitionend={morph.settle}
  >
    <div
      class={[
        "size-full transition-opacity duration-120",
        !morph.expanded && "opacity-0 delay-160",
        morph.snapping && "transition-none",
      ]}
    >
      <div
        {@attach morph.fullCard}
        class={[
          "absolute inset-x-0 flex h-152 max-h-full gap-2 p-2",
          "rounded-box border border-base-300 bg-base-200",
          anchorTop ? "top-0" : "bottom-0",
          !panel.ready && "opacity-60",
        ]}
      >
        <main
          class="flex min-w-0 flex-1 flex-col rounded-box border border-base-300 bg-base-100"
        >
          <PanelHeader {panel} {collapse} {hide} />
          <div class="flex min-h-0 flex-1 flex-col px-2 pb-2">
            <MonthGrid {panel} />
          </div>
        </main>
        <div class="flex w-88 shrink-0">
          <PanelAside {panel} />
        </div>
      </div>
    </div>
  </div>
</div>
