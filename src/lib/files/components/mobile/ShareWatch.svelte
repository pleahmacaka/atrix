<script lang="ts">
  import { goPage } from "#lib/store/nav.svelte.ts"
  import { share, startShare } from "../share/share.svelte"
  import { keepAlive } from "./mobile"

  $effect(() => startShare())

  $effect(() => {
    keepAlive(share.state.devices.length > 0)
  })

  $effect(() => {
    if (share.center) {
      goPage("files")
    }
  })
</script>
