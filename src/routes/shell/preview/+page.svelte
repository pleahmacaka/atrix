<script lang="ts">
  import { emit, listen } from "@tauri-apps/api/event"
  import IconButton from "#lib/components/ui/IconButton.svelte"
  import * as native from "#lib/desktop/native/index.js"
  import { m } from "#lib/paraglide/messages.js"

  type Slot = {
    hwnd: number
    x: number
    y: number
    width: number
    height: number
    header: number
    title: string
  }

  const rootRem = () =>
    Number.parseFloat(getComputedStyle(document.documentElement).fontSize) || 16

  let slots = $state<Slot[]>([])
  let hovered = $state<number | null>(null)
  let rem = $state(rootRem())

  $effect(() => {
    const stops = [
      listen<Slot[]>("preview-shown", e => {
        rem = rootRem()
        slots = e.payload
      }),
      listen("preview-hidden", () => {
        slots = []
        hovered = null
      }),
    ]

    return () => {
      for (const stop of stops) {
        stop.then(off => off()).catch(() => undefined)
      }
    }
  })

  const setHover = (over: boolean) => {
    emit("preview-hover", over).catch(() => undefined)
  }

  const pick = (slot: Slot) => {
    setHover(false)
    native.activateWindow(slot.hwnd).catch(() => undefined)
    native.previewHide().catch(() => undefined)
  }

  const close = (slot: Slot) => {
    native.closeWindow(slot.hwnd).catch(() => undefined)
    slots = slots.filter(other => other.hwnd !== slot.hwnd)

    if (slots.length === 0) {
      setHover(false)
      native.previewHide().catch(() => undefined)
    }
  }
</script>

<svelte:body onmouseenter={() => setHover(true)} onmouseleave={() => setHover(false)} />

<div class={[
  "relative size-full rounded-box border border-base-300",
  "bg-base-100 select-none",
]}>
  {#each slots as slot (slot.hwnd)}
    {@const active = hovered === slot.hwnd}

    <fieldset
      class={[
        "absolute rounded-field transition-colors",
        active ? "bg-base-content/8" : "bg-transparent",
      ]}
      style:left="{slot.x / rem}rem"
      style:top="{slot.y / rem}rem"
      style:width="{slot.width / rem}rem"
      style:height="{slot.height / rem}rem"
      aria-label={slot.title}
      onmouseenter={() => (hovered = slot.hwnd)}
      onmouseleave={() => (hovered = null)}
    >
      <button
        type="button"
        class="absolute inset-0 cursor-pointer rounded-field"
        aria-label={m.dock_preview_switch({ title: slot.title })}
        onclick={() => pick(slot)}
      ></button>

      <div
        class="pointer-events-none relative flex items-center gap-2 pr-1 pl-2"
        style:height="{slot.header / rem}rem"
      >
        <span class="min-w-0 flex-1 truncate text-xs" title={slot.title}>{slot.title}</span>

        <IconButton
          icon="lucide:x"
          label={m.dock_preview_close()}
          size="xs"
          class={[
            "pointer-events-auto transition-opacity hover:bg-error",
            "hover:text-error-content",
            active ? "opacity-100" : "opacity-0 focus-visible:opacity-100",
          ]}
          onclick={() => close(slot)}
        />
      </div>
    </fieldset>
  {/each}
</div>
