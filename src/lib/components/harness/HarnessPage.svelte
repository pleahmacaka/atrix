<script lang="ts">
import Icon from "@iconify/svelte"
import type { Snippet } from "svelte"
import { Attempt } from "#lib/components/ui/attempt.svelte.ts"
import ConfirmButton from "#lib/components/ui/ConfirmButton.svelte"
import CopyButton from "#lib/components/ui/CopyButton.svelte"
import ErrorAlert from "#lib/components/ui/ErrorAlert.svelte"
import PageHeader from "#lib/components/ui/PageHeader.svelte"
import { removeProfileEverywhere } from "#lib/harness/profiles.ts"
import type { HostView } from "#lib/p2p/hostView.svelte.ts"
import { m } from "#lib/paraglide/messages.js"
import { brandIcon } from "./brands.ts"

let {
  host,
  harnessId,
  onSelect,
  top,
  extra,
}: {
  host: HostView
  harnessId: string
  onSelect: (id: string | null) => void
  top?: Snippet
  extra?: Snippet
} = $props()

const attempt = new Attempt()

const harness = $derived(host.state?.harnesses.find(h => h.id === harnessId) ?? null)

const listing = $derived(host.state?.available.find(a => a.id === harness?.base))

const removeProfile = () =>
  attempt.run(async () => {
    if (harness) {
      await removeProfileEverywhere(harness)
      onSelect(null)
    }
  })
</script>

{#if harness}
  <div class="mx-auto flex min-h-0 w-full max-w-5xl flex-1 flex-col">
    <PageHeader icon={brandIcon(harness.base)} title={harness.profile ?? harness.name}>
      {#snippet actions()}
        <span class="flex items-center gap-1 text-xs whitespace-nowrap text-base-content/55 max-sm:hidden">
          <Icon icon={harness.profile ? "lucide:git-fork" : "lucide:globe"} class="size-3" />
          {harness.profile ? m.harness_profile() : m.harness_global()}
        </span>
        {#if harness.profile}
          <ConfirmButton
            label={m.harness_delete_profile()}
            disabled={attempt.busy}
            onconfirm={removeProfile}
          />
        {/if}
        {@render extra?.()}
      {/snippet}
    </PageHeader>
    {@render top?.()}
    <div class="flex flex-col gap-3 px-4 pb-6 sm:px-6">
      {#if listing?.description}
        <p class="text-sm text-base-content/70">{listing.description}</p>
      {/if}
      {#if harness.login}
        <div class="flex flex-col gap-1">
          <span class="text-xs font-medium text-base-content/60">{m.harness_login_hint()}</span>
          <div class="flex min-w-0 items-center gap-1 rounded-field border border-base-300 bg-base-300/50 px-2 py-1">
            <code class="min-w-0 flex-1 text-xs break-all">{harness.login}</code>
            <CopyButton text={harness.login} />
          </div>
        </div>
      {/if}
      <ErrorAlert message={attempt.failure} />
    </div>
  </div>
{/if}
