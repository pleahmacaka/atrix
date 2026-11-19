<script lang="ts">
  import { m } from "#lib/paraglide/messages.js"
  import { prefs } from "../../store/prefs.svelte"
  import { cleanupBadge } from "./decor"

  let { hours }: { hours: number } = $props()
</script>

<span
  class={[
    "shrink-0 rounded-field px-1.5 text-xs font-medium tabular-nums",
    cleanupBadge(prefs.cleanupColor),
  ]}
>
  {hours > 48
    ? m.files_decor_delete_in_days({ days: Math.ceil(hours / 24) })
    : hours > 0
      ? m.files_decor_delete_in({ hours })
      : m.files_decor_due()}
</span>
