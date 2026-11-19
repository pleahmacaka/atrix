<script lang="ts">
  import { applyAppearance, standaloneLook } from "@atrix/settings"
  import { StandaloneShell } from "@atrix/ui"
  import "virtual:iconify-embed"
  import "./layout.css"

  let { children } = $props()

  $effect(() => {
    applyAppearance(standaloneLook, { restingShadow: true })
  })
</script>

<StandaloneShell>
  {@render children()}
</StandaloneShell>
