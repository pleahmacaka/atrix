<script lang="ts">
  import Modal from "#lib/components/ui/Modal.svelte"
  import Segmented from "#lib/components/ui/Segmented.svelte"
  import { m } from "#lib/paraglide/messages.js"
  import { customCleanup, delayInstaller } from "../../store/cleanup.svelte"

  type Unit = "hours" | "days"

  const UNITS: { id: Unit; label: string }[] = [
    { id: "hours", label: m.files_decor_hours_unit() },
    { id: "days", label: m.files_decor_days_unit() },
  ]

  let amount = $state(3)
  let unit = $state<Unit>("hours")

  const hours = $derived(unit === "days" ? amount * 24 : amount)
  const valid = $derived(Number.isFinite(amount) && amount > 0)

  const close = () => {
    customCleanup.item = null
  }

  const apply = (e: SubmitEvent) => {
    e.preventDefault()

    if (customCleanup.item && valid) {
      delayInstaller(customCleanup.item, hours)
    }

    close()
  }
</script>

<Modal
  bind:open={() => customCleanup.item !== null, next => !next && close()}
  label={m.files_decor_custom_title()}
  class="w-full max-w-sm"
>
  <form class="flex flex-col gap-4 p-5" onsubmit={apply}>
    <h3 class="text-sm font-semibold">{m.files_decor_custom_title()}</h3>

    <div class="flex items-center gap-2">
      <input
        type="number"
        min="1"
        step="1"
        class="input input-sm w-24 tabular-nums"
        aria-label={m.files_decor_custom_label()}
        bind:value={amount}
      />

      <Segmented
        label={m.files_decor_custom_label()}
        items={UNITS}
        value={unit}
        onpick={next => (unit = next)}
      />
    </div>

    <div class="flex justify-end gap-2">
      <button type="button" class="btn btn-ghost btn-sm" onclick={close}>
        {m.common_cancel()}
      </button>

      <button type="submit" class="btn btn-primary btn-sm" disabled={!valid}>
        {m.files_decor_apply()}
      </button>
    </div>
  </form>
</Modal>
