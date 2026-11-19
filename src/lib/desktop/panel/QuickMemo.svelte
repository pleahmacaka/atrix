<script lang="ts">
import Icon from "@iconify/svelte"
import { format } from "#lib/calendar/format.ts"
import { Attempt } from "#lib/components/ui/attempt.svelte.ts"
import ErrorAlert from "#lib/components/ui/ErrorAlert.svelte"
import { knowledgeHost } from "#lib/knowledge/host.ts"
import { m } from "#lib/paraglide/messages.js"
import { createMemo, recentMemos } from "./memos.ts"

let { onopen }: { onopen: (id: string) => void } = $props()

const attempt = new Attempt()

let text = $state("")

const host = $derived(knowledgeHost())

const memos = $derived(recentMemos(host?.knowledge ?? []))

const empty = $derived(!text.trim())

const save = () =>
  attempt.run(async () => {
    const body = text.trim()

    if (host && body) {
      await createMemo(host, body)
      text = ""
    }
  })
</script>

<section
  class={[
    "flex shrink-0 flex-col gap-2 p-3",
    "rounded-box border border-base-300 bg-base-100",
  ]}
>
  <h2 class="ps-1 text-sm font-semibold">{m.panel_memo()}</h2>
  <form
    class="flex flex-col gap-2"
    onsubmit={e => {
      e.preventDefault()
      void save()
    }}
  >
    <textarea
      class="textarea textarea-sm w-full"
      rows="3"
      placeholder={m.panel_memo_placeholder()}
      aria-label={m.panel_memo()}
      disabled={!host}
      bind:value={text}
      onkeydown={e => {
        if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
          e.preventDefault()
          void save()
        }
      }}
    ></textarea>
    <div class="flex justify-end">
      <button
        type="submit"
        class="btn btn-primary btn-xs"
        disabled={!host || empty || attempt.busy}
      >
        {m.panel_memo_save()}
      </button>
    </div>
  </form>
  {#if memos.length > 0}
    <ul class="flex flex-col">
      {#each memos as memo (memo.key)}
        <li>
          <button
            type="button"
            class={[
              "flex w-full cursor-pointer items-center gap-2 rounded-field px-2 py-1 text-start text-sm",
              "transition-colors duration-140 hover:bg-base-content/8",
            ]}
            onclick={() => onopen(memo.meta.id)}
          >
            <Icon icon="lucide:sticky-note" class="size-4 shrink-0 text-base-content/55" />
            <span class="min-w-0 flex-1 truncate" title={memo.meta.title}>
              {memo.meta.title}
            </span>
            <span
              class={[
                "w-16 shrink-0 text-end",
                "text-xs whitespace-nowrap text-base-content/55 tabular-nums",
              ]}
            >
              {format(new Date(memo.meta.updated_at), { month: "short", day: "numeric" })}
            </span>
          </button>
        </li>
      {/each}
    </ul>
  {/if}
  <ErrorAlert message={attempt.failure} />
</section>
