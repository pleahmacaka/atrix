<script lang="ts">
import type { Snippet } from "svelte"
import Toasts from "#lib/files/components/window/Toasts.svelte"

let { children }: { children: Snippet } = $props()
</script>

{@render children()}

<Toasts />
