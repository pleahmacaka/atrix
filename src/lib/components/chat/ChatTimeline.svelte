<script lang="ts">

import { hasTimeline, type Turn } from "#lib/chat/session.ts"
import { m } from "#lib/paraglide/messages.js"

let { scroller, turns }: { scroller?: HTMLElement; turns: Turn[] } = $props()

let active = $state<string | null>(null)

const elementOf = (id: string) =>
  scroller?.querySelector<HTMLElement>(`[data-turn="${CSS.escape(id)}"]`)

const track = () => {
  if (!scroller) {
    return
  }

  const line = scroller.getBoundingClientRect().top + scroller.clientHeight * 0.3
  let current: string | null = null

  for (const turn of turns) {
    const el = elementOf(turn.id)

    if (el && el.getBoundingClientRect().top <= line) {
      current = turn.id
    }
  }

  active = current ?? turns[0]?.id ?? null
}

$effect(() => {
  const node = scroller
  void turns

  if (!node) {
    return
  }

  let frame = 0

  const onScroll = () => {
    cancelAnimationFrame(frame)
    frame = requestAnimationFrame(track)
  }

  track()
  node.addEventListener("scroll", onScroll, { passive: true })

  return () => {
    cancelAnimationFrame(frame)
    node.removeEventListener("scroll", onScroll)
  }
})

const jump = (id: string) =>
  elementOf(id)?.scrollIntoView({ behavior: "smooth", block: "start" })
</script>

{#if hasTimeline(turns)}
  <nav
    class={[
      "absolute inset-y-6 right-4 z-10 hidden w-8 content-center",
      "pointer-fine:@4xl:grid",
    ]}
    style:grid-template-rows="repeat({turns.length}, minmax(0, 0.75rem))"
    aria-label={m.chat_timeline()}
  >
    {#each turns as turn (turn.id)}
      <div class="group/tick relative flex items-center justify-end">
        <button
          type="button"
          class="flex h-full w-full cursor-pointer items-center justify-end"
          aria-label={turn.prompt}
          aria-current={active === turn.id ? "true" : undefined}
          onclick={() => jump(turn.id)}
        >
          <span
            class={[
              "h-0.5 rounded-full transition-width-color duration-140",
              active === turn.id
                ? "w-5 bg-base-content"
                : "w-3 bg-base-content/30 group-hover/tick:w-5 group-hover/tick:bg-base-content/70",
            ]}
          ></span>
        </button>
        <div
          class={[
            "popover-box pointer-events-none absolute top-1/2 right-full me-2 hidden w-72",
            "-translate-y-1/2 flex-col gap-1 p-3 break-keep group-hover/tick:flex",
          ]}
        >
          <p class="truncate text-sm font-semibold">{turn.prompt}</p>
          {#if turn.reply}
            <p class="line-clamp-3 text-sm text-base-content/65">{turn.reply}</p>
          {/if}
        </div>
      </div>
    {/each}
  </nav>
{/if}
