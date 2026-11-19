<script lang="ts">
import { useComposer } from "#lib/chat/composer.svelte.ts"
import IconButton from "#lib/components/ui/IconButton.svelte"
import MenuItem from "#lib/components/ui/MenuItem.svelte"
import MenuLabel from "#lib/components/ui/MenuLabel.svelte"
import { menuKeys } from "#lib/components/ui/menu.ts"
import Popover from "#lib/components/ui/Popover.svelte"
import { m } from "#lib/paraglide/messages.js"

const composer = useComposer()

let open = $state(false)

const datasources = $derived(composer.props.datasources)

const attach = () => {
  open = false
  composer.picker?.click()
}

const connect = (name: string) => {
  open = false
  composer.text = [m.chat_datasource_ref({ name }), composer.text.trim()]
    .filter(Boolean)
    .join("\n\n")
}
</script>

<Popover label={m.chat_add_menu()} placement="top-start" width="w-64" bind:open>
  {#snippet trigger(p)}
    <IconButton
      {...p}
      icon="lucide:plus"
      label={m.chat_add_menu()}
      size="sm"
      shape="circle"
      class="size-7 min-h-0"
      iconClass="size-4"
    />
  {/snippet}
  <div role="menu" tabindex="-1" class="flex flex-col" {@attach menuKeys}>
    <MenuItem icon="lucide:paperclip" label={m.chat_attach()} data-autofocus onclick={attach} />
    {#if datasources}
      <MenuLabel text={m.chat_datasource_connect()} />
      {#each datasources as name (name)}
        <MenuItem icon="lucide:database" label={name} onclick={() => connect(name)} />
      {:else}
        <MenuItem icon="lucide:database" label={m.chat_datasource_none()} disabled />
      {/each}
    {/if}
    {@render composer.props.extras?.()}
  </div>
</Popover>
