<script lang="ts">
import { autoUpdate, computePosition, flip, offset, shift } from "@floating-ui/dom"
import Icon from "@iconify/svelte"
import { quoteInto, quoteTarget } from "#lib/chat/quote.ts"
import { m } from "#lib/paraglide/messages.js"

let button = $state<HTMLButtonElement>()

let pick = $state<{ draft: string; text: string } | null>(null)

const rem = () => Number.parseFloat(getComputedStyle(document.documentElement).fontSize)

let stop: (() => void) | null = null

let watcher: MutationObserver | null = null

const hide = () => {
  stop?.()
  stop = null
  watcher?.disconnect()
  watcher = null
  pick = null
  button?.hidePopover()
}

const read = async () => {
  const selection = getSelection()
  const text = selection?.toString().trim() ?? ""
  const draft = quoteTarget(selection?.anchorNode ?? null)

  if (
    !button ||
    !selection ||
    selection.isCollapsed ||
    !text ||
    !draft ||
    quoteTarget(selection.focusNode) !== draft
  ) {
    hide()

    return
  }

  const range = selection.getRangeAt(0)

  pick = { draft, text }
  button.showPopover()

  const stale = () => {
    const live = getSelection()

    return !live || live.isCollapsed || !live.toString().trim()
  }

  watcher?.disconnect()
  // a re-render that replaces the selected nodes collapses the selection without a selectionchange event
  watcher = new MutationObserver(() => stale() && hide())
  watcher.observe(document.body, { childList: true, subtree: true, characterData: true })

  const start = range.startContainer
  const anchor = {
    getBoundingClientRect: () => range.getBoundingClientRect(),
    contextElement: start instanceof Element ? start : (start.parentElement ?? undefined),
  }
  const place = async () => {
    if (!button || stale()) {
      hide()

      return
    }

    const { x, y } = await computePosition(anchor, button, {
      strategy: "fixed",
      placement: "top",
      middleware: [offset(rem() * 0.5), flip(), shift({ padding: rem() * 0.5 })],
    })

    Object.assign(button.style, { left: `${x / rem()}rem`, top: `${y / rem()}rem` })
  }

  stop?.()
  stop = autoUpdate(anchor, button, place)
}

const reply = () => {
  if (pick) {
    quoteInto(pick.draft, pick.text)
  }

  getSelection()?.removeAllRanges()
  hide()
}

$effect(() => {
  let moved = false

  const later = () =>
    requestAnimationFrame(() => {
      if (moved) {
        read()
      }
    })

  const changed = () => {
    moved = true

    const selection = getSelection()

    if (!selection || selection.isCollapsed || !selection.anchorNode?.isConnected) {
      hide()
    }
  }

  const away = (e: PointerEvent) => {
    if (e.target instanceof Node && button?.contains(e.target)) {
      return
    }

    moved = false
    hide()
  }

  window.addEventListener("pointerdown", away, true)
  window.addEventListener("pointerup", later)
  const key = (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      hide()
    } else if (e.shiftKey || e.key === "Shift") {
      read()
    }
  }

  const blur = () => hide()

  window.addEventListener("keyup", key)
  window.addEventListener("blur", blur)
  document.addEventListener("selectionchange", changed)

  return () => {
    window.removeEventListener("pointerdown", away, true)
    window.removeEventListener("pointerup", later)
    window.removeEventListener("keyup", key)
    window.removeEventListener("blur", blur)
    document.removeEventListener("selectionchange", changed)
  }
})
</script>

<button
  bind:this={button}
  popover="manual"
  type="button"
  class={[
    "fixed inset-auto m-0 flex items-center gap-1.5 px-3 py-1.5",
    "rounded-box border border-base-300 bg-raised text-sm shadow-md",
    "cursor-pointer transition-colors duration-140 hover:bg-base-200",
  ]}
  onpointerdown={e => e.preventDefault()}
  onclick={reply}
>
  <Icon icon="lucide:reply" class="size-4 opacity-70" />
  {m.chat_reply()}
</button>
