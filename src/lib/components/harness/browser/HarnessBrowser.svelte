<script lang="ts">
import Icon from "@iconify/svelte"
import { brandIcon } from "#lib/components/harness/brands.ts"
import { Attempt } from "#lib/components/ui/attempt.svelte.ts"
import CopyButton from "#lib/components/ui/CopyButton.svelte"
import EmptyState from "#lib/components/ui/EmptyState.svelte"
import ErrorAlert from "#lib/components/ui/ErrorAlert.svelte"
import IconButton from "#lib/components/ui/IconButton.svelte"
import IconInput from "#lib/components/ui/IconInput.svelte"
import Section from "#lib/components/ui/Section.svelte"
import SettingRow from "#lib/components/ui/SettingRow.svelte"
import { type HostEntry, hostList } from "#lib/p2p/hosts.svelte.ts"
import type { Available, InstallScope } from "#lib/p2p/protocol.ts"
import { m } from "#lib/paraglide/messages.js"

let { onback }: { onback: () => void } = $props()

const attempt = new Attempt()

const hosts = $derived(hostList())

let query = $state("")

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

const matching = (available: Available[]) => {
  const needle = query.trim().toLowerCase()

  return needle
    ? available.filter(a =>
        [a.id, a.name].some(v => v.toLowerCase().includes(needle)),
      )
    : available
}

const missing = (available: Available[], requires: Available["requires"]) =>
  available.some(a => a.requires === requires)

const install = (host: HostEntry, harness: Available, scope: InstallScope) => {
  done = null

  return attempt.run(async () => {
    busy = harness.id

    try {
      const { pathHint } = await host.view.install(harness.id, scope)
      const login =
        host.view.state?.harnesses.find(h => h.id === harness.id)?.login ?? null

      done = { host: host.id, name: harness.name, login, pathHint }
    } finally {
      busy = null
    }
  })
}
</script>

<div class="flex flex-col gap-6">
  <div class="flex items-center gap-2">
    <IconButton icon="lucide:chevron-left" label={m.harness_back()} onclick={onback} />
    <IconInput
      icon="lucide:search"
      label={m.harness_search()}
      placeholder={m.harness_search()}
      type="search"
      ghost={false}
      class="min-w-0 flex-1"
      bind:value={query}
    />
  </div>

  {#each hosts as host (host.id)}
    {@const available = host.view.state?.available ?? []}
    {@const shown = matching(available)}
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
    <Section icon="lucide:download" title={hosts.length > 1 ? host.name : m.harness_available()}>
      {#if missing(available, "node")}
        <p class="py-2 text-sm text-base-content/60">{m.harness_requires_node_hint()}</p>
      {/if}
      {#if missing(available, "uv")}
        <p class="py-2 text-sm text-base-content/60">{m.harness_requires_uv_hint()}</p>
      {/if}
      {#each shown as a (a.id)}
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
              {a.requires === "node" ? m.harness_requires_node() : m.harness_requires_uv()}
            </span>
          {:else}
            <div class="flex items-center justify-end gap-1">
              {#each SCOPES as scope (scope.id)}
                <button
                  type="button"
                  class="btn btn-sm"
                  disabled={busy !== null}
                  onclick={() => install(host, a, scope.id)}
                >
                  <Icon icon={scope.icon} class="size-4" />
                  {scope.label()}
                </button>
              {/each}
            </div>
          {/if}
        </SettingRow>
      {:else}
        <EmptyState icon="lucide:search-x" text={m.harness_no_match()} />
      {/each}
    </Section>
  {:else}
    <EmptyState
      icon="lucide:monitor-off"
      title={m.harness_no_hosts_title()}
      text={m.harness_no_hosts_text()}
    />
  {/each}
</div>
<ErrorAlert message={attempt.failure} />

{#snippet command(text: string)}
  <div class="flex min-w-0 items-center gap-1 rounded-field bg-base-200 px-2 py-1">
    <code class="min-w-0 flex-1 break-all text-xs">{text}</code>
    <CopyButton {text} />
  </div>
{/snippet}
