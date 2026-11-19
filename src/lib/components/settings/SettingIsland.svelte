<script lang="ts">
import type { Snippet } from "svelte"
import Row from "#lib/components/ui/SettingRow.svelte"

let { title, children }: { title: string; children: Snippet } = $props()
</script>

<div class="rounded-box border border-base-300 bg-base-100 px-4">
  <Row {title}>
    {@render children()}
  </Row>
</div>