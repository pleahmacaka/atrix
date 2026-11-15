<script lang="ts">
import Icon from "@iconify/svelte"
import { m } from "#lib/paraglide/messages.js"
import JoinForm from "./JoinForm.svelte"
</script>

<main class="grid h-dvh place-items-center bg-base-200 p-4">
  <div
    class="flex w-full max-w-sm flex-col gap-4 rounded-box border border-base-300 bg-base-100 p-6"
  >
    <div class="flex items-center gap-2">
      <Icon icon="lucide:monitor-smartphone" class="size-5 text-primary" />
      <h1 class="text-base font-semibold">{m.onboard_title()}</h1>
    </div>
    <p class="text-sm text-base-content/70">{m.onboard_text()}</p>
    <JoinForm />
  </div>
</main>
