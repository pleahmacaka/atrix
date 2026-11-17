<script lang="ts">
import Icon from "@iconify/svelte"
import { SvelteSet } from "svelte/reactivity"
import type { ThoughtItem, ToolItem } from "#lib/acp/items.ts"
import { plainText } from "#lib/chat/plain.ts"
import { m } from "#lib/paraglide/messages.js"
import { toolIcon } from "./labels.ts"

let { items, latest = false }: { items: (ToolItem | ThoughtItem)[]; latest?: boolean } =
  $props()

const tools = $derived(items.filter(i => i.type === "tool"))

const RECENT = 5

const wide = new SvelteSet<string>()

let now = $state(Date.now())

$effect(() => {
  if (!latest || !items.some(i => i.type === "tool" && i.at && !i.done && i.status !== "failed")) {
    return
  }

  const timer = setInterval(() => {
    now = Date.now()
  }, 1000)

  return () => clearInterval(timer)
})

const span = (ms: number) => {
  const seconds = Math.max(0, Math.round(ms / 1000))

  return seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m ${seconds % 60}s`
}

const timing = (tool: ToolItem) => {
  if (!tool.at) {
    return ""
  }

  if (tool.done) {
    return span(tool.done - tool.at)
  }

  if (!latest || tool.status === "completed" || tool.status === "failed") {
    return ""
  }

  return tool.timeout ? `${span(now - tool.at)}/${span(tool.timeout)}` : span(now - tool.at)
}

let all = $state(false)

const shown = $derived(all ? items : items.slice(-RECENT))

const hidden = $derived(items.length - shown.length)

const notes = $derived(items.some(i => i.type === "thought" && i.text.trim()))

const running = $derived(
  tools.some(t => t.status !== "completed" && t.status !== "failed"),
)

const failed = $derived(tools.some(t => t.status === "failed"))

const KIND_LABELS: Record<string, () => string> = {
  execute: m.tool_kind_execute,
  read: m.tool_kind_read,
  edit: m.tool_kind_edit,
  delete: m.tool_kind_delete,
  move: m.tool_kind_move,
  search: m.tool_kind_search,
  fetch: m.tool_kind_fetch,
  think: m.tool_kind_think,
}

const verbOf = (tool: ToolItem) =>
  (KIND_LABELS[tool.kind] ?? m.tool_kind_other)()

const FENCE = "```"

const unfence = (text: string) => {
  const lines = text.trim().split("\n")
  const last = lines.at(-1)?.trim()

  return lines.length > 1 && lines[0].startsWith(FENCE) && last === FENCE
    ? lines.slice(1, -1).join("\n")
    : text
}

const HIDDEN_KEYS = new Set(["description"])

const linesOf = (value: unknown, depth: number): string[] => {
  const pad = "  ".repeat(depth)

  if (Array.isArray(value)) {
    return value.flatMap(v =>
      v && typeof v === "object"
        ? [`${pad}-`, ...linesOf(v, depth + 1)]
        : [`${pad}- ${String(v)}`],
    )
  }

  if (value && typeof value === "object") {
    return Object.entries(value)
      .filter(([key]) => depth > 0 || !HIDDEN_KEYS.has(key))
      .flatMap(([key, v]) =>
        v && typeof v === "object"
          ? [`${pad}.${key}:`, ...linesOf(v, depth + 1)]
          : [`${pad}.${key}: ${String(v).replaceAll("\n", `\n${pad}  `)}`],
      )
  }

  return [`${pad}${String(value)}`]
}

const readable = (detail: string) => {
  const end = detail.startsWith("{") ? detail.indexOf("\n}") : -1

  if (end === -1) {
    return detail
  }

  try {
    const input = JSON.parse(detail.slice(0, end + 2))
    const rest = detail.slice(end + 2).trim()

    return [linesOf(input, 0).join("\n"), rest].filter(Boolean).join("\n\n")
  } catch {
    return detail
  }
}

const summary = $derived.by(() => {
  const verbs = new Set(tools.map(verbOf))
  const [only] = verbs

  return verbs.size === 1 && only && tools.length > 1
    ? m.tools_repeat({ verb: only, count: tools.length })
    : m.tools_group({ count: tools.length })
})
</script>

{#snippet status(state: string)}
  {#if state === "failed"}
    <Icon icon="lucide:triangle-alert" class="size-3.5 shrink-0" />
  {:else if state === "completed"}
    <Icon icon="lucide:check" class="size-3.5 shrink-0" />
  {:else}
    <span class="loading loading-spinner size-3.5 shrink-0"></span>
  {/if}
{/snippet}

{#snippet tool(item: ToolItem, open = false)}
  <details class="group/tool" {open}>
    <summary
      class={[
        "flex cursor-pointer list-none items-center gap-1.5 text-xs",
        item.status === "failed" ? "text-error" : "text-base-content/70",
      ]}
    >
      {@render status(item.status)}
      <Icon
        icon={toolIcon(item.title, item.kind)}
        class="size-3.5 shrink-0 opacity-60"
      />
      <span class="min-w-0 truncate" title={item.title || item.kind}>
        {item.title || item.kind}
      </span>
      {#if timing(item)}
        <span class="shrink-0 text-base-content/45 tabular-nums">{timing(item)}</span>
      {/if}
      {#if item.detail}
        <Icon
          icon="lucide:chevron-right"
          class="size-3 shrink-0 opacity-50 transition-transform group-open/tool:rotate-90"
        />
      {/if}
    </summary>
    {#if item.detail}
      {@const big = wide.has(item.id)}
      <pre
        class={[
          "mt-1.5 overflow-auto rounded-field bg-inset p-3",
          "text-xs break-all whitespace-pre-wrap",
          big ? "max-h-160" : "max-h-32",
        ]}>{readable(unfence(item.detail))}</pre>
      <button
        type="button"
        class="btn btn-ghost btn-xs mt-0.5 font-normal text-base-content/55"
        onclick={() => {
          if (!wide.delete(item.id)) {
            wide.add(item.id)
          }
        }}
      >
        <Icon icon={big ? "lucide:minimize-2" : "lucide:maximize-2"} class="size-3" />
        {big ? m.tool_detail_collapse() : m.tool_detail_expand()}
      </button>
    {/if}
  </details>
{/snippet}

{#if tools.length === 1 && !notes}
  <div class="my-1">
    {@render tool(tools[0], latest)}
  </div>
{:else if tools.length > 0 || notes}
  <details class="group/tools my-1" open={latest}>
    <summary
      class={[
        "badge badge-soft h-auto cursor-pointer list-none gap-1.5 py-1",
        failed && !running && "badge-error",
      ]}
    >
      {@render status(running ? "running" : failed ? "failed" : "completed")}
      <span>{tools.length ? summary : m.chat_reasoning()}</span>
      <Icon
        icon="lucide:chevron-down"
        class="size-3 transition-transform group-open/tools:rotate-180"
      />
    </summary>
    <ul
      class="mt-2 flex flex-col gap-1.5 border-l border-base-300 pl-3"
      aria-label={m.tools_activity()}
    >
      {#if hidden > 0}
        <li>
          <button
            type="button"
            class="btn btn-ghost btn-xs font-normal text-base-content/60"
            onclick={() => {
              all = true
            }}
          >
            {m.tools_show_earlier({ count: hidden })}
          </button>
        </li>
      {/if}
      {#each shown as item (item.id)}
        {#if item.type === "thought"}
          {#if item.text.trim()}
            <li
              class={[
                "line-clamp-4 flex gap-1.5 text-xs",
                "text-base-content/50",
              ]}
            >
              <Icon icon="lucide:brain" class="mt-0.5 size-3.5 shrink-0" />
              <span>{plainText(item.text)}</span>
            </li>
          {/if}
        {:else}
          <li>{@render tool(item)}</li>
        {/if}
      {/each}
    </ul>
  </details>
{/if}
