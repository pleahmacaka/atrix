<script lang="ts">
  import Icon from "@iconify/svelte"
  import Popover, { type Placement } from "#lib/components/ui/Popover.svelte"
  import { http } from "#lib/desktop/http.js"
  import { type ClaudeUsage, claudeUsage, type UsageWindow } from "#lib/desktop/native/index.js"
  import { m } from "#lib/paraglide/messages.js"
  import { getLocale } from "#lib/paraglide/runtime.js"
  import { dockAwake } from "./dock.svelte"

  type Props = {
    source?: string
    compact?: boolean
    stacked?: boolean
    placement: Placement
  }

  let { source = "", compact = false, stacked = false, placement }: Props = $props()

  const REMOTE_POLL = 60_000
  const LOCAL_POLL = 2_000

  const TONES = [
    { from: 90, bar: "bg-error", progress: "progress-error" },
    { from: 70, bar: "bg-warning", progress: "progress-warning" },
    { from: 0, bar: "bg-primary", progress: "progress-primary" },
  ]

  const when = new Intl.DateTimeFormat(getLocale(), {
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
  })

  let usage = $state<ClaudeUsage | null>(null)
  let seq = 0

  const remote = $derived(source.trim().startsWith("http"))

  const refresh = async () => {
    const ticket = ++seq

    const next = remote
      ? await http
          .get<ClaudeUsage>(source.trim())
          .then(response => response.data)
          .catch(() => null)
      : await claudeUsage(source.trim() || null).catch(() => null)

    if (ticket === seq) {
      usage = next
    }
  }

  $effect(() => {
    if (!dockAwake.visible) {
      return
    }

    refresh()

    const timer = setInterval(refresh, remote ? REMOTE_POLL : LOCAL_POLL)

    return () => clearInterval(timer)
  })

  const percent = (value: number) => Math.max(0, Math.min(100, Math.round(value)))

  const toneOf = (value: number) =>
    TONES.find(tone => percent(value) >= tone.from) ?? TONES[2]

  const windows = $derived(
    [
      { id: "five", short: m.dock_usage_five_short(), label: m.limit_hours({ hours: 5 }), window: usage?.fiveHour },
      { id: "week", short: m.dock_usage_week_short(), label: m.limit_week(), window: usage?.sevenDay },
    ].filter((entry): entry is typeof entry & { window: UsageWindow } => Boolean(entry.window)),
  )

  const title = $derived(
    windows
      .map(entry => m.dock_usage_entry({ label: entry.label, percent: percent(entry.window.used) }))
      .join(", "),
  )

  const resets = (iso: string | null) => {
    const at = iso ? new Date(iso) : null

    return at && Number.isFinite(at.getTime()) ? m.limit_resets({ at: when.format(at) }) : ""
  }
</script>

{#if windows.length > 0}
  <Popover label={m.context_limits()} {placement} width="w-72">
    {#snippet trigger(p)}
      <button
        {...p}
        type="button"
        class={["btn btn-ghost gap-1.5 px-2 font-normal", compact ? "btn-xs" : "btn-sm"]}
        aria-label={m.context_limits()}
        {title}
      >
        <Icon icon="simple-icons:claude" class="size-3.5 shrink-0 text-primary" />

        <span class={["flex", stacked ? "flex-col gap-1" : "items-center gap-2"]}>
          {#each windows as entry (entry.id)}
            <span class="flex items-center gap-1">
              {#if !compact}
                <span class="text-xs text-base-content/60">{entry.short}</span>
              {/if}

              <span class="h-1 w-8 overflow-hidden rounded-full bg-base-300">
                <span
                  class={["block h-full rounded-full", toneOf(entry.window.used).bar]}
                  style:width="{percent(entry.window.used)}%"
                ></span>
              </span>

              {#if !compact && !stacked}
                <span class="w-8 text-right text-xs tabular-nums">{percent(entry.window.used)}%</span>
              {/if}
            </span>
          {/each}
        </span>
      </button>
    {/snippet}

    <section class="flex flex-col gap-3 p-3">
      <h3 class="text-xs font-medium text-base-content/60">{m.context_limits()}</h3>

      {#each windows as entry (entry.id)}
        <div class="flex flex-col gap-1">
          <div class="flex items-baseline gap-2">
            <span class="min-w-0 flex-1 truncate">{entry.label}</span>

            <span class="text-xs whitespace-nowrap text-base-content/50">
              {resets(entry.window.resetsAt)}
            </span>

            <span class="w-9 text-right text-xs tabular-nums">{percent(entry.window.used)}%</span>
          </div>

          <progress
            class={["progress h-1.5", toneOf(entry.window.used).progress]}
            value={percent(entry.window.used)}
            max="100"
          ></progress>
        </div>
      {/each}
    </section>
  </Popover>
{/if}
