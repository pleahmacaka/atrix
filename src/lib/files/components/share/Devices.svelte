<script lang="ts">
  import Icon from "@iconify/svelte"
  import { open } from "@tauri-apps/plugin-dialog"
  import EmptyState from "#lib/components/ui/EmptyState.svelte"
  import ErrorAlert from "#lib/components/ui/ErrorAlert.svelte"
  import IconButton from "#lib/components/ui/IconButton.svelte"
  import Section from "#lib/components/ui/Section.svelte"
  import Segmented from "#lib/components/ui/Segmented.svelte"
  import SettingRow from "#lib/components/ui/SettingRow.svelte"
  import { toast } from "#lib/files/store/toast.svelte.ts"
  import { m } from "#lib/paraglide/messages.js"
  import { openSettings } from "#lib/store/nav.svelte.ts"
  import BrowseAsks from "./BrowseAsks.svelte"
  import { shareError } from "./errors"
  import RemoteBrowser from "./RemoteBrowser.svelte"
  import { type Member, revokeBrowse, type Scope, setBrowseScope } from "./share"
  import { memberName, share } from "./share.svelte"

  const SCOPES: { id: Scope; label: string }[] = [
    { id: "drives", label: m.files_devices_scopes_drives() },
    { id: "home", label: m.files_devices_scopes_home() },
    { id: "folders", label: m.files_devices_scopes_folders() },
  ]

  let browsing = $state<Member | null>(null)

  const browse = $derived(share.state.browse)

  const report = (reason: unknown) => toast(shareError(reason), "error")

  const changeScope = (scope: Scope) =>
    setBrowseScope(scope, browse.folders).catch(report)

  const addFolder = async () => {
    const picked = await open({ directory: true }).catch(() => null)

    if (typeof picked === "string" && !browse.folders.includes(picked)) {
      await setBrowseScope("folders", [...browse.folders, picked]).catch(report)
    }
  }

  const removeFolder = (folder: string) =>
    setBrowseScope(
      browse.scope,
      browse.folders.filter(known => known !== folder),
    ).catch(report)

  export const back = () => {
    if (!browsing) {
      return false
    }

    browsing = null

    return true
  }
</script>

{#snippet pairAction()}
  <button
    type="button"
    class="btn btn-ghost btn-xs"
    onclick={() => openSettings("devices")}
  >
    <Icon icon="lucide:link" class="size-3.5" />
    {m.files_devices_pair()}
  </button>
{/snippet}

<div class="flex flex-col gap-6">
  {#if share.state.browseAsks.length > 0}
    <Section icon="lucide:bell-ring" title={m.files_devices_requests()}>
      <BrowseAsks />
    </Section>
  {/if}

  <Section
    icon="lucide:monitor-smartphone"
    title={m.files_devices_paired()}
    actions={pairAction}
  >
    {#if share.state.devices.length === 0}
      <EmptyState icon="lucide:wifi-off" text={m.files_devices_none()} />
    {:else}
      <ul class="-mx-2 flex flex-col py-2">
        {#each share.state.devices as device (device.id)}
          <li>
            <button
              type="button"
              class={[
                "flex min-h-11 w-full cursor-pointer items-center gap-3",
                "rounded-field px-2 text-left text-sm",
                "transition-colors duration-140 hover:bg-base-content/8",
              ]}
              title={m.files_devices_browse()}
              onclick={() => (browsing = device)}
            >
              <Icon
                icon="lucide:monitor-smartphone"
                class="size-4 shrink-0 text-base-content/60"
              />
              <span class="min-w-0 flex-1 truncate">{device.name}</span>
              <Icon
                icon="lucide:folder-search"
                class="size-4 shrink-0 text-base-content/60"
              />
            </button>
          </li>
        {/each}
      </ul>
    {/if}
  </Section>

  <Section>
    <SettingRow title={m.files_devices_browse_scope()}>
      <Segmented
        label={m.files_devices_browse_scope()}
        items={SCOPES}
        value={browse.scope}
        onpick={changeScope}
      />
    </SettingRow>

    {#if browse.scope === "folders"}
      <ul class="-mx-2 flex flex-col pb-3">
        {#each browse.folders as folder (folder)}
          <li class="flex min-h-11 items-center gap-3 px-2 text-sm">
            <Icon
              icon="lucide:folder"
              class="size-4 shrink-0 text-base-content/60"
            />
            <span class="min-w-0 flex-1 truncate" title={folder}>{folder}</span>
            <IconButton
              icon="lucide:x"
              label={m.files_devices_remove_folder()}
              class="shrink-0"
              onclick={() => removeFolder(folder)}
            />
          </li>
        {:else}
          <li class="px-2 py-2 text-sm text-base-content/60">
            {m.files_devices_no_folders()}
          </li>
        {/each}

        <li>
          <button
            type="button"
            class="btn btn-ghost btn-sm w-full justify-start"
            onclick={addFolder}
          >
            <Icon icon="lucide:folder-plus" class="size-4" />
            {m.files_devices_add_folder()}
          </button>
        </li>
      </ul>
    {/if}
  </Section>

  {#if browse.always.length > 0}
    <Section icon="lucide:shield-check" title={m.files_devices_allowed()}>
      <ul class="-mx-2 flex flex-col py-2">
        {#each browse.always as id (id)}
          {@const name = memberName(id)}

          <li class="flex min-h-11 items-center gap-3 px-2 text-sm">
            <Icon
              icon="lucide:monitor-smartphone"
              class="size-4 shrink-0 text-base-content/60"
            />
            <span class="min-w-0 flex-1 truncate" title={name}>{name}</span>
            <button
              type="button"
              class="btn btn-ghost btn-sm shrink-0"
              onclick={() => revokeBrowse(id).catch(report)}
            >
              {m.files_devices_revoke()}
            </button>
          </li>
        {/each}
      </ul>
    </Section>
  {/if}
</div>

<ErrorAlert message={share.problem && shareError(share.problem)} />

{#if browsing}
  <RemoteBrowser device={browsing} onclose={() => (browsing = null)} />
{/if}
