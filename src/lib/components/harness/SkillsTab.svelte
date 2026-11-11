<script lang="ts">
import Icon from "@iconify/svelte"
import { Attempt } from "#lib/components/ui/attempt.svelte.ts"
import ErrorAlert from "#lib/components/ui/ErrorAlert.svelte"
import type { Skill } from "#lib/p2p/protocol.ts"
import { m } from "#lib/paraglide/messages.js"
import DocEditor from "./DocEditor.svelte"

let {
  skills,
  onWrite,
  onRemove,
}: {
  skills: Skill[]
  onWrite: (name: string, content: string) => Promise<unknown>
  onRemove: (name: string) => Promise<unknown>
} = $props()

const attempt = new Attempt()

let selected = $state<string | null>(null)

let name = $state("")

let removing = $state(false)

const current = $derived(
  skills.find(s => s.name === selected) ?? skills[0] ?? null,
)

const template = (skill: string) =>
  `---\nname: ${skill}\ndescription: ${m.harness_skill_template()}\n---\n\n`

const create = () =>
  attempt.run(async () => {
    const skill = name.trim()

    await onWrite(skill, template(skill))
    selected = skill
    name = ""
  })

const remove = () => {
  if (!current) {
    return
  }

  if (!removing) {
    removing = true

    return
  }

  attempt.run(() => onRemove(current.name))
  removing = false
  selected = null
}
</script>

<div class="flex min-h-0 flex-1 gap-4 max-md:flex-col">
  <div class="flex w-56 shrink-0 flex-col gap-2 max-md:w-full">
    <form
      class="flex gap-1"
      onsubmit={e => {
        e.preventDefault()
        create()
      }}
    >
      <input
        class="input input-sm min-w-0 flex-1"
        placeholder={m.harness_new_skill()}
        aria-label={m.harness_new_skill()}
        bind:value={name}
      />
      <button
        type="submit"
        class="btn btn-sm btn-square"
        aria-label={m.harness_add_skill()}
        disabled={!name.trim() || attempt.busy}
      >
        <Icon icon="lucide:plus" class="size-4" />
      </button>
    </form>
    <ul class="menu w-full rounded-box border border-base-300 p-1">
      {#each skills as skill (skill.name)}
        <li>
          <button
            type="button"
            class={["min-w-0", current?.name === skill.name && "menu-active"]}
            onclick={() => {
              selected = skill.name
              removing = false
            }}
          >
            <span class="min-w-0 truncate">{skill.name}</span>
          </button>
        </li>
      {:else}
        <li class="px-3 py-2 text-sm text-base-content/60">{m.harness_no_skills()}</li>
      {/each}
    </ul>
    <ErrorAlert message={attempt.failure} />
  </div>
  {#if current}
    <div class="flex min-h-0 min-w-0 flex-1 flex-col gap-2">
      <div class="flex items-center gap-2">
        <h3 class="min-w-0 flex-1 truncate font-medium">{current.name}</h3>
        <button
          type="button"
          class={["btn btn-ghost btn-sm", removing && "text-error"]}
          onclick={remove}
          onblur={() => {
            removing = false
          }}
        >
          <Icon icon="lucide:trash-2" class="size-4" />
          {removing ? m.common_confirm_delete() : m.common_delete()}
        </button>
      </div>
      {#key current.name}
        <DocEditor
          file="skills/{current.name}/SKILL.md"
          content={current.content}
          onSave={content => onWrite(current.name, content)}
        />
      {/key}
    </div>
  {/if}
</div>
