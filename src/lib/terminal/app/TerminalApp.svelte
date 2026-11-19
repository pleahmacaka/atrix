<script lang="ts">
import { acceptTabs } from "./drag.svelte"
import { sessionShortcut } from "./keys"
import PaneArea from "./PaneArea.svelte"
import { prefs } from "./prefs.svelte"
import SettingsDialog from "./SettingsDialog.svelte"
import TabStrip from "./TabStrip.svelte"
import TitleBar from "./TitleBar.svelte"
import { adoptTab, loadShells, openTab, session } from "./tabs.svelte"
import { newWindow, takeIntent } from "./windows"

const shortcut = (e: KeyboardEvent) => {
  if (sessionShortcut(e)) {
    return true
  }

  const ctrl = e.ctrlKey && !e.altKey && !e.metaKey

  if (ctrl && e.code === "Comma") {
    session.settingsOpen = true

    return true
  }

  if (ctrl && e.shiftKey && e.code === "KeyN") {
    newWindow()

    return true
  }

  return false
}

const onkeydowncapture = (e: KeyboardEvent) => {
  if (shortcut(e)) {
    e.preventDefault()
    e.stopPropagation()
  }
}

$effect(() => {
  Promise.all([loadShells(), takeIntent()]).then(([, intent]) => {
    if (intent.handoff) {
      adoptTab(intent.handoff)
    } else {
      openTab({ cwd: intent.cwd })
    }
  })
})

$effect(() => acceptTabs(adoptTab))
</script>

<svelte:window {onkeydowncapture} />

<div class="window-frame flex h-dvh flex-col bg-base-200" data-frame>
  <TitleBar />
  <div class="flex min-h-0 flex-1">
    {#if prefs.sideTabs}
      <aside class="flex w-56 shrink-0 flex-col gap-1 ps-2 pb-2">
        <TabStrip vertical />
      </aside>
    {/if}
    <div class="island mx-2 mb-2 flex min-h-0 flex-1 overflow-hidden">
      <PaneArea />
    </div>
  </div>
</div>

<SettingsDialog />
