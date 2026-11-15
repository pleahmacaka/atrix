<script lang="ts">
import Icon from "@iconify/svelte"
import EmptyState from "#lib/components/ui/EmptyState.svelte"
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
      <div class="mx-auto w-full max-w-5xl px-4 pt-2 sm:px-6">
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
    <EmptyState
      centered
      icon="lucide:monitor-off"
      title={m.harness_none_page_title()}
      text={m.harness_none_page_text()}
    />
  {/if}
</div>
