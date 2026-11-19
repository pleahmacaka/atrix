<script lang="ts">
import type { Snippet } from "svelte"
import Section from "#lib/components/ui/Section.svelte"
import { DESKTOP_SECTIONS, type DesktopSection } from "./desktopSettings.ts"

let {
  id,
  actions,
  children,
}: { id: DesktopSection; actions?: Snippet; children: Snippet } = $props()

const section = $derived(DESKTOP_SECTIONS.find(s => s.id === id))
</script>

<div data-desktop-section={id}>
  <Section icon={section?.icon} title={section?.label} {actions}>
    {@render children()}
  </Section>
</div>
