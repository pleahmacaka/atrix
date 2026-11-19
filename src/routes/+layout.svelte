<script lang="ts">
import "../app.css"
import "virtual:iconify-embed"
import Icon from "@iconify/svelte"
import { invoke } from "@tauri-apps/api/core"
import { onMount, type Snippet } from "svelte"
import { startChannels } from "#lib/channels/relay.svelte.ts"
import Onboarding from "#lib/components/devices/Onboarding.svelte"
import LockScreen from "#lib/components/lock/LockScreen.svelte"
import LockSetup from "#lib/components/lock/LockSetup.svelte"
import { errorText } from "#lib/components/ui/attempt.svelte.ts"
import IconButton from "#lib/components/ui/IconButton.svelte"
import { startTitleTips } from "#lib/components/ui/tooltip.ts"
import UpdatePrompt from "#lib/components/update/UpdatePrompt.svelte"
import { startExternalLinks } from "#lib/links.ts"
import { lockKind, screen } from "#lib/lock/lock.svelte.ts"
import { startLogging } from "#lib/logging.ts"
import { startLocalHost } from "#lib/p2p/hosts.svelte.ts"
import { sync } from "#lib/p2p/sync.svelte.ts"
import { m } from "#lib/paraglide/messages.js"
import { client, desktop } from "#lib/platform.ts"
import { startAppearance } from "#lib/store/appearance.svelte.ts"
import { connectOpenRouter } from "#lib/store/gateways.svelte.ts"
import { local } from "#lib/store/local.svelte.ts"
import { currentLocale } from "#lib/store/locale.ts"
import { captureCallback, finishCallback } from "#lib/store/openrouter.ts"
import { migrateVoiceURL } from "#lib/store/speech.svelte.ts"

let { children }: { children: Snippet } = $props()

let failure = $state<string | null>(null)

const report = (e: unknown) => {
  failure = errorText(e)
}

const overlay = location.pathname.startsWith("/overlay")

const floating = location.pathname.startsWith("/float")

document.documentElement.lang = currentLocale()

if (!overlay) {
  if (!floating) {
    startLogging()
    screen.watch()
  }

  startAppearance()
  startTitleTips()
  startExternalLinks()
}

onMount(async () => {
  if (overlay) {
    return
  }

  if (floating) {
    await local.load().catch(report)

    return
  }

  if (desktop) {
    invoke("tray_labels", { open: m.tray_open(), quit: m.shell_quit() }).catch(() => {})
  }

  captureCallback()

  const loading = local.load()

  loading
    .catch(() => {})
    .then(startLocalHost)
    .then(startChannels)
    .catch(report)

  try {
    await loading
    await migrateVoiceURL()

    const key = await finishCallback()

    if (key) {
      await connectOpenRouter(key)
    }

    const code = desktop
      ? await invoke<string | null>("startup_pair_code").catch(() => null)
      : null

    await sync.start()

    if (code) {
      await sync.connect(code)
    }

    if (desktop) {
      const { listen } = await import("@tauri-apps/api/event")

      await listen<string>("pair-code", e => {
        sync.connect(e.payload).catch(report)
      })
    }
  } catch (e) {
    report(e)
  }
})
</script>

{#if !overlay && !floating && client && sync.loaded && sync.peers.size === 0}
  <Onboarding />
{:else if overlay || local.ready}
  <div
    class="lock-blur contents"
    inert={screen.locked && !!lockKind()}
    data-locked={(screen.locked && !!lockKind()) || undefined}
  >
    {@render children()}
  </div>
  {#if !overlay}
    <LockScreen />
  {/if}
  {#if !overlay && !floating}
    <LockSetup />
  {/if}
{:else}
  <main class="grid h-dvh place-items-center">
    <span class="loading loading-spinner opacity-60"></span>
  </main>
{/if}

{#if failure}
  <div class="toast toast-end">
    <div role="alert" class="alert alert-error text-sm">
      <Icon icon="lucide:circle-alert" class="size-4 shrink-0" />
      <span class="min-w-0 break-words">{failure}</span>
      <IconButton
        icon="lucide:x"
        label={m.common_close()}
        size="xs"
        onclick={() => {
          failure = null
        }}
      />
    </div>
  </div>
{/if}

{#if !overlay && !floating}
  <UpdatePrompt />
{/if}

