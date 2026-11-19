<script lang="ts">
import { Attempt } from "#lib/components/ui/attempt.svelte.ts"
import ErrorAlert from "#lib/components/ui/ErrorAlert.svelte"
import IconButton from "#lib/components/ui/IconButton.svelte"
import IconInput from "#lib/components/ui/IconInput.svelte"
import { sync } from "#lib/p2p/sync.svelte.ts"
import { m } from "#lib/paraglide/messages.js"
import { mobileApp } from "#lib/platform.ts"
import Scanner from "./Scanner.svelte"

let {
  connect: join = sync.connect,
}: { connect?: (code: string) => Promise<void> } = $props()

const attempt = new Attempt()

let code = $state("")

let scanning = $state(false)

const connect = (value: string) =>
  attempt.run(async () => {
    await join(value)
    code = ""
  })
</script>

<div class="flex flex-col gap-3">
  <form
    class="flex gap-2"
    onsubmit={e => {
      e.preventDefault()
      connect(code)
    }}
  >
    <IconInput
      icon="lucide:ticket"
      label={m.sync_code()}
      ghost={false}
      class="flex-1"
      placeholder={m.sync_code()}
      bind:value={code}
    />
    <IconButton
      type="submit"
      icon="lucide:link"
      label={m.common_connect()}
      tone="primary"
      busy={attempt.busy}
      disabled={attempt.busy || !code.trim()}
    />
    {#if mobileApp}
      <IconButton
        icon="lucide:scan-qr-code"
        label={m.pair_scan()}
        tone="plain"
        class={[scanning && "btn-active"]}
        aria-pressed={scanning}
        onclick={() => {
          scanning = !scanning
        }}
      />
    {/if}
  </form>
  {#if scanning}
    <Scanner
      onscan={value => {
        scanning = false
        connect(value)
      }}
      onfail={reason => {
        scanning = false
        attempt.failure = reason
      }}
    />
  {/if}
  <ErrorAlert message={attempt.failure} />
</div>
