<script lang="ts">
import { homeDir, join } from "@tauri-apps/api/path"
import { z } from "zod"
import type { ChatItem } from "#lib/acp/items.ts"
import Popover from "#lib/components/ui/Popover.svelte"
import { native } from "#lib/native.ts"
import type { Limit, SessionView } from "#lib/p2p/protocol.ts"
import { m } from "#lib/paraglide/messages.js"
import { getLocale } from "#lib/paraglide/runtime.js"
import { desktop } from "#lib/platform.ts"

let { view, claude }: { view: SessionView; claude: boolean } = $props()

const CHARS_PER_TOKEN = 4

const usageWindow = z
  .object({
    used_percentage: z.number(),
    resets_at: z.union([z.string(), z.number()]).nullable().optional(),
  })
  .nullable()
  .optional()

const usageFile = z.object({ five_hour: usageWindow, seven_day: usageWindow }).loose()

let claudeLimits = $state<Limit[]>([])

const loadClaude = async () => {
  if (!desktop || !claude) {
    return
  }

  const path = await join(await homeDir(), ".claude", "eris-usage.json")
  const text = await native<string | null>("read_text", { path }).catch(() => null)
  const parsed = usageFile.safeParse(text ? JSON.parse(text) : null)

  if (!parsed.success) {
    return
  }

  const resetOf = (v: string | number | null | undefined) =>
    v === null || v === undefined ? null : typeof v === "number" ? v * 1000 : Date.parse(v)

  claudeLimits = [
    ["300m", parsed.data.five_hour],
    ["week", parsed.data.seven_day],
  ].flatMap(([id, w]) =>
    w && typeof w === "object"
      ? [{ id: id as string, percent: w.used_percentage, resetsAt: resetOf(w.resets_at) }]
      : [],
  )
}

let open = $state(false)

$effect(() => {
  if (open) {
    loadClaude()
  }
})

const limits = $derived(view.limits?.length ? view.limits : claudeLimits)

const context = $derived(view.context)

const percent = $derived(
  context ? Math.min(100, Math.round((context.used / context.size) * 100)) : 0,
)

type Part = { id: string; label: string; chars: number }

const categoryOf = (item: ChatItem) => {
  if (item.type === "user") {
    return "user"
  }

  if (item.type === "agent") {
    return "agent"
  }

  if (item.type === "thought") {
    return "thought"
  }

  if (item.type === "tool") {
    const title = item.title.toLowerCase()

    if (title.startsWith("skill")) {
      return "skill"
    }

    return title.startsWith("mcp__") ? "mcp" : "tool"
  }

  return "agent"
}

const sizeOf = (item: ChatItem) =>
  item.type === "tool"
    ? item.title.length + (item.detail?.length ?? 0)
    : "text" in item
      ? item.text.length
      : JSON.stringify(item).length

const LABELS: Record<string, () => string> = {
  user: m.context_user,
  agent: m.context_agent,
  thought: m.context_thought,
  tool: m.context_tool,
  skill: m.context_skill,
  mcp: m.context_mcp,
}

const parts = $derived.by((): Part[] => {
  const totals = new Map<string, number>(Object.entries(view.contextChars ?? {}))

  for (const item of view.contextChars ? [] : view.items.slice(view.contextFrom ?? 0)) {
    const id = categoryOf(item)

    totals.set(id, (totals.get(id) ?? 0) + sizeOf(item))
  }

  return [...totals]
    .map(([id, chars]) => ({ id, label: LABELS[id](), chars }))
    .toSorted((a, b) => b.chars - a.chars)
})

const estimated = $derived(
  parts.reduce((sum, p) => sum + Math.round(p.chars / CHARS_PER_TOKEN), 0),
)

