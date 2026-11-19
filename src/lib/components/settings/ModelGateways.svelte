<script lang="ts">
import { Attempt } from "#lib/components/ui/attempt.svelte.ts"
import ErrorAlert from "#lib/components/ui/ErrorAlert.svelte"
import { m } from "#lib/paraglide/messages.js"
import { activeGateways } from "#lib/store/gatewayCatalog.ts"
import { modelIdsOf, removeGateway, saveGateway } from "#lib/store/gateways.svelte.ts"
import type { Gateway } from "#lib/store/local.svelte.ts"
import AddButton from "./AddButton.svelte"
import GatewayEditor from "./GatewayEditor.svelte"
import GatewayModelsPanel from "./GatewayModelsPanel.svelte"
import GatewayRow from "./GatewayRow.svelte"
import { blank, type Draft, draftOf } from "./gatewayDraft.ts"
import SettingCard from "./SettingCard.svelte"

const attempt = new Attempt()

const gateways = $derived(activeGateways())

let draft = $state<Draft | null>(null)

let browsing = $state<string | null>(null)

const close = () => (draft = null)

const edit = (gateway: Gateway) => (draft = draftOf(gateway))

const remove = (id: string) =>
  attempt.run(async () => {
    if (draft?.id === id) {
      draft = null
    }

    await removeGateway(id)
  })
</script>

<SettingCard>
  {#each gateways as gateway (gateway.id)}
    <GatewayRow
      {gateway}
      editing={draft?.id === gateway.id}
      browsing={browsing === gateway.id}
      disabled={attempt.busy}
      onbrowse={() => (browsing = browsing === gateway.id ? null : gateway.id)}
      onedit={() => edit(gateway)}
      onremove={() => remove(gateway.id)}
    />
    {#if browsing === gateway.id}
      <GatewayModelsPanel
        ids={modelIdsOf(gateway)}
        {gateway}
        onmodels={models => attempt.run(() => saveGateway({ ...gateway, models }))}
      />
    {/if}
    {#if draft?.id === gateway.id}
      <GatewayEditor {draft} {close} />
    {/if}
  {/each}
  {#if draft && !draft.id}
    <GatewayEditor {draft} {close} />
  {/if}
  {#if !draft}
    <AddButton label={m.gateway_add()} onclick={() => (draft = blank())} />
  {/if}
</SettingCard>
<ErrorAlert message={attempt.failure} />