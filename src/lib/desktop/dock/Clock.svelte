<script lang="ts">
  import type { ClockAlign } from "@atrix/settings"
  import { m } from "#lib/paraglide/messages.js"
  import { getLocale } from "#lib/paraglide/runtime.js"

  type Props = {
    clock24h: boolean
    showSeconds: boolean
    align?: ClockAlign
    active?: boolean
    compact?: boolean
    onclick: () => void
  }

  let {
    clock24h,
    showSeconds,
    align = "end",
    active = false,
    compact = false,
    onclick,
  }: Props = $props()

  const ALIGN: Record<ClockAlign, string> = {
    start: "items-start text-left",
    center: "items-center text-center",
    end: "items-end text-right",
  }

  const locale = getLocale()

  let now = $state(new Date())

  $effect(() => {
    const step = showSeconds ? 1_000 : 60_000
    let timer: ReturnType<typeof setTimeout> | undefined

    const tick = () => {
      now = new Date()
      timer = setTimeout(tick, step - (Date.now() % step))
    }

    tick()

    return () => clearTimeout(timer)
  })

  const time = $derived(
    now.toLocaleTimeString(locale, {
      hour: clock24h ? "2-digit" : "numeric",
      minute: "2-digit",
      second: showSeconds ? "2-digit" : undefined,
      hour12: !clock24h,
    }),
  )

  const date = $derived(
    now.toLocaleDateString(locale, {
      weekday: "short",
      month: "short",
      day: "numeric",
    }),
  )
</script>

<button
  type="button"
  class={[
    "btn btn-ghost h-auto min-h-0 gap-0 px-2.5 font-normal",
    "leading-tight tabular-nums",
    compact ? "flex-row-reverse gap-2 py-1" : ["flex-col py-1", ALIGN[align]],
    active && "bg-primary/8 text-primary",
  ]}
  title={m.dock_calendar()}
  aria-label={m.dock_open_calendar()}
  aria-pressed={active}
  {onclick}
>
  <span class="text-xs font-medium whitespace-nowrap">{time}</span>

  <span class={["text-xs whitespace-nowrap", !active && "text-base-content/60"]}>{date}</span>
</button>
