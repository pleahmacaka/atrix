<script lang="ts">
import EmptyState from "#lib/components/ui/EmptyState.svelte"
import Section from "#lib/components/ui/Section.svelte"
import { m } from "#lib/paraglide/messages.js"
import { desktop } from "#lib/platform.ts"
import LockSettings from "./LockSettings.svelte"
</script>

{#if desktop}
  <Section>
    <LockSettings />
  </Section>
{:else}
  <EmptyState icon="lucide:shield" text={m.common_unsupported()} />
{/if}