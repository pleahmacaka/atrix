<script lang="ts">
import { onMount } from "svelte"
import { errorText } from "#lib/components/ui/attempt.svelte.ts"
import { m } from "#lib/paraglide/messages.js"

let {
  onscan,
  onfail,
}: { onscan: (code: string) => void; onfail: (reason: string) => void } =
  $props()

const scanNative = async () => {
  const { Format, requestPermissions, scan } = await import(
    "@tauri-apps/plugin-barcode-scanner"
  )

  if ((await requestPermissions()) !== "granted") {
    throw new Error(m.pair_camera())
  }

  const { content } = await scan({ formats: [Format.QRCode] })

  onscan(content)
}

onMount(() => {
  scanNative().catch((e: unknown) => onfail(errorText(e)))
})
</script>
