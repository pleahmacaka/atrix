<script lang="ts">
import Icon from "@iconify/svelte"
import { providerKindOf } from "#lib/acp/provider.ts"
import { brandIcon } from "#lib/components/harness/brands.ts"
import HarnessBrowser from "#lib/components/harness/browser/HarnessBrowser.svelte"
import HarnessPage from "#lib/components/harness/HarnessPage.svelte"
import { Attempt } from "#lib/components/ui/attempt.svelte.ts"
import ConfirmButton from "#lib/components/ui/ConfirmButton.svelte"
import EmptyState from "#lib/components/ui/EmptyState.svelte"
import ErrorAlert from "#lib/components/ui/ErrorAlert.svelte"
import IconButton from "#lib/components/ui/IconButton.svelte"
import Section from "#lib/components/ui/Section.svelte"
import Segmented from "#lib/components/ui/Segmented.svelte"
import SettingRow from "#lib/components/ui/SettingRow.svelte"
import { autoDetect } from "#lib/harness/autoDetect.ts"
import { copiesOf, onEveryCopy, profileKey } from "#lib/harness/profiles.ts"
import { type HostEntry, hostList, LOCAL } from "#lib/p2p/hosts.svelte.ts"
import { DEFAULT_PROVIDER, type HarnessInfo } from "#lib/p2p/protocol.ts"
import { m } from "#lib/paraglide/messages.js"
import { getLocale } from "#lib/paraglide/runtime.js"
import { desktop } from "#lib/platform.ts"
import { settings } from "#lib/store/settings.svelte.ts"
import ProviderPicker from "./ProviderPicker.svelte"

const compact = new Intl.NumberFormat(getLocale(), { notation: "compact" })

const CAPS = [0, 100_000, 300_000, 1_000_000].map(cap => ({
  id: String(cap),
  label: cap ? compact.format(cap) : m.mail_token_cap_off(),
}))

const attempt = new Attempt()

$effect(autoDetect)

const hosts = $derived(hostList())

let busy = $state<string | null>(null)

let browsing = $state(false)

let selected = $state<{ host: HostEntry; id: string } | null>(null)

let notice = $state<string | null>(null)

const local = $derived(hosts.find(h => h.id === LOCAL))

const many = $derived(hosts.length > 1)

const rows = $derived.by(() => {
  const all = hosts.flatMap(host =>
    (host.view.state?.harnesses ?? []).map(h => ({ host, h })),
  )
  const seen = new Set<string>()

  return all.filter(({ h }) => {
    if (!h.profile) {
      return true
    }

    const key = profileKey(h)
    const fresh = !seen.has(key)

    seen.add(key)

    return fresh
  })
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

const uninstall = (host: HostEntry, harness: HarnessInfo) =>
  working(harness.id, () => host.view.uninstall(harness.id))

const toggle = (host: HostEntry, harness: HarnessInfo) =>
  working(harness.id, () =>
    onEveryCopy(copiesOf(host.view, harness), (view, id) =>
      view.toggle(id, !harness.enabled),
    ),
  )
</script>

{#if browsing}
  <HarnessBrowser onback={() => (browsing = false)} />
{:else if selected}
  {@const sel = selected}
  {@const h = sel.host.view.state?.harnesses.find(x => x.id === sel.id)}
  <div class="flex min-h-0 flex-col gap-2">
    <div>
      <IconButton icon="lucide:chevron-left" label={m.harness_back()} onclick={() => (selected = null)} />
    </div>
    {#if notice}
      <div role="status" class="alert alert-warning alert-soft text-sm">{notice}</div>
    {/if}
    {#if h}
      {@const kind = providerKindOf(h)}
      <HarnessPage
        host={sel.host.view}
        harnessId={h.id}
        onSelect={(id, message) => {
          selected = id ? { host: sel.host, id } : null
          notice = message ?? null
        }}
      >
        {#snippet extra()}
          {#if h.local && !h.profile}
            <ConfirmButton
              label={m.harness_uninstall()}
              confirm={m.harness_uninstall_confirm()}
              disabled={busy !== null}
              class="btn-ghost btn-sm"
              onconfirm={() => {
                uninstall(sel.host, h)
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
                  {#key `${sel.host.id}:${h.id}`}
                    <ProviderPicker
                      host={sel.host.view}
                      harness={h}
                      {kind}
                      run={work => working(h.id, work)}
                      apply={choice =>
                        onEveryCopy(copiesOf(sel.host.view, h), (view, id) => view.setProvider(id, choice))}
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
        onclick={() => attempt.run(() => Promise.all(hosts.map(x => x.view.detect(true))))}
      />
    {/snippet}
    {#each rows as { host, h } (`${host.id}:${h.id}`)}
      <div class="flex min-w-0 items-center gap-2">
        <button
          type="button"
          class={[
            "flex min-h-12 min-w-0 flex-1 cursor-pointer items-center gap-3 rounded-field px-2 text-start",
            "transition-colors duration-140 hover:bg-base-content/5",
          ]}
          onclick={() => {
            selected = { host, id: h.id }
            notice = null
          }}
        >
          <Icon icon={brandIcon(h.base)} class="size-5 shrink-0" />
          <span class="min-w-0 truncate text-sm font-medium">{h.name}</span>
          {#if many && host.id !== LOCAL}
            <span class="max-w-24 shrink-0 truncate text-xs text-base-content/45" title={host.name}>{host.name}</span>
          {/if}
          <span class="flex-1"></span>
          {#if h.providerModel}
            <span class="max-w-40 min-w-0 truncate text-xs text-base-content/45" title={h.providerModel}>
              {h.providerModel}
            </span>
          {/if}
          <Icon icon="lucide:chevron-right" class="size-4 shrink-0 text-base-content/40" />
        </button>
        <input
          type="checkbox"
          class="toggle toggle-sm toggle-primary shrink-0"
          aria-label={m.harness_use({ name: h.name })}
          checked={h.enabled}
          disabled={busy === h.id}
          onchange={() => toggle(host, h)}
        />
      </div>
    {:else}
      <EmptyState icon="lucide:search-x" text={m.harness_not_detected()} />
    {/each}
  </Section>
  {#if desktop}
    <Section icon="lucide:mails" title={m.mail_section()}>
      <SettingRow title={m.mail_token_cap()}>
        <Segmented
          label={m.mail_token_cap()}
          items={CAPS}
          value={String(settings.mailTokenCap)}
          onpick={id => settings.setMailTokenCap(Number(id))}
        />
      </SettingRow>
    </Section>
  {/if}
</div>
<ErrorAlert message={attempt.failure} />
{/if}
