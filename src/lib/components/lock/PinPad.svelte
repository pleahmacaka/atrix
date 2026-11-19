<script lang="ts">
import Icon from "@iconify/svelte"
import { m } from "#lib/paraglide/messages.js"

const LENGTH = 4

const PRESS_MS = 140

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "back"]

const PRESSABLE = KEYS.filter(Boolean)

const DECOYS_MIN = 3

const DECOYS_MAX = 5

const STYLES = [
  "bg-primary/15 text-primary",
  "bg-primary/35 text-primary",
  "bg-primary text-primary-content",
  "bg-base-content/20",
  "bg-base-content/60 text-base-100",
  "bg-base-content text-base-100",
]

const random = (below: number) => crypto.getRandomValues(new Uint32Array(1))[0] % below

let { oncomplete, failures = 0 }: { oncomplete: (code: string) => void; failures?: number } =
  $props()

let code = $state("")

let pressed = $state<Map<string, string>>(new Map())

let release: ReturnType<typeof setTimeout> | undefined

$effect(() => () => clearTimeout(release))

const flash = (key: string) => {
  const others = PRESSABLE.filter(k => k !== key)

  for (let i = others.length - 1; i > 0; i--) {
    const j = random(i + 1)

    ;[others[i], others[j]] = [others[j], others[i]]
  }

  const count = DECOYS_MIN + random(DECOYS_MAX - DECOYS_MIN + 1)
  const lit = [key, ...others.slice(0, count)]

  pressed = new Map(lit.map(k => [k, STYLES[random(STYLES.length)]]))
  clearTimeout(release)
  release = setTimeout(() => {
    pressed = new Map()
  }, PRESS_MS)
}

const press = (key: string) => {
  flash(key)

  if (key === "back") {
    code = code.slice(0, -1)

    return
  }

  if (code.length >= LENGTH) {
    return
  }

  code += key

  if (code.length === LENGTH) {
    const done = code

    code = ""
    oncomplete(done)
  }
}
</script>

<svelte:window
  onkeydown={e => {
    const typed = /^[0-9]$/.test(e.key) ? e.key : e.key === "Backspace" ? "back" : null

    if (!typed) {
      return
    }

    if (document.activeElement instanceof HTMLElement && document.activeElement.dataset.pin) {
      document.activeElement.blur()
    }

    press(typed)
  }}
/>

<div class="flex flex-col items-center gap-6">
  {#key failures}
    <div class={["flex gap-3", failures > 0 && "pin-shake"]} aria-hidden="true">
      {#each { length: LENGTH }, i}
        <span
          class={[
            "size-3 rounded-full border transition duration-140",
            i < code.length ? "pin-pop border-primary bg-primary" : "scale-75 border-base-content/40",
          ]}
        ></span>
      {/each}
    </div>
  {/key}
  <div class="grid grid-cols-3 gap-3">
    {#each KEYS as key, i (i)}
      {#if key === ""}
        <span></span>
      {:else}
        <button
          type="button"
          class={[
            "btn btn-circle size-16 transition duration-120",
            key === "back" ? "btn-ghost" : "text-xl font-medium",
            pressed.has(key) && ["scale-90", pressed.get(key)],
          ]}
          data-pin={key}
          aria-label={key === "back" ? m.lock_delete_digit() : undefined}
          onpointerdown={e => e.preventDefault()}
          onclick={() => press(key)}
        >
          {#if key === "back"}
            <Icon icon="lucide:delete" class="size-5" />
          {:else}
            {key}
          {/if}
        </button>
      {/if}
    {/each}
  </div>
</div>

<style>
  .pin-pop {
    animation: pin-pop 160ms ease-out;
  }

  .pin-shake {
    animation: pin-shake 200ms ease-in-out;
  }

  @keyframes pin-pop {
    50% {
      scale: 1.4;
    }
  }

  @keyframes pin-shake {
    25% {
      translate: -0.375rem 0;
    }

    75% {
      translate: 0.375rem 0;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .pin-pop,
    .pin-shake {
      animation: none;
    }
  }
</style>
