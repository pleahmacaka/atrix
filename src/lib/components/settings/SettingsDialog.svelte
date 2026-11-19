<script lang="ts">
import { onBackButtonPress } from "@tauri-apps/api/app"
import { invoke } from "@tauri-apps/api/core"
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow"
import { MediaQuery } from "svelte/reactivity"
import IconButton from "#lib/components/ui/IconButton.svelte"
import Modal from "#lib/components/ui/Modal.svelte"
import { followSettings } from "#lib/desktop/theme.ts"
import { m } from "#lib/paraglide/messages.js"
import { desktop, mobileApp } from "#lib/platform.ts"
import { nav, openSettings, type SettingsTab } from "#lib/store/nav.svelte.ts"
import { SETTINGS_PAGE } from "#lib/store/pages.ts"
import { MAIN_SETTINGS } from "./desktopSettings.ts"
import SettingsList from "./SettingsList.svelte"
import { SETTINGS_TABS } from "./tabs.ts"

const narrow = new MediaQuery("(width < 40rem)")

const current = $derived(SETTINGS_TABS.find(t => t.id === nav.settingsTab) ?? SETTINGS_TABS[0])

const pick = (tab: SettingsTab) => {
  nav.settingsTab = tab
  nav.settingsHome = false
}

const home = $derived(narrow.current && nav.settingsHome)

$effect(() => {
  if (!desktop && !mobileApp) {
    return
  }

  if (desktop) {
    invoke("tray_labels", { settings: m.desktop_settings_title() }).catch(() => undefined)
  }

  const main = getCurrentWebviewWindow()
  const stop = main.listen<SettingsTab>(MAIN_SETTINGS, async ({ payload }) => {
    if (desktop) {
      await main.unminimize()
      await invoke("show_window", { label: "main" })
    }

    openSettings(payload)
  })

  return () => {
    stop.then(unlisten => unlisten())
  }
})

$effect(() => {
  if (!mobileApp || !nav.settingsOpen) {
    return
  }

  const listener = onBackButtonPress(() => {
    if (home || !narrow.current) {
      nav.settingsOpen = false
    } else {
      nav.settingsHome = true
    }
  })

  return () => {
    listener.then(handle => handle.unregister()).catch(() => undefined)
  }
})
</script>

<svelte:window onstorage={followSettings} />

<Modal
  bind:open={nav.settingsOpen}
  label={SETTINGS_PAGE.label()}
  class={[
    "w-full overflow-hidden",
    narrow.current
      ? "safe-inset! h-dvh max-h-none max-w-none flex-col rounded-none bg-base-200"
      : "h-160 max-w-3xl flex-row",
  ]}
>
  {#if narrow.current}
    <header class="flex h-12 shrink-0 items-center gap-1 px-1">
      {#if !home}
        <IconButton
          icon="lucide:chevron-left"
          label={m.common_back()}
          onclick={() => (nav.settingsHome = true)}
        />
      {/if}
      <h2 class={["min-w-0 flex-1 truncate text-base font-semibold", home ? "px-3" : "px-1"]}>
        {home ? SETTINGS_PAGE.label() : current.label}
      </h2>
      <IconButton
        icon="lucide:x"
        label={m.common_close()}
        onclick={() => (nav.settingsOpen = false)}
      />
    </header>
  {:else}
    <div class="flex w-44 shrink-0 flex-col bg-base-200/60 pt-3">
      <SettingsList items={SETTINGS_TABS} current={current.id} onpick={pick} />
    </div>
  {/if}
  {#if home}
    <div class="min-h-0 flex-1 overflow-y-auto">
      <SettingsList items={SETTINGS_TABS} current={current.id} onpick={pick} menu />
    </div>
  {:else}
    <section
      class={[
        "@container flex min-h-0 min-w-0 flex-1 flex-col overflow-x-hidden overflow-y-auto",
        narrow.current ? "px-3 pb-4" : "p-5",
      ]}
      aria-label={current.label}
    >
      {#key current.id}
        <current.body />
      {/key}
    </section>
  {/if}
</Modal>
