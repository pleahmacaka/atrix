<script lang="ts">
import Icon from "@iconify/svelte"
import EmptyState from "#lib/components/ui/EmptyState.svelte"
import { hostList } from "#lib/p2p/hosts.svelte.ts"
import type { HarnessInfo } from "#lib/p2p/protocol.ts"
import { m } from "#lib/paraglide/messages.js"
import { nav, openSettings } from "#lib/store/nav.svelte.ts"
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
    class={[
      "min-w-0",
      active(host, harness.id) && "bg-primary/8 text-primary",
    ]}
    aria-current={active(host, harness.id) ? "page" : undefined}
    onclick={() => {
      nav.harness = { host, id: harness.id }
    }}
  >
    <Icon
      icon={harness.profile ? "lucide:user-round" : brandIcon(harness.base)}
      class={[
        "size-4 shrink-0 fill-current",
        harness.enabled ? "opacity-70" : "opacity-30",
      ]}
    />
    <span class={["min-w-0 flex-1 truncate", !harness.enabled && "opacity-50"]}>
      {label}
    </span>
    {#if !harness.enabled}
      <Icon
        icon="lucide:power-off"
        class="size-4 shrink-0 opacity-40"
        aria-label={m.harness_off()}
      />
    {/if}
    {#if !harness.kind}
      <Icon
        icon="lucide:lock"
        class="size-4 shrink-0 opacity-40"
        aria-label={m.harness_no_edit()}
      />
    {/if}
  </button>
{/snippet}

{#if hosts.length === 0}
  <EmptyState icon="lucide:monitor-off" text={m.harness_no_desktop()} />
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
            {@const profiles = profilesOf(
              host.view.state?.harnesses ?? [],
              harness.id,
            )}
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
          {#if host.view.state?.available?.length}
            <li>
              <button
                type="button"
                class="min-w-0 text-base-content/70"
                onclick={() => openSettings("harness")}
              >
                <Icon icon="lucide:download" class="size-4 shrink-0" />
                <span class="min-w-0 flex-1 truncate">
                  {m.harness_install_more()}
                </span>
              </button>
            </li>
          {/if}
        </ul>
      </li>
    {/each}
  </ul>
{/if}
