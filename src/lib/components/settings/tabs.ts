import type { Component } from "svelte"
import { m } from "#lib/paraglide/messages.js"
import type { SettingsTab } from "#lib/store/nav.svelte.ts"
import AppearanceTab from "./AppearanceTab.svelte"
import DeviceTab from "./DeviceTab.svelte"
import HarnessTab from "./HarnessTab.svelte"
import OpenRouterTab from "./OpenRouterTab.svelte"
import ShortcutsTab from "./ShortcutsTab.svelte"
import SyncTab from "./SyncTab.svelte"

export const SETTINGS_TABS: {
  id: SettingsTab
  label: string
  icon: string
  body: Component
}[] = [
  {
    id: "appearance",
    label: m.settings_appearance(),
    icon: "lucide:palette",
    body: AppearanceTab,
  },
  {
    id: "harness",
    label: m.common_harnesses(),
    icon: "lucide:boxes",
    body: HarnessTab,
  },
  {
    id: "sync",
    label: m.settings_sync(),
    icon: "lucide:refresh-cw",
    body: SyncTab,
  },
  {
    id: "openrouter",
    label: "OpenRouter",
    icon: "lucide:key-round",
    body: OpenRouterTab,
  },
  {
    id: "shortcuts",
    label: m.settings_shortcuts(),
    icon: "lucide:keyboard",
    body: ShortcutsTab,
  },
  {
    id: "device",
    label: m.settings_device(),
    icon: "lucide:monitor-smartphone",
    body: DeviceTab,
  },
]
