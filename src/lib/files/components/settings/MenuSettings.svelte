<script lang="ts">
  import Section from "#lib/components/ui/Section.svelte"
  import { m } from "#lib/paraglide/messages.js"
  import { entryIcon, entryLabel, LOCKED_ITEMS } from "../../store/menu-entries"
  import { type MenuSection, prefs } from "../../store/prefs.svelte"
  import { verbIcon } from "../../store/shell-verbs"
  import OrderList from "./OrderList.svelte"

  const SECTIONS: Record<MenuSection, { icon: string; label: () => string }> = {
    open: {
      icon: "lucide:square-arrow-out-up-right",
      label: m.files_settings_context_menu_sections_open,
    },
    shell: {
      icon: "lucide:puzzle",
      label: m.files_settings_context_menu_sections_shell,
    },
    archive: {
      icon: "lucide:file-archive",
      label: m.files_settings_context_menu_sections_archive,
    },
    edit: {
      icon: "lucide:scissors",
      label: m.files_settings_context_menu_sections_edit,
    },
    organize: {
      icon: "lucide:pin",
      label: m.files_settings_context_menu_sections_organize,
    },
    properties: {
      icon: "lucide:info",
      label: m.files_settings_context_menu_sections_properties,
    },
  }

  const verbs = $derived(
    new Map(prefs.shellVerbs.map(verb => [verb.id, verb])),
  )

  const labelOf = (id: string) => verbs.get(id)?.label ?? entryLabel(id)

  const iconOf = (id: string) => {
    const verb = verbs.get(id)

    return verb ? verbIcon(verb.icon) : entryIcon(id)
  }

  const locked = (id: string) => LOCKED_ITEMS.includes(id)
</script>

<Section title={m.files_settings_context_menu_title()}>
  <OrderList
    bind:arrangement={prefs.menuLayout}
    label={m.files_settings_context_menu_title()}
    labelOf={id => SECTIONS[id].label()}
    iconOf={id => SECTIONS[id].icon}
    locked={id => id === "properties"}
  />
</Section>

{#each prefs.menuLayout.order as section (section)}
  {@const title = SECTIONS[section].label()}

  <Section {title}>
    {#if prefs.menuItems[section].order.length > 0}
      <OrderList
        bind:arrangement={prefs.menuItems[section]}
        label={title}
        {labelOf}
        {iconOf}
        {locked}
      />
    {:else}
      <p class="py-3 text-sm text-base-content/60">
        {m.files_settings_context_menu_shell_empty()}
      </p>
    {/if}
  </Section>
{/each}
