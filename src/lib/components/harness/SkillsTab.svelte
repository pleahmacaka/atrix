<script lang="ts">
import { Attempt } from "#lib/components/ui/attempt.svelte.ts"
import ConfirmButton from "#lib/components/ui/ConfirmButton.svelte"
import EmptyState from "#lib/components/ui/EmptyState.svelte"
import ErrorAlert from "#lib/components/ui/ErrorAlert.svelte"
import IconButton from "#lib/components/ui/IconButton.svelte"
import IconInput from "#lib/components/ui/IconInput.svelte"
import MenuItem from "#lib/components/ui/MenuItem.svelte"
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

const remove = (skill: string) =>
  attempt.run(async () => {
    await onRemove(skill)
    selected = null
  })
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
      <IconInput
        icon="lucide:sparkles"
        label={m.harness_new_skill()}
        placeholder={m.harness_new_skill()}
        ghost={false}
        class="min-w-0 flex-1"
        bind:value={name}
      />
      <IconButton
        type="submit"
        icon="lucide:plus"
        label={m.harness_add_skill()}
        tone="plain"
        disabled={!name.trim() || attempt.busy}
      />
    </form>
    <div
      class={[
        "flex flex-col gap-0.5 overflow-y-auto rounded-box border border-base-300",
        "bg-base-100 p-1 max-md:max-h-48",
      ]}
      role="menu"
      aria-label={m.harness_skills()}
    >
      {#each skills as skill (skill.name)}
        <MenuItem
          label={skill.name}
          selected={current?.name === skill.name}
          aria-current={current?.name === skill.name ? "true" : undefined}
          onclick={() => {
            selected = skill.name
          }}
        />
      {:else}
        <EmptyState icon="lucide:sparkles" text={m.harness_no_skills()} />
      {/each}
    </div>
    <ErrorAlert message={attempt.failure} />
  </div>
  {#if current}
    <div class="flex min-h-0 min-w-0 flex-1 flex-col gap-2">
      <div class="flex items-center gap-2">
        <h3 class="min-w-0 flex-1 truncate font-medium" title={current.name}>
          {current.name}
        </h3>
        {#key current.name}
          <ConfirmButton
            label={m.common_delete()}
            disabled={attempt.busy}
            onconfirm={() => remove(current.name)}
          />
        {/key}
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
