import { emit } from "@tauri-apps/api/event"
import { exit } from "@tauri-apps/plugin-process"
import {
  DESKTOP_SECTIONS,
  openDesktopSettings,
} from "#lib/components/settings/desktopSettings.ts"
import type { Result } from "#lib/desktop/launcher/core/index.ts"
import { loadDevice, type TerminalApp } from "#lib/desktop/settings/index.ts"
import { m } from "#lib/paraglide/messages.js"
import { newWindow as newTerminalWindow } from "#lib/terminal/app/windows.ts"
import {
  editMode,
  emptyRecycleBin,
  openAtrixFiles,
  openUrl,
  type PowerAction,
  powerAction,
  runCommand,
  showWindow,
} from "../native"
import { WINDOWS_PAGES } from "./windows-settings"

const command = (
  id: string,
  title: string,
  subtitle: string,
  icon: string,
  run: () => void | Promise<void>,
  keywords: string[] = [],
): Result => ({
  id: `command:${id}`,
  kind: "command",
  title,
  subtitle,
  icon,
  keywords,
  action: run,
  secondaryActions: [],
  score: 0,
})

const TERMINAL_COMMANDS: Record<
  Exclude<TerminalApp, "auto" | "atrix">,
  string
> = {
  wt: "wt",
  pwsh: "pwsh",
  powershell: "powershell",
  cmd: "cmd",
}

const openTerminal = async () => {
  const { terminal } = await loadDevice()

  if (terminal === "auto" || terminal === "atrix") {
    await newTerminalWindow()

    return
  }

  await runCommand(TERMINAL_COMMANDS[terminal])
}

const POWER_LABELS: Record<PowerAction, () => string> = {
  lock: m.launcher_cmd_lock,
  sleep: m.launcher_cmd_sleep,
  hibernate: m.launcher_cmd_hibernate,
  shutdown: m.launcher_cmd_shutdown,
  restart: m.launcher_cmd_restart,
  signout: m.launcher_cmd_signout,
}

export const powerLabel = (id: PowerAction) => POWER_LABELS[id]()

const power = (id: PowerAction, icon: string, keywords: string[] = []) =>
  command(
    id,
    powerLabel(id),
    m.launcher_sub_power(),
    icon,
    () => powerAction(id),
    keywords,
  )

const windowsPages = () =>
  WINDOWS_PAGES.map(page =>
    command(
      `ms-${page.id}`,
      page.label(),
      m.launcher_sub_windows_settings(),
      page.icon,
      () => openUrl(`ms-settings:${page.id}`),
      [...page.keywords, "settings"],
    ),
  )

const windowsApp = (
  id: string,
  title: string,
  icon: string,
  exe: string,
  keywords: string[] = [],
) =>
  command(
    id,
    title,
    m.launcher_sub_windows(),
    icon,
    () => runCommand(exe),
    keywords,
  )

const shellFolder = (
  id: string,
  title: string,
  icon: string,
  target: string,
  keywords: string[] = [],
) =>
  command(id, title, m.launcher_sub_folder(), icon, () => runCommand(target), [
    ...keywords,
    "folder",
  ])

