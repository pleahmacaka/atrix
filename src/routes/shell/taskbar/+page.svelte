<script lang="ts">
  import { listen } from "@tauri-apps/api/event"
  import { getCurrentWindow, Window } from "@tauri-apps/api/window"
  import { disable, enable, isEnabled } from "@tauri-apps/plugin-autostart"
  import { tick, untrack } from "svelte"
  import { ensureDevice } from "#lib/desktop/device.js"
  import {
    DockBar,
    DockLayout,
    dockAwake,
    previewHover,
    startDock,
    TrayStatus,
    watchPopovers,
  } from "#lib/desktop/dock/index.js"
  import { watchEdit } from "#lib/desktop/edit/index.js"
  import { startTimerWatch } from "#lib/desktop/launcher/index.js"
  import { reducedMotion } from "#lib/desktop/motion.ts"
  import * as native from "#lib/desktop/native/index.js"
  import { onDevice } from "#lib/desktop/settings/index.ts"

  const HIDE_SLIDE = 140
  const REOPEN_GUARD = 400

  const layout = new DockLayout()

  const status = new TrayStatus(() => layout.device.showNotifications && dockAwake.visible)

  let ready = $state(false)
  let hovered = $state(false)
  let edgeHover = $state(false)
  let held = $state(false)
  let panelOpen = $state(false)
  let pageHidden = $state(false)
  let hiddenAt = 0

  const device = $derived(layout.device)

  const hotkey = $derived(`${device.launcherTrigger}|${device.launcherShortcut}`)

  $effect(() => {
    const box = layout.menuBox

    native
      .extendTaskbar(layout.lift, box ? [box.left, box.top, box.right, box.bottom] : null)
      .catch(() => undefined)
  })

  const refreshVisibility = async () => {
    const [panel, launcher] = await Promise.all(
      (["panel", "launcher"] as const).map(async label => {
        const win = await Window.getByLabel(label)

        return (await win?.isVisible().catch(() => false)) ?? false
      }),
    )

    panelOpen = panel
    held = panel || launcher
  }

  const togglePanel = async () => {
    const panel = await Window.getByLabel("panel")
    const visible = (await panel?.isVisible().catch(() => false)) ?? false

    await layout.applyLayout()

    if (visible) {
      panelOpen = false
      await native.hideWindow("panel")

      return
    }

    if (Date.now() - hiddenAt < REOPEN_GUARD) {
      return
    }

    panelOpen = true
    await native.showWindow("panel")
  }

  $effect(() => {
    ensureDevice().then(d => {
      layout.device = d
      ready = true
    })
    native
      .dockMaximized()
      .then(maximized => {
        layout.maximized = maximized
      })
      .catch(() => undefined)

    const stops = [
      onDevice(d => {
        layout.device = d
      }),
      native.onWindowShown("panel", refreshVisibility),
      native.onWindowShown("launcher", refreshVisibility),
      listen<string>("window-hidden", e => {
        if (e.payload === "panel") {
          hiddenAt = Date.now()
        }

        refreshVisibility()
      }),
      listen("foreground-changed", () => {
        // the pointer still being over the dock means the user is interacting, not leaving
        if (!hovered) {
          layout.closeMenus()
        }
      }),
      listen("atrix-close-menus", () => {
        layout.closeLocal()
      }),
      listen<string>("window-shown", e => {
        if (!["taskbar", "topbar", "preview"].includes(e.payload)) {
          layout.closeMenus()
        }
      }),
      native.onDockEdge(atEdge => {
        edgeHover = atEdge
      }),
      native.onDockMaximized(maximized => {
        layout.maximized = maximized
      }),
      listen<{ visible: boolean }>("dock-visible", e => {
        layout.dockHidden = !e.payload.visible

        if (layout.dockHidden) {
          hovered = false
          edgeHover = false
          layout.inside = false
          layout.closeMenus()
        } else {
          untrack(layout.applyLayout)
        }
      }),
      native.onDockFullscreen(fullscreen => {
        if (fullscreen) {
          layout.closeMenus()
        }
      }),
      getCurrentWindow().onFocusChanged(({ payload: focused }) => {
        if (!focused) {
          layout.closeMenus()
        }
      }),
    ]
    const stopPopovers = watchPopovers(layout.claim)
    const stopDock = startDock()
    const stopTimers = startTimerWatch()
    const stopEditWatch = watchEdit()

    refreshVisibility()

    return () => {
      stopPopovers()
      stopDock()
      stopTimers()
      stopEditWatch()

      for (const stop of stops) {
        stop.then(fn => fn())
      }
    }
  })

  let applyTimer: ReturnType<typeof setTimeout> | undefined

  $effect(() => {
    void layout.staticKey
    void layout.dockWidth

    if (!ready) {
      return
    }

    clearTimeout(applyTimer)
    applyTimer = setTimeout(() => untrack(layout.applyLayout), 60)

    return () => clearTimeout(applyTimer)
  })

  $effect(() => {
    if (!ready) {
      return
    }

    const [trigger, shortcut] = hotkey.split("|")
    const launcher = device.features.launcher

    native
      .setLauncherShortcut(launcher && trigger !== "win" ? shortcut : null)
      .catch(() => undefined)
    native.setWinKeyCapture(launcher && trigger !== "shortcut").catch(() => undefined)
  })

  $effect(() => {
    if (!ready) {
      return
    }

    native.setFeatures($state.snapshot(device.features)).catch(() => undefined)
  })

  $effect(() => {
    if (!ready || !device.onboarded) {
      return
    }

    const wanted = device.autostart

    isEnabled()
      .then(on => (on === wanted ? undefined : wanted ? enable() : disable()))
      .catch(() => undefined)
  })

  const stay = $derived(
    !device.dockAutoHide ||
      layout.desktop ||
      hovered ||
      edgeHover ||
      held ||
      previewHover.over ||
      layout.menuBox !== null,
  )

  let motionRun = 0

  const frame = () => new Promise(resolve => requestAnimationFrame(resolve))

  const conceal = async () => {
    const run = ++motionRun

    layout.closeMenus()

    if (device.dockHideAnimation && !reducedMotion()) {
      layout.hiding = true
      await new Promise(resolve => setTimeout(resolve, HIDE_SLIDE))
    }

    if (run === motionRun) {
      layout.collapsed = true
    }
  }

  const reveal = async () => {
    const run = ++motionRun
    const regrow = layout.collapsed

    layout.collapsed = false

    if (!layout.hiding) {
      return
    }

    if (regrow) {
      await tick()
      await frame()
      await frame()
    }

    if (run === motionRun) {
      layout.hiding = false
    }
  }

  $effect(() => {
    if (!ready || layout.dockHidden) {
      return
    }

    if (stay) {
      untrack(reveal)

      return
    }

    const timer = setTimeout(conceal, device.dockHideDelay)

    return () => clearTimeout(timer)
  })

  $effect(() => {
    dockAwake.visible = !layout.dockHidden && !pageHidden
  })
</script>

<svelte:document
  onmouseenter={() => {
    hovered = true
    layout.inside = true
  }}
  onmouseleave={() => {
    hovered = false
    layout.inside = false
  }}
  onvisibilitychange={() => {
    pageHidden = document.visibilityState !== "visible"
  }}
/>

<DockBar {layout} {status} {panelOpen} onclock={togglePanel} />
