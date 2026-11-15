<script lang="ts">
import Icon from "@iconify/svelte"
import type { Subagent } from "#lib/p2p/protocol.ts"
import { m } from "#lib/paraglide/messages.js"

let {
  since,
  tokens,
  agents = [],
}: { since?: number; tokens?: number; agents?: Subagent[] } = $props()

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
          <span class="min-w-0 truncate text-base-content/55" title={agent.step}>
            {agent.step}
          </span>
        {/if}
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
    <span>{m.chat_tokens({ count: compact(tokens) })}</span>
  {/if}
</div>
