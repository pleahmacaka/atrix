<script lang="ts">
  import Section from "#lib/components/ui/Section.svelte"
  import SettingRow from "#lib/components/ui/SettingRow.svelte"
  import { m } from "#lib/paraglide/messages.js"
  import { SECTION_LABELS } from "../../labels"
  import { prefs } from "../../store/prefs.svelte"
  import {
    SIDEBAR_SECTIONS,
    sectionShown,
    showPath,
    sidebarLabel,
    toggleSection,
  } from "../../store/sidebar"
</script>

<Section>
  {#each SIDEBAR_SECTIONS as id (id)}
    <SettingRow title={SECTION_LABELS[id]()}>
      <input
        type="checkbox"
        class="toggle toggle-sm toggle-primary"
        aria-label={SECTION_LABELS[id]()}
        checked={sectionShown(id)}
        onchange={() => toggleSection(id)}
      />
    </SettingRow>
  {/each}
</Section>

{#if prefs.sidebar.hiddenPaths.length > 0}
  <Section title={m.files_sidebar_hidden()}>
    {#each prefs.sidebar.hiddenPaths as path (path)}
      <SettingRow title={sidebarLabel(path)}>
        <button type="button" class="btn btn-sm" onclick={() => showPath(path)}>
          {m.files_sidebar_show()}
        </button>
      </SettingRow>
    {/each}
  </Section>
{/if}
