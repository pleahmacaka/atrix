<script lang="ts">
import type { ClassValue } from "svelte/elements"
import { on } from "svelte/events"
import { dateKey } from "#lib/calendar/dates.ts"
import type { CalendarEditor } from "#lib/calendar/editor.svelte.ts"
import type { SharedTask } from "#lib/calendar/shared.svelte.ts"
import { dueLabel, quickTask } from "#lib/calendar/tasks.ts"
import ErrorAlert from "#lib/components/ui/ErrorAlert.svelte"
import { m } from "#lib/paraglide/messages.js"
import { contextMenu } from "#lib/store/contextMenu.svelte.ts"

let { editor, class: extra }: { editor: CalendarEditor; class?: ClassValue } =
  $props()

let title = $state("")

let editing = $state<string | null>(null)

const overdue = (task: SharedTask) =>
  !task.done && task.due !== null && task.due < dateKey(new Date())

const hasDone = $derived(editor.tasks.some(t => t.done))

const keyOf = (task: SharedTask) => `${task.host.id}:${task.id}`


const add = (e: SubmitEvent) => {
  e.preventDefault()

  const task = quickTask(title)

  if (task) {
    title = ""
    void editor.addTask(task.title, task.due)
  }
}

const commit = (task: SharedTask, form: HTMLFormElement) => {
  if (editing !== keyOf(task)) {
    return
  }

  editing = null

  const data = new FormData(form)
  const name = String(data.get("title") ?? "").trim()
  const due = String(data.get("due") ?? "") || null

  if (name && (name !== task.title || due !== task.due)) {
    void editor.changeTask(task, { title: name, due })
  }
}

const menu = (e: MouseEvent, task: SharedTask) =>
  contextMenu.show(e, [
    {
      label: m.panel_task_edit(),
      icon: "lucide:pencil",
      run: () => (editing = keyOf(task)),
    },
    "separator",
    {
      label: m.common_delete(),
      icon: "lucide:trash-2",
      danger: true,
      run: () => editor.removeTask(task),
    },
  ])
</script>

<section
  class={[
    "flex flex-col gap-2 rounded-box border border-base-300 bg-base-100 p-3",
    extra,
  ]}
>
  <header class="flex min-h-8 items-center gap-1 ps-1">
    <h2 class="min-w-0 flex-1 truncate text-sm font-semibold">
      {m.panel_tasks()}
    </h2>
    {#if hasDone}
      <button type="button" class="btn btn-ghost btn-xs" onclick={editor.clearDone}>
        {m.panel_task_clear_done()}
      </button>
    {/if}
  </header>
  <form onsubmit={add}>
    <input
      class="input input-sm w-full"
      placeholder={m.panel_task_add()}
      aria-label={m.panel_task_add()}
      disabled={!editor.ready}
      bind:value={title}
    />
  </form>
  {#if editor.tasks.length === 0}
    <p class="px-1 py-2 text-sm text-base-content/55">{m.panel_task_empty()}</p>
  {:else}
    <ul class="flex flex-col gap-0.5">
      {#each editor.tasks as task (keyOf(task))}
        <li
          class={[
            "flex min-h-8 items-center gap-2 rounded-field px-2",
            "transition-colors duration-140 hover:bg-base-content/8",
          ]}
        >
          <input
            type="checkbox"
            class="checkbox checkbox-sm"
            checked={task.done}
            aria-label={task.title}
            onchange={e => editor.changeTask(task, { done: e.currentTarget.checked })}
          />
          {#if editing === keyOf(task)}
            <form
              class="flex min-w-0 flex-1 items-center gap-1"
              onsubmit={e => {
                e.preventDefault()
                commit(task, e.currentTarget)
              }}
              onfocusout={e => {
                const next = e.relatedTarget

                if (!(next instanceof Node && e.currentTarget.contains(next))) {
                  commit(task, e.currentTarget)
                }
              }}
              {@attach node =>
                on(node, "keydown", e => {
                  if (e.key === "Escape") {
                    e.preventDefault()
                    e.stopPropagation()
                    editing = null
                  }
                })}
            >
              <input
                name="title"
                class="input input-xs min-w-0 flex-1"
                aria-label={m.calendar_field_title()}
                value={task.title}
                required
                {@attach el => el.select()}
              />
              <input
                name="due"
                type="date"
                class="input input-xs w-32 tabular-nums"
                aria-label={m.panel_task_due()}
                value={task.due ?? ""}
              />
            </form>
          {:else}
            <button
              type="button"
              class="flex min-w-0 flex-1 cursor-pointer items-center gap-2 py-1 text-start"
              onclick={() => (editing = keyOf(task))}
              oncontextmenu={e => menu(e, task)}
            >
              <span
                class={[
                  "min-w-0 flex-1 truncate text-sm",
                  task.done && "text-base-content/40 line-through",
                ]}
                title={task.title}
              >
                {task.title}
              </span>
              <span
                class={[
                  "w-20 shrink-0 text-end text-xs whitespace-nowrap tabular-nums",
                  overdue(task)
                    ? "text-error"
                    : "text-base-content/55",
                ]}
              >
                {task.due ? dueLabel(task.due) : ""}
              </span>
            </button>
          {/if}
        </li>
      {/each}
    </ul>
  {/if}
  <ErrorAlert message={editor.tasking.failure} />
</section>
