<script lang="ts">
import type { Snippet } from "svelte"
import Section from "#lib/components/ui/Section.svelte"
import type { DesktopSection } from "./desktopSettings.ts"

let {
  id,
  title,
  actions,
  children,
}: {
  id?: DesktopSection
  title?: string
  actions?: Snippet
  children: Snippet
} = $props()
</script>

<div data-desktop-section={id}>
  <Section {title} {actions}>
    {@render children()}
  </Section>
</div>
