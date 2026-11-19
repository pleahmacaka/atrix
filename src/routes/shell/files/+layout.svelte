<script lang="ts">
  import { registerFilesMessages } from "#lib/files/index.ts"
  import { Toasts } from "@atrix/ui"

  let { children } = $props()

  registerFilesMessages()
</script>

{@render children()}

<Toasts />
