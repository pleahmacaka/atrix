<script lang="ts">
import { onDestroy, onMount } from "svelte"
import { errorText } from "#lib/components/ui/attempt.svelte.ts"
import { m } from "#lib/paraglide/messages.js"
import { mobileApp } from "#lib/platform.ts"

let {
  onscan,
  onfail,
}: { onscan: (code: string) => void; onfail: (reason: string) => void } =
  $props()

const SCAN_MS = 250

let player = $state<HTMLVideoElement>()

let stream: MediaStream | null = null

let timer: ReturnType<typeof setInterval> | null = null

const stop = () => {
  if (timer) {
    clearInterval(timer)
  }

  for (const track of stream?.getTracks() ?? []) {
    track.stop()
  }

  stream = null
  timer = null
}

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

const scanVideo = async () => {
  const { BarcodeDetector: Ponyfill } = await import("qr/decode.js")
  const Detector =
    (globalThis as { BarcodeDetector?: typeof Ponyfill }).BarcodeDetector ??
    Ponyfill
  const detector = new Detector({ formats: ["qr_code"] })

  stream = await navigator.mediaDevices
    .getUserMedia({ video: { facingMode: "environment" } })
    .catch(() => {
      throw new Error(m.pair_camera())
    })

  if (!player) {
    return stop()
  }

  player.srcObject = stream
  await player.play()

  let busy = false

  timer = setInterval(async () => {
    if (busy || !player || player.readyState < 2) {
      return
    }

    busy = true

    const [found] = await detector.detect(player).catch(() => [])

    busy = false

    if (found?.rawValue) {
      stop()
      onscan(found.rawValue)
    }
  }, SCAN_MS)
}

onMount(() => {
  ;(mobileApp ? scanNative() : scanVideo()).catch((e: unknown) =>
    onfail(errorText(e)),
  )
})

onDestroy(stop)
</script>

{#if !mobileApp}
  <div class="flex flex-col gap-2">
    <video
      bind:this={player}
      class="aspect-square w-full max-w-xs self-center rounded-box bg-base-300 object-cover"
      playsinline
      muted
    ></video>
    <p class="text-center text-xs text-base-content/60">
      {m.pair_scan_hint()}
    </p>
  </div>
{/if}
