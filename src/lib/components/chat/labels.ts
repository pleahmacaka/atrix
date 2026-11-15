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
  "transition-opacity",
  "lg:pointer-fine:opacity-0 lg:pointer-fine:group-hover:opacity-100",
]
