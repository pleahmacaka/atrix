<script lang="ts">
import Icon from "@iconify/svelte"
import { Attempt } from "#lib/components/ui/attempt.svelte.ts"
import ErrorAlert from "#lib/components/ui/ErrorAlert.svelte"
import SettingRow from "#lib/components/ui/SettingRow.svelte"
import { m } from "#lib/paraglide/messages.js"
import { setOpenRouterKey } from "#lib/store/auth.ts"
import { local } from "#lib/store/local.svelte.ts"
import { login } from "#lib/store/openrouter.ts"

const attempt = new Attempt()

const connect = () =>
  attempt.run(async () => {
    const key = await login()

    if (key) {
      await setOpenRouterKey(key)
    }
  })
</script>

<SettingRow
  icon="lucide:key-round"
  title={m.openrouter_account()}
  hint={m.openrouter_account_hint()}
>
  {#if local.data.openrouter.key}
    <div class="flex items-center gap-3">
      <span class="flex items-center gap-2 text-sm whitespace-nowrap">
        <Icon icon="lucide:circle-check" class="size-4 text-success" />
        {m.openrouter_connected()}
      </span>
      <button
        type="button"
        class="btn btn-sm"
        disabled={attempt.busy}
        onclick={() => attempt.run(() => setOpenRouterKey(null))}
      >
        <Icon icon="lucide:log-out" class="size-4" />
        {m.openrouter_disconnect()}
      </button>
    </div>
  {:else}
    <button
      type="button"
      class="btn btn-primary btn-sm"
      disabled={attempt.busy}
      onclick={connect}
    >
      {#if attempt.busy}
        <span class="loading loading-spinner loading-xs"></span>
      {:else}
        <Icon icon="lucide:log-in" class="size-4" />
      {/if}
      {m.openrouter_connect()}
    </button>
  {/if}
</SettingRow>
<ErrorAlert message={attempt.failure} />
