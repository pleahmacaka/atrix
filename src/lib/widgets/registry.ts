import type { Component } from "svelte"
import { m } from "#lib/paraglide/messages.js"
import ActionsWidget from "./ActionsWidget.svelte"
import AppWidget from "./AppWidget.svelte"
import type { WidgetLeaf, WidgetType } from "./layout.svelte.ts"
import NavigatorWidget from "./NavigatorWidget.svelte"
import PagesWidget from "./PagesWidget.svelte"
import WorkspaceWidget from "./WorkspaceWidget.svelte"

export type WidgetOption = {
  key: string
  label: () => string
  choices: { value: string; label: () => string; icon: string }[]
}

export type WidgetDefinition = {
  label: () => string
  icon: string
  body: Component<{ leaf: WidgetLeaf }>
  intrinsic: boolean
  closable: boolean
  options: WidgetOption[]
}

export const WIDGETS: Record<WidgetType, WidgetDefinition> = {
  actions: {
    label: m.widget_actions,
    icon: "lucide:zap",
    body: ActionsWidget,
    intrinsic: true,
    closable: true,
    options: [
      {
        key: "layout",
        label: m.widget_option_layout,
        choices: [
          { value: "list", label: m.widget_layout_list, icon: "lucide:list" },
          {
            value: "icons",
            label: m.widget_layout_icons,
            icon: "lucide:layout-grid",
          },
        ],
      },
    ],
  },
  navigator: {
    label: m.widget_navigator,
    icon: "lucide:panel-left",
    body: NavigatorWidget,
    intrinsic: false,
    closable: true,
    options: [],
  },
  pages: {
    label: m.widget_pages,
    icon: "lucide:layers",
    body: PagesWidget,
    intrinsic: true,
    closable: true,
    options: [],
  },
  app: {
    label: m.widget_app,
    icon: "lucide:app-window",
    body: AppWidget,
    intrinsic: false,
    closable: true,
    options: [],
  },
  workspace: {
    label: m.widget_workspace,
    icon: "lucide:app-window",
    body: WorkspaceWidget,
    intrinsic: false,
    closable: false,
    options: [],
  },
}
