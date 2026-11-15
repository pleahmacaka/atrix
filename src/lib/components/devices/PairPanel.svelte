<script lang="ts">
import Icon from "@iconify/svelte"
import encodeQR from "qr"
import { onDestroy } from "svelte"
import { Attempt } from "#lib/components/ui/attempt.svelte.ts"
import CopyButton from "#lib/components/ui/CopyButton.svelte"
import EmptyState from "#lib/components/ui/EmptyState.svelte"
import ErrorAlert from "#lib/components/ui/ErrorAlert.svelte"
import IconButton from "#lib/components/ui/IconButton.svelte"
import Section from "#lib/components/ui/Section.svelte"
import SettingRow from "#lib/components/ui/SettingRow.svelte"
import type { Peer } from "#lib/p2p/net.ts"
import { sync } from "#lib/p2p/sync.svelte.ts"
import { m } from "#lib/paraglide/messages.js"
import JoinForm from "./JoinForm.svelte"

const QR_SCALE = 8

const attempt = new Attempt()

let now = $state(Date.now())

const timer = setInterval(() => {
  now = Date.now()
}, 1000)

onDestroy(() => clearInterval(timer))

const remaining = $derived.by(() => {
  const left = Math.max(0, (sync.pairing?.expires ?? now) - now)
  const total = Math.floor(left / 1000)
  const pad = (n: number) => String(n).padStart(2, "0")

  return `${pad(Math.floor(total / 60))}:${pad(total % 60)}`
})

$effect(() => {
  if (sync.pairing && sync.pairing.expires <= now) {
    sync.closePairing()
  }
})

const qr = $derived(
  sync.pairing
    ? encodeQR(sync.pairing.code, "data-url", { scale: QR_SCALE })
    : null,
)

const PLATFORMS: Record<string, () => string> = {
  windows: m.platform_windows,
  macos: m.platform_macos,
  linux: m.platform_linux,
  android: m.platform_android,
  ios: m.platform_ios,
  web: m.platform_web,
}

const ICONS: Record<string, string> = {
  android: "lucide:smartphone",
  ios: "lucide:smartphone",
  web: "lucide:globe",
}

const stamp = new Intl.DateTimeFormat(undefined, {
  dateStyle: "short",
  timeStyle: "short",
})

const peers = $derived(
  [...sync.peers.values()].toSorted(
    (a, b) => Number(b.online) - Number(a.online) || b.seen - a.seen,
  ),
)

const status = (peer: Peer) =>
  peer.online
    ? m.peer_online()
    : peer.seen
      ? m.peer_seen({ time: stamp.format(peer.seen) })
      : m.peer_offline()
</script>

<div class="flex flex-col gap-6">
  <div class="flex flex-col">
    <SettingRow icon="lucide:qr-code" title={m.sync_issue()}>
      <IconButton
        icon={sync.pairing ? "lucide:refresh-cw" : "lucide:ticket-plus"}
        label={sync.pairing ? m.sync_reissue() : m.sync_issue_button()}
        tone="primary"
        disabled={attempt.busy}
        onclick={() => attempt.run(() => sync.issue())}
      />
    </SettingRow>
    {#if sync.pairing && qr}
      <div class="flex flex-col items-center gap-3 pb-3">
        <img
          src={qr}
          alt={m.pair_qr()}
          class="size-48 rounded-box bg-white p-2"
        />
        <div class="flex w-full items-center gap-2">
          <code
            class="min-w-0 flex-1 rounded-field bg-inset px-3 py-2 text-xs break-all select-all"
          >
            {sync.pairing.code}
          </code>
          <CopyButton text={sync.pairing.code} />
        </div>
        <div
          class="flex w-full items-center gap-2 text-xs text-base-content/60"
        >
          <Icon icon="lucide:hourglass" class="size-4" />
          <span class="flex-1 tabular-nums">
            {m.sync_expires_in({ remaining })}
          </span>
          <IconButton
            icon="lucide:trash-2"
            label={m.sync_discard()}
            size="xs"
            onclick={() => sync.closePairing()}
          />
        </div>
      </div>
    {/if}
  </div>
  <Section icon="lucide:link" title={m.pair_join()}>
    <JoinForm />
  </Section>
  <Section icon="lucide:radio-tower" title={m.sync_devices()}>
    <ul class="flex flex-col gap-2 py-2 text-sm">
      {#each peers as peer (peer.id)}
        <li class="flex items-center gap-2">
          <Icon
            icon={ICONS[peer.platform] ?? "lucide:monitor"}
            class={[
              "size-4 shrink-0",
              peer.online ? "text-success" : "text-base-content/40",
            ]}
          />
          <div class="flex min-w-0 flex-1 flex-col">
            <span class="truncate" title={peer.name}>{peer.name}</span>
            <span class="truncate text-xs text-base-content/60">
              {PLATFORMS[peer.platform]?.() ?? peer.platform}
              {peer.host ? m.sync_peer_host() : ""}
            </span>
          </div>
          <span
            class={[
              "badge badge-sm whitespace-nowrap",
              peer.online ? "badge-success badge-soft" : "badge-ghost",
            ]}
          >
            {status(peer)}
          </span>
          <IconButton
            icon="lucide:unlink"
            label={m.peer_unpair()}
            size="xs"
            onclick={() => attempt.run(() => sync.unpair(peer.id))}
          />
        </li>
      {:else}
        <li>
          <EmptyState icon="lucide:wifi-off" text={m.sync_no_devices()} />
        </li>
      {/each}
    </ul>
  </Section>
</div>
<ErrorAlert message={attempt.failure} />
