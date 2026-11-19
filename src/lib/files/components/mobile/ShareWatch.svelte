<script lang="ts">
  import { goPage } from "#lib/store/nav.svelte.ts"
  import { share, startShare } from "../share/share.svelte"

  $effect(() => startShare())

  $effect(() => {
    if (share.center) {
      goPage("files")
    }
  })
</script>
