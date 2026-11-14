<script lang="ts">
import { apps } from "#lib/apps/apps.svelte.ts"
import AppView from "#lib/components/apps/AppView.svelte"
import type { WidgetLeaf } from "./layout.svelte.ts"

let { leaf }: { leaf: WidgetLeaf } = $props()

$effect(() => {
  if (leaf.options.key && !apps.byKey[leaf.options.key]) {
    apps.load().catch(() => {})
  }
})
</script>

<AppView appKey={leaf.options.key ?? ""} />
