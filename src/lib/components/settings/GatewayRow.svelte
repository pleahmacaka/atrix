<script lang="ts">
import ConfirmButton from "#lib/components/ui/ConfirmButton.svelte"
import IconButton from "#lib/components/ui/IconButton.svelte"
import { m } from "#lib/paraglide/messages.js"
import { gatewayIcon } from "#lib/store/gateways.svelte.ts"
import type { Gateway } from "#lib/store/local.svelte.ts"
import ProviderListRow from "./ProviderListRow.svelte"

let {
  gateway,
  editing,
  browsing,
  disabled,
  onbrowse,
  onedit,
  onremove,
}: {
  gateway: Gateway
  editing: boolean
  browsing: boolean
  disabled: boolean
  onbrowse: () => void
  onedit: () => void
  onremove: () => void
} = $props()
</script>

<ProviderListRow icon={gatewayIcon(gateway)} name={gateway.name} url={gateway.baseURL} {editing}>
  <IconButton icon="lucide:list" label={m.gateway_models()} aria-pressed={browsing} onclick={onbrowse} />
  <IconButton icon="lucide:pencil" label={m.gateway_edit()} aria-pressed={editing} onclick={onedit} />
  <ConfirmButton label={m.common_delete()} {disabled} onconfirm={onremove} />
</ProviderListRow>