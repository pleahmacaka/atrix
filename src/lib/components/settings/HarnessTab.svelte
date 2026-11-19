<script lang="ts">
import Icon from "@iconify/svelte"
import { providerKindOf } from "#lib/acp/provider.ts"
import HarnessBrowser from "#lib/components/harness/browser/HarnessBrowser.svelte"
import HarnessPage from "#lib/components/harness/HarnessPage.svelte"
import { Attempt } from "#lib/components/ui/attempt.svelte.ts"
import ConfirmButton from "#lib/components/ui/ConfirmButton.svelte"
import EmptyState from "#lib/components/ui/EmptyState.svelte"
import ErrorAlert from "#lib/components/ui/ErrorAlert.svelte"
import IconButton from "#lib/components/ui/IconButton.svelte"
import Section from "#lib/components/ui/Section.svelte"
import SettingRow from "#lib/components/ui/SettingRow.svelte"
import { autoDetect } from "#lib/harness/autoDetect.ts"
import { copiesOf, onEveryCopy, profileKey } from "#lib/harness/profiles.ts"
import { type HostEntry, hostList, LOCAL } from "#lib/p2p/hosts.svelte.ts"
import { DEFAULT_PROVIDER, type HarnessInfo } from "#lib/p2p/protocol.ts"
import { m } from "#lib/paraglide/messages.js"
import { desktop } from "#lib/platform.ts"
import HarnessRow from "./HarnessRow.svelte"
import ProviderPicker from "./ProviderPicker.svelte"
import TokenCapRow from "./TokenCapRow.svelte"

const attempt = new Attempt()

$effect(autoDetect)

const hosts = $derived(hostList())

let busy = $state<string | null>(null)

let browsing = $state(false)

let selected = $state<{ host: HostEntry; id: string } | null>(null)

let notice = $state<string | null>(null)

const local = $derived(hosts.find(host => host.id === LOCAL))

const many = $derived(hosts.length > 1)

const rows = $derived.by(() => {
  const seen = new Set<string>()

  return hosts.flatMap(host =>
    (host.view.state?.harnesses ?? [])
      .filter(harness => {
        if (!harness.profile) {
          return true
        }

        const key = profileKey(harness)
        const fresh = !seen.has(key)

        seen.add(key)

        return fresh
      })
      .map(harness => ({ host, harness })),
  )
})

const working = (id: string, work: () => Promise<unknown>) =>
  attempt.run(async () => {
    busy = id

    try {
      await work()
    } finally {
      busy = null
    }
  })

const toggle = (host: HostEntry, harness: HarnessInfo) =>
  working(harness.id, () =>
    onEveryCopy(copiesOf(host.view, harness), (view, id) => view.toggle(id, !harness.enabled)),
  )

const open = (host: HostEntry, id: string) => {
  selected = { host, id }
  notice = null
}
</script>

{#if browsing}
  <HarnessBrowser onback={() => (browsing = false)} />
{:else if selected}
  {@const host = selected.host}
  {@const chosen = selected.id}
  {@const harness = host.view.state?.harnesses.find(candidate => candidate.id === chosen)}
  <div class="flex min-h-0 flex-col gap-2">
    <div>
      <IconButton icon="lucide:chevron-left" label={m.harness_back()} onclick={() => (selected = null)} />
    </div>
    {#if notice}
      <div role="status" class="alert alert-warning alert-soft text-sm">{notice}</div>
    {/if}
    {#if harness}
      {@const kind = providerKindOf(harness)}
      <HarnessPage
        host={host.view}
        harnessId={harness.id}
        onSelect={(id, message) => {
          selected = id ? { host, id } : null
          notice = message ?? null
        }}
      >
        {#snippet extra()}
          {#if harness.local && !harness.profile}
            <ConfirmButton
              label={m.harness_uninstall()}
              confirm={m.harness_uninstall_confirm()}
              disabled={busy !== null}
              class="btn-ghost btn-sm"
              onconfirm={() => {
                working(harness.id, () => host.view.uninstall(harness.id))
                selected = null
              }}
            />
          {/if}
        {/snippet}
        {#snippet top()}
          <div class="px-4 pb-4 sm:px-6">
            <div class="rounded-box border border-base-300 bg-base-100 px-4">
              <SettingRow icon="lucide:plug" title={m.harness_provider()}>
                {#if kind}
                  {#key `${host.id}:${harness.id}`}
                    <ProviderPicker
                      host={host.view}
                      harness={harness}
                      {kind}
                      run={work => working(harness.id, work)}
                      apply={choice =>
                        onEveryCopy(copiesOf(host.view, harness), (view, id) => view.setProvider(id, choice))}
                    />
                  {/key}
                {:else}
                  <span class="text-sm text-base-content/60">{m.harness_provider_unsupported()}</span>
                {/if}
              </SettingRow>
            </div>
          </div>
        {/snippet}
      </HarnessPage>
    {/if}
  </div>
{:else}
  <div class="flex flex-col gap-6">
    <button
      type="button"
      class={[
        "flex cursor-pointer items-center gap-3 rounded-box border border-base-300 bg-base-100 px-4 py-3",
        "text-start transition-colors duration-140 hover:bg-base-200",
      ]}
      onclick={() => (browsing = true)}
    >
      <Icon icon="lucide:store" class="size-5 shrink-0 text-primary" />
      <span class="min-w-0 flex-1 truncate text-sm font-medium">{m.harness_browser()}</span>
      <Icon icon="lucide:chevron-right" class="size-4 shrink-0 text-base-content/50" />
    </button>
    {#if local}
      <Section>
        <SettingRow title={m.harness_default_provider()}>
          {#key JSON.stringify(local.view.state?.defaultProvider ?? null)}
            <ProviderPicker
              host={local.view}
              run={work => working(DEFAULT_PROVIDER, work)}
              apply={choice => local.view.setProvider(DEFAULT_PROVIDER, choice)}
            />
          {/key}
        </SettingRow>
      </Section>
    {/if}
    <Section icon="lucide:bot" title={m.common_harnesses()}>
      {#snippet actions()}
        <IconButton
          icon="lucide:refresh-cw"
          label={m.harness_detect()}
          disabled={attempt.busy}
          onclick={() => attempt.run(() => Promise.all(hosts.map(host => host.view.detect(true))))}
        />
      {/snippet}
      {#each rows as { host, harness } (`${host.id}:${harness.id}`)}
        <HarnessRow
          {host}
          {harness}
          {many}
          disabled={busy === harness.id}
          onopen={() => open(host, harness.id)}
          ontoggle={() => toggle(host, harness)}
        />
      {:else}
        <EmptyState icon="lucide:search-x" text={m.harness_not_detected()} />
      {/each}
    </Section>
    {#if desktop}
      <Section icon="lucide:mails" title={m.mail_section()}>
        <TokenCapRow />
      </Section>
    {/if}
  </div>
  <ErrorAlert message={attempt.failure} />
{/if}