const rows = $derived.by(() => {
  const used = context?.used ?? estimated
  const total = context?.size ?? used
  const base = Math.min(view.contextBase ?? 0, used)
  const chars = parts.reduce((sum, p) => sum + p.chars, 0)
  const spread = context ? used - base : estimated
  const listed = parts.map(p => ({
    id: p.id,
    label: p.label,
    tokens: chars ? Math.round((spread * p.chars) / chars) : 0,
  }))

  return [
    ...listed,
    ...(base > 0 ? [{ id: "system", label: m.context_system(), tokens: base }] : []),
  ].map(r => ({ ...r, share: total ? (r.tokens / total) * 100 : 0 }))
})

const TONES: Record<string, string> = {
  user: "bg-primary",
  agent: "bg-info",
  thought: "bg-secondary",
  tool: "bg-warning",
  skill: "bg-success",
  mcp: "bg-accent",
  system: "bg-base-content/30",
}

const compact = new Intl.NumberFormat(getLocale(), { notation: "compact" })

const when = new Intl.DateTimeFormat(getLocale(), {
  weekday: "short",
  hour: "numeric",
  minute: "2-digit",
})

const limitLabel = (limit: Limit) =>
  limit.id === "week"
    ? m.limit_week()
    : m.limit_hours({ hours: Math.round(Number.parseInt(limit.id, 10) / 60) })
</script>

<Popover
  label={m.context_title()}
  placement="top-end"
  width="w-80"
  bind:open
>
  {#snippet trigger(p)}
    <button
      {...p}
      type="button"
      class="btn btn-ghost btn-sm btn-square"
      aria-label={m.context_title()}
      title={context ? m.context_ring({ percent }) : m.context_title()}
    >
      <span
        class={[
          "radial-progress",
          percent >= 90 ? "text-error" : percent >= 70 ? "text-warning" : "text-primary",
        ]}
        style:--value={percent}
        style:--size="1.125rem"
        style:--thickness="0.1875rem"
        role="progressbar"
        aria-valuenow={percent}
      ></span>
    </button>
  {/snippet}
  <div class="flex flex-col gap-4 p-3 text-sm">
    {#if limits.length}
      <section class="flex flex-col gap-2">
        <h3 class="text-xs font-medium text-base-content/60">{m.context_limits()}</h3>
        {#each limits as limit (limit.id)}
          <div class="flex flex-col gap-1">
            <div class="flex items-baseline gap-2">
              <span class="min-w-0 flex-1 truncate">{limitLabel(limit)}</span>
              {#if limit.resetsAt}
                <span class="text-xs text-base-content/50">
                  {m.limit_resets({ at: when.format(limit.resetsAt) })}
                </span>
              {/if}
              <span class="text-xs tabular-nums">{Math.round(limit.percent)}%</span>
            </div>
            <progress
              class="progress progress-primary h-1.5"
              value={limit.percent}
              max="100"
            ></progress>
          </div>
        {/each}
      </section>
    {/if}
    <section class="flex flex-col gap-2">
      <div class="flex items-baseline gap-2">
        <h3 class="min-w-0 flex-1 text-xs font-medium text-base-content/60">
          {m.context_title()}
        </h3>
        {#if context}
          <span class="text-xs tabular-nums">
            {compact.format(context.used)} / {compact.format(context.size)} ({percent}%)
          </span>
        {/if}
      </div>
      {#if rows.length}
        <div class="flex h-2 overflow-hidden rounded-full bg-base-300">
          {#each rows as row (row.id)}
            <span class={TONES[row.id]} style:width="{row.share}%"></span>
          {/each}
        </div>
        <ul class="flex flex-col gap-1">
          {#each rows as row (row.id)}
            <li class="flex items-center gap-2 text-xs">
              <span class={["size-2 shrink-0 rounded-full", TONES[row.id]]}></span>
              <span class="min-w-0 flex-1 truncate">{row.label}</span>
              <span class="text-base-content/55 tabular-nums">{compact.format(row.tokens)}</span>
              <span class="w-10 text-right tabular-nums">{row.share.toFixed(1)}%</span>
            </li>
          {/each}
        </ul>
      {:else}
        <p class="text-xs text-base-content/50">{m.context_empty()}</p>
      {/if}
    </section>
  </div>
</Popover>
