<script lang="ts">
  import Icon from "@iconify/svelte"
  import EmptyState from "#lib/components/ui/EmptyState.svelte"
  import IconButton from "#lib/components/ui/IconButton.svelte"
  import Modal from "#lib/components/ui/Modal.svelte"
  import { toast } from "#lib/files/store/toast.svelte.ts"
  import { m } from "#lib/paraglide/messages.js"
  import { platform } from "#lib/platform.ts"
  import { currentLocale } from "#lib/store/locale.ts"
  import { formatBytes } from "../../format"
  import { openItem } from "../../native"
  import { openFile } from "../mobile/mobile"
  import { browseDevice, fetchRemote, type Member, type RemoteEntry } from "./share"

  const POLL = 2_000
  const WAIT_LIMIT = 120_000
  const FETCH_LIMIT = 600_000

  type Crumb = { name: string; path: string | null }

  type Status = "loading" | "waiting" | "denied" | "failed" | "ready"

  const STATES: Record<"denied" | "failed", { icon: string; text: () => string }> = {
    denied: { icon: "lucide:shield-x", text: m.files_remote_states_denied },
    failed: { icon: "lucide:wifi-off", text: m.files_remote_states_failed },
  }

  let { device, onclose }: { device: Member; onclose: () => void } = $props()

  let crumbs = $state<Crumb[]>([])
  let entries = $state<RemoteEntry[]>([])
  let status = $state<Status>("loading")
  let opening = $state<string | null>(null)
  let token = 0

  const locale = $derived(currentLocale())

  const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

  const reveal = (path: string) => (platform === "android" ? openFile(path) : openItem(path))

  const load = async (path: string | null) => {
    const mine = ++token
    const started = Date.now()

    status = "loading"

    while (mine === token) {
      try {
        const result = await browseDevice(device.id, path)

        if (mine !== token) {
          return
        }

        if (result.kind === "listing") {
          entries = result.entries
          status = "ready"

          return
        }

        if (result.kind === "denied") {
          status = "denied"

          return
        }

        status = "waiting"
      } catch {
        if (mine === token) {
          status = "failed"
        }

        return
      }

      if (Date.now() - started > WAIT_LIMIT) {
        status = "failed"

        return
      }

      await sleep(POLL)
    }
  }

  const go = (index: number) => {
    crumbs = crumbs.slice(0, index + 1)
    load(crumbs[index].path)
  }

  const enter = (entry: RemoteEntry) => {
    crumbs = [...crumbs, { name: entry.name, path: entry.path }]
    load(entry.path)
  }

  const open = async (entry: RemoteEntry) => {
    const started = Date.now()

    opening = entry.path

    try {
      let saved = await fetchRemote(device.id, entry.path)

      while (saved === null) {
        if (Date.now() - started > FETCH_LIMIT) {
          throw new Error("timeout")
        }

        await sleep(POLL)
        saved = await fetchRemote(device.id, entry.path)
      }

      toast(m.files_remote_saved(), "success")
      await reveal(saved).catch(() => undefined)
    } catch {
      toast(m.files_remote_failed(), "error")
    } finally {
      opening = null
    }
  }

  $effect(() => {
    crumbs = [{ name: device.name, path: null }]
    load(null)

    return () => {
      token += 1
    }
  })
</script>

<Modal
  bind:open={
    () => true,
    next => {
      if (!next) {
        onclose()
      }
    }
  }
  label={m.files_devices_browse()}
  class="w-full max-w-lg"
>
  <header class="flex h-12 shrink-0 items-center gap-1 px-3">
    <Icon icon="lucide:folder-search" class="mx-1 size-4 shrink-0 text-base-content/60" />

    <nav
      class="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto scrollbar-none"
      aria-label={m.files_remote_location()}
    >
      {#each crumbs as crumb, index (index)}
        {#if index > 0}
          <Icon icon="lucide:chevron-right" class="size-3.5 shrink-0 text-base-content/40" />
        {/if}

        <button
          type="button"
          class={[
            "btn btn-ghost btn-sm max-w-48 shrink-0 font-normal",
            index === crumbs.length - 1 && "font-medium",
          ]}
          title={crumb.name}
          aria-current={index === crumbs.length - 1 ? "location" : undefined}
          onclick={() => go(index)}
        >
          <span class="min-w-0 truncate">{crumb.name}</span>
        </button>
      {/each}
    </nav>

    <IconButton icon="lucide:x" label={m.common_close()} class="shrink-0" onclick={onclose} />
  </header>

  <div class="flex min-h-64 flex-col px-3 pb-3">
    {#if status === "ready"}
      {#if entries.length === 0}
        <EmptyState icon="lucide:folder-open" text={m.files_remote_empty()} centered />
      {:else}
        <ul class="flex flex-col">
          {#each entries as entry (entry.path)}
            <li>
              <button
                type="button"
                class={[
                  "flex min-h-11 w-full cursor-pointer items-center gap-3 rounded-field px-2 text-left",
                  "transition-colors duration-140 hover:bg-base-content/8",
                  "disabled:cursor-not-allowed",
                ]}
                disabled={opening !== null}
                onclick={() => (entry.dir ? enter(entry) : open(entry))}
              >
                <Icon
                  icon={entry.dir ? "lucide:folder" : "lucide:file"}
                  class="size-4 shrink-0 text-base-content/60"
                />

                <span class="min-w-0 flex-1 truncate text-sm" title={entry.name}>
                  {entry.name}
                </span>

                <span class="grid w-20 shrink-0 justify-items-end">
                  {#if opening === entry.path}
                    <span class="loading loading-spinner loading-xs"></span>
                  {:else if !entry.dir}
                    <span class="text-xs whitespace-nowrap text-base-content/50 tabular-nums">
                      {formatBytes(entry.size, locale)}
                    </span>
                  {/if}
                </span>
              </button>
            </li>
          {/each}
        </ul>
      {/if}
    {:else if status === "loading"}
      <div class="flex flex-1 items-center justify-center">
        <span class="loading loading-spinner loading-sm text-base-content/50"></span>
      </div>
    {:else if status === "waiting"}
      <EmptyState
        icon="lucide:hourglass"
        title={m.files_remote_states_waiting()}
        text={m.files_remote_waiting_hint()}
        centered
      />
    {:else}
      <EmptyState icon={STATES[status].icon} text={STATES[status].text()} centered />
    {/if}
  </div>
</Modal>
