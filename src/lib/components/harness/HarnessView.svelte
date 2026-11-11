<script lang="ts">
import Icon from "@iconify/svelte"
import { hostById, hostList } from "#lib/p2p/hosts.svelte.ts"
import { m } from "#lib/paraglide/messages.js"
import { nav } from "#lib/store/nav.svelte.ts"
import HarnessPage from "./HarnessPage.svelte"

let notice = $state<string | null>(null)

const current = $derived.by(() => {
  if (nav.harness && hostById(nav.harness.host)) {
    return nav.harness
  }

  const first = hostList().find(h => h.view.state?.harnesses.length)
  const harness = first?.view.state?.harnesses[0]

  return first && harness ? { host: first.id, id: harness.id } : null
})

const view = $derived(current ? hostById(current.host) : undefined)

$effect(() => {
  if (!nav.harness && current) {
    nav.harness = current
  }
})
</script>

<div class="flex min-h-0 flex-1 flex-col" data-find-root>
{#if current && view}
  {#if notice}
    <div class="mx-auto w-full max-w-5xl px-6 pb-2">
      <div role="status" class="alert alert-warning alert-soft text-sm">
        <Icon icon="lucide:triangle-alert" class="size-4" />
        {notice}
      </div>
    </div>
  {/if}
  {#key `${current.host}:${current.id}`}
    <HarnessPage
      host={view}
      harnessId={current.id}
      onSelect={(id, message) => {
        nav.harness = id ? { host: current.host, id } : null
        notice = message ?? null
      }}
    />
  {/key}
{:else}
  <div class="grid flex-1 place-items-center p-6 text-center">
    <div class="flex flex-col items-center gap-2 text-sm text-base-content/60">
      <Icon icon="lucide:monitor-off" class="size-8" />
      {m.harness_none_page()}
    </div>
  </div>
{/if}
</div>
