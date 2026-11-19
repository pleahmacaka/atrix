<script lang="ts">
import Icon from "@iconify/svelte"
import { fade } from "#lib/pcb/motion.ts"
import { type ToastKind, toasts } from "../../store/toast.svelte"

const ICONS: Record<ToastKind, string> = {
  success: "lucide:circle-check",
  error: "lucide:circle-alert",
  info: "lucide:info",
}

const TONES: Record<ToastKind, string> = {
  success: "alert-success",
  error: "alert-error",
  info: "alert-info",
}
</script>

<div class="toast toast-end toast-bottom z-50">
  {#each toasts as entry (entry.id)}
    <div
      role={entry.kind === "error" ? "alert" : "status"}
      class={["alert alert-soft max-w-sm text-sm shadow-md", TONES[entry.kind]]}
      transition:fade
    >
      <Icon icon={ICONS[entry.kind]} class="size-4 shrink-0" />
      <span class="min-w-0 break-words">{entry.text}</span>
    </div>
  {/each}
</div>
