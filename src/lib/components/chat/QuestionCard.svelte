<script lang="ts">
import Icon from "@iconify/svelte"
import type { Asked, Picked } from "#lib/acp/items.ts"
import { m } from "#lib/paraglide/messages.js"
import { CARD } from "./card.ts"

let {
  asked,
  onAnswer,
}: { asked: Asked; onAnswer: (answers: Picked[]) => Promise<boolean> } =
  $props()

const blank = () => asked.questions.map((): Picked => ({ picks: [], text: "" }))

let answers = $state(blank())

let sent = $state(false)

const send = async () => {
  if (!sent) {
    sent = true
    sent = await onAnswer($state.snapshot(answers))
  }
}

const instant = $derived(asked.questions.length === 1 && !asked.questions[0].multiSelect)

const complete = $derived(
  answers.length === asked.questions.length &&
    asked.questions.every((q, i) =>
      q.multiSelect
        ? answers[i].picks.length > 0 || !!answers[i].text?.trim()
        : answers[i].picks.length === 1 || !!answers[i].text?.trim(),
    ),
)

const pick = (question: number, option: number) => {
  const answer = answers[question]

  if (asked.questions[question].multiSelect) {
    answer.picks = answer.picks.includes(option)
      ? answer.picks.filter(p => p !== option)
      : [...answer.picks, option]

    return
  }

  answer.picks = [option]
  answer.text = ""

  if (instant) {
    send()
  }
}
</script>

<fieldset class={CARD} disabled={sent}>
  {#each asked.questions as question, q (q)}
    <div class="flex flex-col gap-2 not-first:mt-4">
      <h3 class="flex min-w-0 items-start gap-2 font-semibold">
        <Icon icon="lucide:circle-help" class="mt-0.5 size-4 shrink-0 text-primary" />
        <span class="min-w-0 break-words">{question.question}</span>
      </h3>
      <div class="flex flex-col gap-1">
        {#each question.options as option, o (o)}
          {@const chosen = answers[q]?.picks.includes(o)}
          <button
            type="button"
            class={[
              "flex min-w-0 cursor-pointer items-start gap-2 rounded-field px-3 py-2 text-start transition-colors duration-140 disabled:cursor-not-allowed",
              chosen ? "bg-primary/8 text-primary" : "hover:bg-base-content/5",
            ]}
            aria-pressed={chosen}
            onclick={() => pick(q, o)}
          >
            <Icon
              icon={question.multiSelect
                ? chosen
                  ? "lucide:square-check"
                  : "lucide:square"
                : chosen
                  ? "lucide:circle-dot"
                  : "lucide:circle"}
              class="mt-0.5 size-4 shrink-0"
            />
            <span class="flex min-w-0 flex-col">
              <span class="text-sm font-medium">{option.label}</span>
              {#if option.description}
                <span class="text-xs text-base-content/60">{option.description}</span>
              {/if}
            </span>
          </button>
        {/each}
        {#if answers[q]}
          <input
            class="input input-sm w-full"
            placeholder={m.chat_question_other()}
            bind:value={answers[q].text}
            oninput={() => {
              if (!question.multiSelect) {
                answers[q].picks = []
              }
            }}
            onkeydown={e => {
              if (e.key === "Enter" && instant && answers[q].text?.trim()) {
                send()
              }
            }}
          />
        {/if}
      </div>
    </div>
  {/each}
  {#if !instant}
    <div class="mt-4 flex justify-end">
      <button
        type="button"
        class="btn btn-primary btn-sm"
        disabled={!complete}
        onclick={() => send()}
      >
        <Icon icon="lucide:send" class="size-4" />
        {m.chat_question_send()}
      </button>
    </div>
  {/if}
</fieldset>
