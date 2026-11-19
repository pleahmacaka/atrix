<script lang="ts">
  import { registerFilesMessages } from "@atrix/files"
  import { Toasts } from "@atrix/ui"

  let { children } = $props()

  registerFilesMessages()
</script>

{@render children()}

<Toasts />
