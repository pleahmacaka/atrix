<script lang="ts">
import "virtual:iconify-embed"
import "../app.css"
import { locale } from "#lib/messages.ts"

let { children } = $props()

$effect(() => {
  document.documentElement.lang = locale
})
</script>

{@render children()}
