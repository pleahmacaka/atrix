<script lang="ts">
import Icon from "@iconify/svelte"
import { brandIcon } from "#lib/components/harness/brands.ts"
import HarnessBrowser from "#lib/components/harness/browser/HarnessBrowser.svelte"
import { Attempt } from "#lib/components/ui/attempt.svelte.ts"
import ConfirmButton from "#lib/components/ui/ConfirmButton.svelte"
import EmptyState from "#lib/components/ui/EmptyState.svelte"
import ErrorAlert from "#lib/components/ui/ErrorAlert.svelte"
import IconButton from "#lib/components/ui/IconButton.svelte"
import Section from "#lib/components/ui/Section.svelte"
import Segmented from "#lib/components/ui/Segmented.svelte"
import SettingRow from "#lib/components/ui/SettingRow.svelte"
import { autoDetect } from "#lib/harness/autoDetect.ts"
import { type HostEntry, hostList, LOCAL } from "#lib/p2p/hosts.svelte.ts"
import type { HarnessInfo } from "#lib/p2p/protocol.ts"
import { m } from "#lib/paraglide/messages.js"
import { getLocale } from "#lib/paraglide/runtime.js"
import { desktop } from "#lib/platform.ts"
import { settings } from "#lib/store/settings.svelte.ts"
import ProviderPicker from "./ProviderPicker.svelte"

const compact = new Intl.NumberFormat(getLocale(), { notation: "compact" })

const CAPS = [0, 100_000, 300_000, 1_000_000].map(cap => ({
  id: String(cap),
  label: cap ? compact.format(cap) : m.mail_token_cap_off(),
  icon: cap ? "lucide:gauge" : "lucide:infinity",
}))

const attempt = new Attempt()

$effect(autoDetect)

const hosts = $derived(hostList())

let busy = $state<string | null>(null)

let browsing = $state(false)

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
  working(harness.id, () => host.view.toggle(harness.id, !harness.enabled))
</script>

{#if browsing}
  <HarnessBrowser onback={() => (browsing = false)} />
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
  {#each hosts as host (host.id)}
    <Section icon="lucide:monitor" title={host.name}>
      {#snippet actions()}
        <IconButton
          icon="lucide:refresh-cw"
          label={m.harness_detect()}
          disabled={attempt.busy}
          onclick={() => attempt.run(() => host.view.detect(true))}
        />
      {/snippet}
      {#each host.view.state?.harnesses ?? [] as h (h.id)}
        <SettingRow icon={brandIcon(h.base)} title={h.name}>
          {#if h.kind && host.id === LOCAL}
            <ProviderPicker host={host.view} harness={h} kind={h.kind} run={work => working(h.id, work)} />
          {/if}
          {#if h.local}
            <ConfirmButton
              label={m.harness_uninstall()}
              confirm={m.harness_uninstall_confirm()}
              disabled={busy !== null}
              class="btn-ghost btn-sm"
              onconfirm={() => uninstall(host, h)}
            />
          {/if}
          <input
            type="checkbox"
            class="toggle toggle-sm toggle-primary"
            aria-label={m.harness_use({ name: h.name })}
            checked={h.enabled}
            disabled={busy === h.id}
            onchange={() => toggle(host, h)}
          />
        </SettingRow>
      {:else}
        <EmptyState icon="lucide:search-x" text={m.harness_not_detected()} />
      {/each}
    </Section>
  {:else}
    <EmptyState
      icon="lucide:monitor-off"
      title={m.harness_no_hosts_title()}
      text={m.harness_no_hosts_text()}
    />
  {/each}
  {#if desktop}
    <Section icon="lucide:mails" title={m.mail_section()}>
      <SettingRow icon="lucide:gauge" title={m.mail_token_cap()}>
        <Segmented
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
