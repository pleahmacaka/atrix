export const KIND_ICONS: Record<string, string> = {
  read: "lucide:file-text",
  edit: "lucide:pencil",
  delete: "lucide:trash-2",
  move: "lucide:move",
  search: "lucide:search",
  execute: "lucide:terminal",
  think: "lucide:brain",
  fetch: "lucide:globe",
  switch_mode: "lucide:list-todo",
}

export const TOOL_ICONS: Record<string, string> = {
  Bash: "lucide:square-terminal",
  PowerShell: "lucide:square-terminal",
  Read: "lucide:file-text",
  Write: "lucide:file-plus",
  Edit: "lucide:file-pen",
  MultiEdit: "lucide:file-pen",
  NotebookEdit: "lucide:notebook-pen",
  Grep: "lucide:text-search",
  Glob: "lucide:folder-search",
  WebFetch: "lucide:globe",
  WebSearch: "lucide:search",
  Agent: "lucide:bot",
  Task: "lucide:bot",
  TodoWrite: "lucide:list-checks",
  ToolSearch: "lucide:package-search",
  AskUserQuestion: "lucide:circle-help",
  SendUserFile: "lucide:send",
  Skill: "lucide:sparkles",
  advisor: "lucide:graduation-cap",
}

export const toolIcon = (title: string, kind: string) => {
  const name = title.split(":")[0].trim()

  return (
    TOOL_ICONS[name] ??
    (name.startsWith("mcp__") ? "lucide:plug" : undefined) ??
    KIND_ICONS[kind] ??
    "lucide:wrench"
  )
}

export const STATUS_ICONS: Record<string, string> = {
  pending: "lucide:circle-dashed",
  in_progress: "lucide:loader",
  completed: "lucide:circle-check",
  failed: "lucide:circle-x",
}

export const CARD = "min-w-0 rounded-box border border-base-300 bg-base-100 p-4"

export const BUBBLE = [
  "max-w-xl min-w-0 rounded-box bg-inset px-4 py-2",
  "break-keep whitespace-pre-wrap wrap-anywhere",
]

export const REVEAL = [
  "text-base-content/50 transition-opacity",
  "pointer-fine:opacity-0 pointer-fine:group-hover:opacity-100",
  "pointer-fine:focus-within:opacity-100",
]
