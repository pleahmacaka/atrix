import type { Component } from "svelte"
import PairPanel from "#lib/components/devices/PairPanel.svelte"
import { m } from "#lib/paraglide/messages.js"
import { desktop } from "#lib/platform.ts"
import type { SettingsTab } from "#lib/store/nav.svelte.ts"
import AppearanceTab from "./AppearanceTab.svelte"
import CalendarTab from "./CalendarTab.svelte"
import ChannelsTab from "./ChannelsTab.svelte"
import DatasourceTab from "./DatasourceTab.svelte"
import DesktopTab from "./DesktopTab.svelte"
import GatewayTab from "./GatewayTab.svelte"
import GeneralTab from "./GeneralTab.svelte"
import HarnessTab from "./HarnessTab.svelte"
import SecurityTab from "./SecurityTab.svelte"
import ShortcutsTab from "./ShortcutsTab.svelte"

export const SETTINGS_TABS: {
  id: SettingsTab
  label: string
  icon: string
  body: Component
}[] = [
  {
    id: "general",
    label: m.settings_general(),
    icon: "lucide:settings",
    body: GeneralTab,
  },
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
    id: "datasource",
    label: m.settings_datasource(),
    icon: "lucide:database",
    body: DatasourceTab,
  },
  {
    id: "gateway",
    label: m.settings_gateway(),
    icon: "lucide:key-round",
    body: GatewayTab,
  },
  ...(desktop
    ? [
        {
          id: "channels" as const,
          label: m.settings_channels(),
          icon: "lucide:radio-tower",
          body: ChannelsTab,
        },
      ]
    : []),
  {
    id: "calendar",
    label: m.settings_calendar(),
    icon: "lucide:calendar",
    body: CalendarTab,
  },
  {
    id: "shortcuts",
    label: m.settings_shortcuts(),
    icon: "lucide:keyboard",
    body: ShortcutsTab,
  },
  {
    id: "security",
    label: m.settings_security(),
    icon: "lucide:shield",
    body: SecurityTab,
  },
  {
    id: "devices",
    label: m.shell_page_devices(),
    icon: "lucide:monitor-smartphone",
    body: PairPanel,
  },
  ...(desktop
    ? [
        {
          id: "desktop" as const,
          label: m.desktop_tab(),
          icon: "lucide:monitor",
          body: DesktopTab,
        },
      ]
    : []),
]