export const systemCommands = (): Result[] => [
  power("lock", "lucide:lock", ["lock screen"]),
  power("sleep", "lucide:moon", ["suspend"]),
  power("hibernate", "lucide:moon-star"),
  power("shutdown", "lucide:power", ["power off", "turn off"]),
  power("restart", "lucide:rotate-cw", ["reboot"]),
  power("signout", "lucide:log-out", ["log off", "log out"]),
  command(
    "recycle",
    m.launcher_cmd_recycle(),
    m.launcher_sub_system(),
    "lucide:trash-2",
    emptyRecycleBin,
    ["trash"],
  ),
  command(
    "atrix-files",
    m.launcher_cmd_files(),
    m.launcher_sub_desktop(),
    "lucide:folder-open",
    () => openAtrixFiles(),
    ["explorer", "files"],
  ),
  command(
    "atrix-settings",
    m.launcher_cmd_desktop_settings(),
    m.launcher_sub_desktop(),
    "lucide:settings",
    () => openDesktopSettings(),
    ["preferences", "options"],
  ),
  command(
    "atrix-panel",
    m.launcher_cmd_panel(),
    m.launcher_sub_desktop(),
    "lucide:calendar",
    () => showWindow("panel"),
    ["calendar", "schedule", "events"],
  ),
  command(
    "atrix-quit",
    m.launcher_cmd_quit(),
    m.launcher_sub_desktop(),
    "lucide:circle-x",
    () => exit(0),
    ["exit", "close"],
  ),
  command(
    "atrix-edit",
    m.launcher_cmd_edit(),
    m.launcher_sub_desktop(),
    "lucide:pencil-ruler",
    () => editMode(true),
    ["layout", "customize", "arrange"],
  ),
  {
    ...command(
      "atrix-clipboard",
      m.launcher_cmd_clipboard(),
      m.launcher_sub_desktop(),
      "lucide:clipboard",
      () => emit("launcher-query", "clip "),
      ["clip", "paste", "copy"],
    ),
    stay: true,
  },
  command(
    "taskmgr",
    m.launcher_cmd_taskmgr(),
    m.launcher_sub_windows(),
    "lucide:activity",
    () => runCommand("taskmgr"),
    ["processes", "performance"],
  ),
  command(
    "explorer",
    m.launcher_cmd_explorer(),
    m.launcher_sub_windows(),
    "lucide:folder",
    () => runCommand("explorer"),
    ["files", "folders"],
  ),
  command(
    "terminal",
    m.launcher_cmd_terminal(),
    m.launcher_sub_windows(),
    "lucide:terminal",
    openTerminal,
    ["cmd", "console", "shell", "powershell"],
  ),
  command(
    "control",
    m.launcher_cmd_control(),
    m.launcher_sub_windows(),
    "lucide:sliders-horizontal",
    () => runCommand("control"),
  ),
  command(
    "screenclip",
    m.launcher_cmd_screenclip(),
    m.launcher_sub_windows(),
    "lucide:crop",
    () => openUrl("ms-screenclip:"),
    ["screenshot", "snip", "capture", "screen clip"],
  ),
  windowsApp(
    "snippingtool",
    m.launcher_cmd_snippingtool(),
    "lucide:scissors",
    "snippingtool",
    ["screenshot", "snip", "capture"],
  ),
  command(
    "windowsdefender",
    m.launcher_cmd_security(),
    m.launcher_sub_windows(),
    "lucide:shield-check",
    () => openUrl("windowsdefender:"),
    ["defender", "antivirus", "virus", "firewall"],
  ),
  windowsApp("devmgmt", m.launcher_cmd_devmgmt(), "lucide:cpu", "devmgmt.msc", [
    "drivers",
    "hardware",
  ]),
  windowsApp(
    "diskmgmt",
    m.launcher_cmd_diskmgmt(),
    "lucide:hard-drive",
    "diskmgmt.msc",
    ["partitions", "volumes", "format"],
  ),
  windowsApp(
    "services",
    m.launcher_cmd_services(),
    "lucide:server-cog",
    "services.msc",
    ["daemons", "background"],
  ),
  windowsApp(
    "regedit",
    m.launcher_cmd_regedit(),
    "lucide:file-cog",
    "regedit",
    ["registry", "regedit"],
  ),
  windowsApp(
    "eventvwr",
    m.launcher_cmd_eventvwr(),
    "lucide:scroll-text",
    "eventvwr.msc",
    ["logs", "events"],
  ),
  windowsApp("msinfo32", m.launcher_cmd_msinfo32(), "lucide:info", "msinfo32", [
    "specs",
    "about this pc",
    "msinfo",
  ]),
  windowsApp("charmap", m.launcher_cmd_charmap(), "lucide:type", "charmap", [
    "symbols",
    "unicode",
    "special characters",
  ]),
  windowsApp("calc", m.launcher_cmd_calc(), "lucide:calculator", "calc", [
    "math",
    "numbers",
  ]),
  windowsApp(
    "notepad",
    m.launcher_cmd_notepad(),
    "lucide:notebook-pen",
    "notepad",
    ["text editor", "notes"],
  ),
  windowsApp(
    "mspaint",
    m.launcher_cmd_mspaint(),
    "lucide:paintbrush",
    "mspaint",
    ["draw", "image editor"],
  ),
  shellFolder(
    "downloads",
    m.launcher_cmd_downloads(),
    "lucide:download",
    "shell:Downloads",
  ),
  shellFolder(
    "documents",
    m.launcher_cmd_documents(),
    "lucide:file-text",
    "shell:Personal",
    ["my documents"],
  ),
  shellFolder(
    "desktop",
    m.launcher_cmd_desktop(),
    "lucide:layout-dashboard",
    "shell:Desktop",
  ),
  shellFolder(
    "recyclebin",
    m.launcher_cmd_recyclebin(),
    "lucide:trash",
    "shell:RecycleBinFolder",
    ["trash", "bin", "deleted"],
  ),
  shellFolder(
    "thispc",
    m.launcher_cmd_thispc(),
    "lucide:monitor-cog",
    "shell:MyComputerFolder",
    ["my computer", "drives", "computer"],
  ),
  ...windowsPages(),
]

export const settingsLinks = (): Result[] =>
  DESKTOP_SECTIONS.map(({ id, label, icon }) => ({
    id: `setting:${id}`,
    kind: "setting",
    title: label,
    subtitle: m.launcher_sub_desktop_settings(),
    icon,
    keywords: ["settings", id],
    action: () => openDesktopSettings(id),
    secondaryActions: [],
    score: 0,
  }))
