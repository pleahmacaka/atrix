<script lang="ts">
import Icon from "@iconify/svelte"
import type { Pace, Subagent } from "#lib/p2p/protocol.ts"
import { m } from "#lib/paraglide/messages.js"

let {
  since,
  tokens,
  pace,
  agents = [],
}: { since?: number; tokens?: number; pace?: Pace; agents?: Subagent[] } = $props()

const TICK_MS = 1000

let now = $state(Date.now())

$effect(() => {
  const timer = setInterval(() => {
    now = Date.now()
  }, TICK_MS)

  return () => clearInterval(timer)
})

const UNITS: [number, string][] = [
  [1e9, "B"],
  [1e6, "M"],
  [1e3, "k"],
]

const decimal = new Intl.NumberFormat("en", { maximumFractionDigits: 1 })

const compact = (n: number) => {
  const unit = UNITS.find(([size]) => n >= size)

  return unit ? `${decimal.format(n / unit[0])}${unit[1]}` : String(n)
}

const rateOf = (p?: Pace) =>
  p && p.ms > 0 && p.tokens > 0 ? decimal.format(p.tokens / (p.ms / 1000)) : null

const rate = $derived(rateOf(pace))

const span = (from: number) => {
  const total = Math.max(0, Math.floor((now - from) / 1000))

  return total < 60 ? `${total}s` : `${Math.floor(total / 60)}m ${total % 60}s`
}

const elapsed = $derived.by(() => {
  if (since === undefined) {
    return ""
  }

  const total = Math.max(0, Math.floor((now - since) / 1000))
  const minutes = Math.floor(total / 60)
  const seconds = total % 60

  return minutes > 0
    ? m.chat_elapsed_minutes({ minutes, seconds })
    : m.chat_elapsed_seconds({ seconds })
})
</script>

{#if agents.length > 0}
  <ul class="flex flex-col gap-1.5" aria-label={m.chat_subagents()}>
    {#each agents as agent (agent.id)}
      <li class="flex min-w-0 items-center gap-2 text-sm">
        <span class="loading loading-spinner loading-xs shrink-0 text-primary"></span>
        <Icon icon="lucide:bot" class="size-4 shrink-0 opacity-60" />
        <span class="min-w-0 shrink-0 truncate font-medium">{agent.description}</span>
        {#if agent.step}
          <span class="min-w-0 flex-1 truncate text-base-content/55" title={agent.step}>
            {agent.step}
          </span>
        {/if}
        <span class="ms-auto flex shrink-0 gap-2 text-xs text-base-content/45 tabular-nums">
          {#if agent.started}
            <span>{span(agent.started)}</span>
          {/if}
          {#if agent.pace}
            <span>{m.chat_tokens({ count: compact(agent.pace.tokens) })}</span>
            {#if rateOf(agent.pace)}
              <span>{m.chat_pace({ rate: rateOf(agent.pace) ?? "" })}</span>
            {/if}
          {/if}
        </span>
      </li>
    {/each}
  </ul>
{/if}
<div class="flex items-center gap-2 text-sm text-base-content/60 tabular-nums">
  <span class="loading loading-dots loading-sm"></span>
  {#if elapsed}
    <span>{elapsed}</span>
  {/if}
  {#if tokens}
    <span class="text-xs text-base-content/45">{m.chat_tokens({ count: compact(tokens) })}</span>
    {#if rate}
      <span class="text-xs text-base-content/45">{m.chat_pace({ rate })}</span>
    {/if}
  {/if}
</div>
