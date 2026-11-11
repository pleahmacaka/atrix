<script lang="ts">
import Icon from "@iconify/svelte"
import { hostList } from "#lib/p2p/hosts.svelte.ts"
import type { HarnessInfo } from "#lib/p2p/protocol.ts"
import { m } from "#lib/paraglide/messages.js"
import { nav } from "#lib/store/nav.svelte.ts"
import { brandIcon } from "./brands.ts"

const hosts = $derived(hostList())

const active = (host: string, id: string) =>
  nav.harness?.host === host && nav.harness.id === id

const roots = (harnesses: HarnessInfo[]) => harnesses.filter(h => !h.profile)

const profilesOf = (harnesses: HarnessInfo[], base: string) =>
  harnesses.filter(h => h.profile && h.base === base)
</script>

{#snippet row(host: string, harness: HarnessInfo, label: string)}
  <button
    type="button"
    class={["min-w-0", active(host, harness.id) && "menu-active"]}
    onclick={() => {
      nav.harness = { host, id: harness.id }
    }}
  >
    <Icon
      icon={harness.profile ? "lucide:user-round" : brandIcon(harness.base)}
      class={["size-4 shrink-0", harness.enabled ? "opacity-70" : "opacity-30"]}
    />
    <span class={["min-w-0 flex-1 truncate", !harness.enabled && "opacity-50"]}>
      {label}
    </span>
    {#if !harness.enabled}
      <Icon
        icon="lucide:power-off"
        class="size-3.5 shrink-0 opacity-40"
        aria-label={m.harness_off()}
      />
    {/if}
    {#if !harness.kind}
      <Icon
        icon="lucide:lock"
        class="size-3.5 shrink-0 opacity-40"
        aria-label={m.harness_no_edit()}
      />
    {/if}
  </button>
{/snippet}

{#if hosts.length === 0}
  <div class="flex flex-col items-center gap-2 px-4 py-8 text-center text-sm text-base-content/50">
    <Icon icon="lucide:monitor-off" class="size-6" />
    {m.harness_no_desktop()}
  </div>
{:else}
  <ul class="menu w-full">
    {#each hosts as host (host.id)}
      <li>
        <h2 class="menu-title flex items-center gap-2">
          <Icon icon="lucide:monitor" class="size-4 shrink-0" />
          <span class="min-w-0 truncate">{host.name}</span>
        </h2>
        <ul>
          {#each roots(host.view.state?.harnesses ?? []) as harness (harness.id)}
            {@const profiles = profilesOf(host.view.state?.harnesses ?? [], harness.id)}
            <li>
              {@render row(host.id, harness, harness.name)}
              {#if profiles.length}
                <ul>
                  {#each profiles as profile (profile.id)}
                    <li>{@render row(host.id, profile, profile.profile ?? "")}</li>
                  {/each}
                </ul>
              {/if}
            </li>
          {/each}
        </ul>
      </li>
    {/each}
  </ul>
{/if}
