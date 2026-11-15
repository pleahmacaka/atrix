<script lang="ts">
import Icon from "@iconify/svelte"
import { brandIcon } from "#lib/components/harness/brands.ts"
import { Attempt } from "#lib/components/ui/attempt.svelte.ts"
import ConfirmButton from "#lib/components/ui/ConfirmButton.svelte"
import CopyButton from "#lib/components/ui/CopyButton.svelte"
import EmptyState from "#lib/components/ui/EmptyState.svelte"
import ErrorAlert from "#lib/components/ui/ErrorAlert.svelte"
import IconButton from "#lib/components/ui/IconButton.svelte"
import MenuItem from "#lib/components/ui/MenuItem.svelte"
import Popover from "#lib/components/ui/Popover.svelte"
import Section from "#lib/components/ui/Section.svelte"
import Segmented from "#lib/components/ui/Segmented.svelte"
import SettingRow from "#lib/components/ui/SettingRow.svelte"
import { type HostEntry, hostList } from "#lib/p2p/hosts.svelte.ts"
import type {
  Available,
  HarnessInfo,
  InstallScope,
} from "#lib/p2p/protocol.ts"
import { m } from "#lib/paraglide/messages.js"
import { getLocale } from "#lib/paraglide/runtime.js"
import { desktop } from "#lib/platform.ts"
import { settings } from "#lib/store/settings.svelte.ts"

const compact = new Intl.NumberFormat(getLocale(), { notation: "compact" })

const CAPS = [0, 100_000, 300_000, 1_000_000].map(cap => ({
  id: String(cap),
  label: cap ? compact.format(cap) : m.mail_token_cap_off(),
  icon: cap ? "lucide:gauge" : "lucide:infinity",
}))

const attempt = new Attempt()

const hosts = $derived(hostList())

let busy = $state<string | null>(null)

let done = $state<{
  host: string
  name: string
  login: string | null
  pathHint: string | null
} | null>(null)

const SCOPES: { id: InstallScope; label: () => string; icon: string }[] = [
  { id: "atrix", label: m.harness_install_atrix, icon: "lucide:package" },
  { id: "global", label: m.harness_install_global, icon: "lucide:globe" },
]

const working = (id: string, work: () => Promise<unknown>) =>
  attempt.run(async () => {
    busy = id

    try {
      await work()
    } finally {
      busy = null
    }
  })

const install = (host: HostEntry, harness: Available, scope: InstallScope) => {
  done = null

  return working(harness.id, async () => {
    const { pathHint } = await host.view.install(harness.id, scope)
    const login =
      host.view.state?.harnesses.find(h => h.id === harness.id)?.login ?? null

    done = { host: host.id, name: harness.name, login, pathHint }
  })
}

const uninstall = (host: HostEntry, harness: HarnessInfo) =>
  working(harness.id, () => host.view.uninstall(harness.id))

const toggle = (host: HostEntry, harness: HarnessInfo) =>
  working(harness.id, () => host.view.toggle(harness.id, !harness.enabled))

const missing = (available: Available[], requires: Available["requires"]) =>
  available.some(a => a.requires === requires)
</script>

<div class="flex flex-col gap-6">
  {#each hosts as host (host.id)}
    <Section icon="lucide:monitor" title={host.name}>
      {#snippet actions()}
        <IconButton
          icon="lucide:refresh-cw"
          label={m.harness_detect()}
          disabled={attempt.busy}
          onclick={() => attempt.run(host.view.detect)}
        />
      {/snippet}
      {#each host.view.state?.harnesses ?? [] as h (h.id)}
        <SettingRow icon={brandIcon(h.base)} title={h.name}>
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
    {@const available = host.view.state?.available ?? []}
    {#if done?.host === host.id}
      <div role="status" class="alert alert-info alert-soft text-sm">
        <Icon icon="lucide:circle-check" class="size-4 self-start" />
        <div class="flex min-w-0 flex-col gap-2">
          <p>{m.harness_installed({ name: done.name })}</p>
          {#if done.login}
            <p>{m.harness_login_hint()}</p>
            {@render command(done.login)}
          {/if}
          {#if done.pathHint}
            <p>{m.harness_path_hint()}</p>
            {@render command(done.pathHint)}
          {/if}
        </div>
      </div>
    {/if}
    {#if available.length}
      <Section icon="lucide:download" title={m.harness_available()}>
        {#if missing(available, "node")}
          <p class="py-2 text-sm text-base-content/60">
            {m.harness_requires_node_hint()}
          </p>
        {/if}
        {#if missing(available, "uv")}
          <p class="py-2 text-sm text-base-content/60">
            {m.harness_requires_uv_hint()}
          </p>
        {/if}
        {#each available as a (a.id)}
          <SettingRow icon={brandIcon(a.id)} title={a.name}>
            {#if busy === a.id}
              <span class="loading loading-spinner loading-sm"></span>
              <span
                class="min-w-0 max-w-64 truncate text-xs text-base-content/60"
                title={host.view.installLog[a.id]}
              >
                {host.view.installLog[a.id] ?? m.harness_installing()}
              </span>
            {:else if a.requires}
              <span class="badge badge-ghost badge-sm">
                {a.requires === "node"
                  ? m.harness_requires_node()
                  : m.harness_requires_uv()}
              </span>
            {:else}
              <Popover label={m.harness_install()} placement="bottom-end" width="w-48">
                {#snippet trigger(p)}
                  <button {...p} type="button" class="btn btn-sm" disabled={busy !== null}>
                    <Icon icon="lucide:download" class="size-4" />
                    {m.harness_install()}
                  </button>
                {/snippet}
                <div role="menu" class="flex flex-col">
                  {#each SCOPES as scope (scope.id)}
                    <MenuItem
                      icon={scope.icon}
                      label={scope.label()}
                      onclick={() => install(host, a, scope.id)}
                    />
                  {/each}
                </div>
              </Popover>
            {/if}
          </SettingRow>
        {/each}
      </Section>
    {/if}
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

{#snippet command(text: string)}
  <div class="flex min-w-0 items-center gap-1 rounded-field bg-base-200 px-2 py-1">
    <code class="min-w-0 flex-1 break-all text-xs">{text}</code>
    <CopyButton {text} />
  </div>
{/snippet}
