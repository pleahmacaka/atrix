<script lang="ts">
import Icon from "@iconify/svelte"
import type { ThoughtItem, ToolItem } from "#lib/acp/items.ts"
import { plainText } from "#lib/chat/plain.ts"
import { m } from "#lib/paraglide/messages.js"
import { KIND_ICONS } from "./labels.ts"

let { items, latest = false }: { items: (ToolItem | ThoughtItem)[]; latest?: boolean } =
  $props()

const tools = $derived(items.filter(i => i.type === "tool"))

const RECENT = 5

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
    <span class="loading loading-spinner loading-xs"></span>
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
        icon={KIND_ICONS[item.kind] ?? "lucide:wrench"}
        class="size-3.5 shrink-0 opacity-60"
      />
      <span class="min-w-0 truncate" title={item.title || item.kind}>
        {item.title || item.kind}
      </span>
      {#if item.detail}
        <Icon
          icon="lucide:chevron-right"
          class="size-3 shrink-0 opacity-50 transition-transform group-open/tool:rotate-90"
        />
      {/if}
    </summary>
    {#if item.detail}
      <pre
        class={[
          "mt-1.5 max-h-64 overflow-auto rounded-field bg-inset p-3",
          "text-xs break-all whitespace-pre-wrap",
        ]}>{unfence(item.detail)}</pre>
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
