<script lang="ts">
import { computePosition, flip, offset, shift } from "@floating-ui/dom"
import Icon from "@iconify/svelte"
import { quoteInto, quoteTarget } from "#lib/chat/quote.ts"
import { m } from "#lib/paraglide/messages.js"

let button = $state<HTMLButtonElement>()

let pick = $state<{ draft: string; text: string } | null>(null)

const rem = () => Number.parseFloat(getComputedStyle(document.documentElement).fontSize)

const hide = () => {
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

  const { x, y } = await computePosition(
    { getBoundingClientRect: () => range.getBoundingClientRect() },
    button,
    {
      strategy: "fixed",
      placement: "top",
      middleware: [offset(rem() * 0.5), flip(), shift({ padding: rem() * 0.5 })],
    },
  )

  Object.assign(button.style, { left: `${x / rem()}rem`, top: `${y / rem()}rem` })
}

const reply = () => {
  if (pick) {
    quoteInto(pick.draft, pick.text)
  }

  getSelection()?.removeAllRanges()
  hide()
}

$effect(() => {
  const later = () => requestAnimationFrame(read)

  const changed = () => {
    if (getSelection()?.isCollapsed) {
      hide()
    }
  }

  window.addEventListener("pointerup", later)
  window.addEventListener("keyup", later)
  window.addEventListener("scroll", hide, true)
  document.addEventListener("selectionchange", changed)

  return () => {
    window.removeEventListener("pointerup", later)
    window.removeEventListener("keyup", later)
    window.removeEventListener("scroll", hide, true)
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
