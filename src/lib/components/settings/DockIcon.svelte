<script lang="ts">
import { Attempt } from "#lib/components/ui/attempt.svelte.ts"
import ErrorAlert from "#lib/components/ui/ErrorAlert.svelte"
import SettingRow from "#lib/components/ui/SettingRow.svelte"
import type { DeviceSettings } from "#lib/desktop/settings/index.ts"
import { m } from "#lib/paraglide/messages.js"
import { desktopSettings } from "./desktop.svelte.ts"

const LIMIT = 512 * 1024

const SIDE = 128

let { device }: { device: DeviceSettings } = $props()

const picking = new Attempt()

// stored as a small PNG because the device record is re-serialized and broadcast on every settings change
const shrink = async (file: File) => {
  const url = URL.createObjectURL(file)

  try {
    const image = new Image()

    image.src = url
    await image.decode()

    const width = image.naturalWidth || SIDE
    const height = image.naturalHeight || SIDE
    const scale = SIDE / Math.max(width, height)
    const canvas = document.createElement("canvas")

    canvas.width = Math.round(width * scale)
    canvas.height = Math.round(height * scale)
    canvas.getContext("2d")?.drawImage(image, 0, 0, canvas.width, canvas.height)

    return canvas.toDataURL("image/png")
  } finally {
    URL.revokeObjectURL(url)
  }
}

const pick = (input: HTMLInputElement) =>
  picking.run(async () => {
    const file = input.files?.[0]

    input.value = ""

    if (!file) {
      return
    }

    if (file.size > LIMIT) {
      throw new Error(m.desktop_icon_too_large())
    }

    const icon = await shrink(file).catch(() => {
      throw new Error(m.desktop_icon_failed())
    })

    desktopSettings.setDevice("dockIcon", icon)
  })
</script>

<SettingRow title={m.desktop_dock_icon()} tip={m.desktop_dock_icon_tip()}>
  <button
    type="button"
    class={["btn btn-sm", device.dockIcon === null && "invisible"]}
    onclick={() => desktopSettings.setDevice("dockIcon", null)}
  >
    {m.common_reset()}
  </button>
  <span class="grid size-8 place-items-center rounded-field bg-base-content/6">
    <img src={device.dockIcon ?? "/favicon.svg"} alt="" class="size-5 object-contain" />
  </span>
  <label class="btn btn-sm">
    {m.desktop_choose_image()}
    <input
      type="file"
      class="hidden"
      accept="image/png,image/svg+xml,image/webp,image/jpeg,image/x-icon"
      onchange={e => pick(e.currentTarget)}
    />
  </label>
</SettingRow>
<ErrorAlert message={picking.failure} />
