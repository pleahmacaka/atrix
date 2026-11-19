<script lang="ts">
import Icon from "@iconify/svelte"
import { cubicOut } from "svelte/easing"
import { SvelteSet } from "svelte/reactivity"
import { slide } from "svelte/transition"
import type { ThoughtItem, ToolItem } from "#lib/acp/items.ts"
import { type JsonToken, jsonTokens, splitJson } from "#lib/chat/json.ts"
import { plainText } from "#lib/chat/plain.ts"
import { m } from "#lib/paraglide/messages.js"
import { toolIcon } from "./labels.ts"

let { items, latest = false }: { items: (ToolItem | ThoughtItem)[]; latest?: boolean } =
  $props()

const tools = $derived(items.filter(i => i.type === "tool"))

const RECENT = 5

const wide = new SvelteSet<string>()

const opened = new SvelteSet<string>()

const intent = (id: string) => (summary: HTMLElement) => {
  const click = () => {
    if (summary.parentElement?.hasAttribute("open")) {
      opened.delete(id)
    } else {
      opened.add(id)
    }
  }

  summary.addEventListener("click", click)

  return () => summary.removeEventListener("click", click)
}

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

const GAP = "\n\n"

const TONES: Record<JsonToken["kind"], string> = {
  key: "text-primary",
  string: "text-success",
  number: "text-warning",
  literal: "text-info",
  plain: "text-base-content/60",
}

const wipe = (_: Element) => ({
  duration: 200,
  easing: cubicOut,
  css: (t: number) =>
    `clip-path: inset(0 ${(1 - t) * 100}% 0 0); opacity: ${0.4 + 0.6 * t}`,
})

const live = (tool: ToolItem) =>
  latest && tool.status !== "completed" && tool.status !== "failed"

const follow = (live: () => boolean, text: () => string) => (pre: HTMLElement) => {
  $effect(() => {
    void text()

    if (live()) {
      pre.scrollTop = pre.scrollHeight
    }
  })
}

type Row =
  | { kind: "thought"; item: ThoughtItem }
  | { kind: "tools"; id: string; items: ToolItem[] }

const verbWord = (tool: ToolItem) => {
  const title = tool.title.trim()
  const space = title.indexOf(" ")

  return space > 0 ? title.slice(0, space) : verbOf(tool)
}

const targetOf = (tool: ToolItem) => {
  const title = tool.title.trim()
  const space = title.indexOf(" ")
  const rest = space > 0 ? title.slice(space + 1).trim() : title || tool.kind
  const name = rest.split(/[\\/]/).at(-1)

  return name || rest
}

const keyOf = (tool: ToolItem) => `${tool.kind}:${verbWord(tool)}`

const rows = $derived(
  shown.reduce<Row[]>((out, item) => {
    if (item.type === "thought") {
      out.push({ kind: "thought", item })

      return out
    }

    const last = out.at(-1)

    if (last?.kind === "tools" && keyOf(last.items[0]) === keyOf(item)) {
      last.items.push(item)
    } else {
      out.push({ kind: "tools", id: item.id, items: [item] })
    }

    return out
  }, []),
)

const picked = new SvelteSet<string>()

const groupState = (items: ToolItem[]) =>
  items.some(t => t.status === "failed")
    ? "failed"
    : items.every(t => t.status === "completed")
      ? "completed"
      : "running"

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
  {@const going = live(item)}
  <details
    class="group/tool"
    open={open || going || opened.has(item.id)}
  >
    <summary
      in:wipe
      {@attach intent(item.id)}
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
      <span class={["min-w-0 truncate", going && "shimmer"]} title={item.title || item.kind}>
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
    {@render detail(item, going)}
  </details>
{/snippet}

{#snippet detail(item: ToolItem, going: boolean)}
    {#if item.detail}
      {@const big = wide.has(item.id)}
      {@const { json, rest } = splitJson(unfence(item.detail), going)}
      <pre
        in:slide={{ duration: 180, easing: cubicOut }}
        class={[
          "mt-1.5 overflow-auto border-s-2 bg-base-content/5 py-2.5 ps-3.5 pe-3",
          "font-mono text-xs leading-relaxed break-all whitespace-pre-wrap",
          going ? "border-primary/70" : "border-base-content/15",
          big ? "max-h-160" : "max-h-32",
        ]}
        {@attach follow(() => live(item), () => item.detail)}>{#each jsonTokens(json) as t, i (i)}<span class={TONES[t.kind]}>{t.text}</span>{/each}{json && rest ? GAP : ""}{rest}{#if going}<span class="caret"></span>{/if}</pre>
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
{/snippet}

{#snippet chain(items: ToolItem[])}
  {@const state = groupState(items)}
  <div
    class={[
      "flex min-w-0 flex-wrap items-center gap-1 text-xs",
      state === "failed" ? "text-error" : "text-base-content/70",
    ]}
  >
    {@render status(state)}
    <Icon icon={toolIcon(items[0].title, items[0].kind)} class="size-3.5 shrink-0 opacity-60" />
    <span class="font-medium">{verbWord(items[0])}</span>
    {#each items as item, i (item.id)}
      {#if i > 0}
        <Icon icon="lucide:chevron-right" class="size-3 shrink-0 opacity-40" />
      {/if}
      <button
        type="button"
        class={[
          "max-w-48 min-w-0 cursor-pointer truncate rounded-field px-1.5 py-0.5",
          "transition-colors duration-140",
          picked.has(item.id) ? "bg-primary/8 text-primary" : "bg-base-content/5 hover:bg-base-content/10",
          item.status === "failed" && "text-error",
          live(item) && "shimmer",
        ]}
        title={item.title}
        aria-pressed={picked.has(item.id)}
        onclick={() => {
          if (!picked.delete(item.id)) {
            picked.add(item.id)
          }
        }}
      >
        {targetOf(item)}
      </button>
    {/each}
  </div>
  {#each items.filter(t => picked.has(t.id) || live(t)) as item (item.id)}
    {@render detail(item, live(item))}
  {/each}
{/snippet}

{#if tools.length === 1 && !notes}
  <div class="my-1">
    {@render tool(tools[0], latest)}
  </div>
{:else if tools.length > 0 || notes}
  <details class="group/tools my-1" open={latest}>
    <summary
      in:wipe
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
      {#each rows as row (row.kind === "thought" ? row.item.id : row.id)}
        {#if row.kind === "thought"}
          {@const item = row.item}
          {#if item.text.trim()}
            <li
              in:wipe
              class={[
                "line-clamp-4 flex gap-1.5 text-xs",
                "text-base-content/50",
              ]}
            >
              <Icon icon="lucide:brain" class="mt-0.5 size-3.5 shrink-0" />
              <span>{plainText(item.text)}</span>
            </li>
          {/if}
        {:else if row.items.length === 1}
          <li>{@render tool(row.items[0])}</li>
        {:else}
          <li>{@render chain(row.items)}</li>
        {/if}
      {/each}
    </ul>
  </details>
{/if}
