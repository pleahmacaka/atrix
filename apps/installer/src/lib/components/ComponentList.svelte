<script lang="ts">
import Icon from "@iconify/svelte"
import type { Components, Platform } from "#lib/installer.ts"
import { m } from "#lib/messages.ts"

let {
  platform,
  value = $bindable(),
}: { platform: Platform; value: Components } = $props()

type Row = {
  id: "client" | keyof Components
  icon: string
  title: string
  detail: string
}

const windows = $derived(platform === "windows")

const set = (id: Row["id"], on: boolean) => {
  if (id !== "client") {
    value[id] = on
  }
}

const rows = $derived<Row[]>([
  {
    id: "client",
    icon: "lucide:bot",
    title: m.client,
    detail: m.client_detail,
  },
  ...(windows
    ? [
        {
          id: "shell" as const,
          icon: "lucide:panels-top-left",
          title: m.shell,
          detail: m.shell_detail,
        },
      ]
    : []),
  {
    id: "files",
    icon: "lucide:folder-open",
    title: windows ? m.default_files : m.files,
    detail: windows ? m.default_files_detail : m.files_detail,
  },
  {
    id: "terminal",
    icon: "lucide:square-terminal",
    title: m.terminal,
    detail: m.terminal_detail,
  },
])
</script>

<ul class="island flex flex-col p-2">
  {#each rows as row (row.id)}
    <li>
      <label
        class={[
          "flex items-center gap-3 rounded-field px-3 py-2.5",
          row.id !== "client" &&
            "cursor-pointer transition-colors hover:bg-base-content/4",
        ]}
      >
        <span
          class={[
            "grid size-9 shrink-0 place-items-center rounded-field",
            "bg-primary/8 text-primary",
          ]}
        >
          <Icon icon={row.icon} class="size-5" />
        </span>
        <span class="flex min-w-0 grow flex-col">
          <span class="truncate text-sm font-medium" title={row.title}>
            {row.title}
          </span>
          <span class="truncate text-xs text-base-content/60" title={row.detail}>
            {row.detail}
          </span>
        </span>
        <input
          type="checkbox"
          class="toggle toggle-primary toggle-sm"
          checked={row.id === "client" || value[row.id]}
          disabled={row.id === "client"}
          onchange={e => set(row.id, e.currentTarget.checked)}
        />
      </label>
    </li>
  {/each}
</ul>
