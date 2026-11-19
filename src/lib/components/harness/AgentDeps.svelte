<script lang="ts">
import Icon from "@iconify/svelte"
import { ATRIX_TOOLS, BRIDGE_NAME } from "#lib/acp/toolNames.ts"
import { dependencies, type Provider } from "#lib/agents/agents.svelte.ts"
import type { Dep } from "#lib/agents/compose.ts"
import { byOrigin, SHARED, sameSkill, sameTool, sourceLabel, toolName } from "#lib/agents/sources.ts"
import IconButton from "#lib/components/ui/IconButton.svelte"
import MenuItem from "#lib/components/ui/MenuItem.svelte"
import MenuLabel from "#lib/components/ui/MenuLabel.svelte"
import Popover from "#lib/components/ui/Popover.svelte"
import { hoverTip } from "#lib/components/ui/tooltip.ts"
import { hostById } from "#lib/p2p/hosts.svelte.ts"
import type { GlobalItems, GlobalSkill, GlobalTool, McpServer, SkillRef, ToolRef } from "#lib/p2p/protocol.ts"
import { m } from "#lib/paraglide/messages.js"
import type { Requires } from "#lib/store/local.svelte.ts"
import ServerDialog from "./ServerDialog.svelte"
import SkillDialog from "./SkillDialog.svelte"

let {
  provider,
  cwd,
  instructions,
  requires = {},
  skills = $bindable([]),
  tools = $bindable([]),
}: {
  provider: Provider | undefined
  cwd: string
  instructions: string
  requires?: Requires
  skills?: SkillRef[]
  tools?: ToolRef[]
} = $props()

const ATRIX_TOOL_SET = new Set<string>(ATRIX_TOOLS)

const harness = $derived(provider?.kind === "harness" ? provider : null)

const view = $derived(harness ? hostById(harness.host) : undefined)

const listing = $derived(view?.state?.available.find(a => a.id === harness?.harness))

const takesSkills = $derived(listing?.skills ?? false)

let found = $state<GlobalItems>({ skills: [], tools: [] })

let skillMenu = $state(false)

let toolMenu = $state(false)

let skillOpen = $state(false)

let serverOpen = $state(false)

let editing = $state<number | null>(null)

$effect(() => {
  const target = view
  const project = cwd || null

  found = { skills: [], tools: [] }

  if (!target) {
    return
  }

  let live = true

  target
    .globalItems(project)
    .then(items => {
      if (live) {
        found = items
      }
    })
    .catch(() => {})

  return () => {
    live = false
  }
})

const ownerName = (owner: string) =>
  owner === SHARED
    ? m.agent_source_shared()
    : (view?.state?.available.find(a => a.id === owner)?.name ?? owner)

const skillGroups = $derived(byOrigin(found.skills, ownerName))

const toolGroups = $derived(byOrigin(found.tools, ownerName))

const skillNames = $derived(skills.map(s => s.name))

const toolNames = $derived([BRIDGE_NAME, ...tools.map(toolName)])

const editedSkill = $derived.by(() => {
  const ref = editing === null ? undefined : skills[editing]

  return ref?.source === "atrix" ? { name: ref.name, content: ref.content } : null
})

const editedServer = $derived.by(() => {
  const ref = editing === null ? undefined : tools[editing]

  return ref?.source === "atrix" ? ref.server : null
})

const others = (names: string[], current: string | undefined) => names.filter(n => n !== current)

const toggleSkill = (skill: GlobalSkill) => {
  skills = skills.some(r => sameSkill(r, skill))
    ? skills.filter(r => !sameSkill(r, skill))
    : [...skills, { source: "global", ...skill }]
}

const toggleTool = (tool: GlobalTool) => {
  tools = tools.some(r => sameTool(r, tool))
    ? tools.filter(r => !sameTool(r, tool))
    : [...tools, { source: "global", ...tool }]
}

const saveSkill = (owned: { name: string; content: string }) => {
  const ref: SkillRef = { source: "atrix", ...owned }

  skills = editing === null ? [...skills, ref] : skills.with(editing, ref)
}

const saveServer = (server: McpServer) => {
  const ref: ToolRef = { source: "atrix", server }

  tools = editing === null ? [...tools, ref] : tools.with(editing, ref)
}

const removeAt = <T>(list: T[], index: number | null) =>
  index === null ? list : list.filter((_, i) => i !== index)

const openSkill = (index: number | null) => {
  skillMenu = false
  editing = index
  skillOpen = true
}

const openServer = (index: number | null) => {
  toolMenu = false
  editing = index
  serverOpen = true
}

const deps = $derived(dependencies({ instructions, requires }))

const satisfied = (dep: Dep) => {
  switch (dep.kind) {
    case "tools":
      return ATRIX_TOOL_SET.has(dep.name)
    case "skills":
      return skillNames.includes(dep.name)
    case "mcp":
      return toolNames.includes(dep.name)
  }
}

const missing = $derived(deps.filter(d => !satisfied(d)))

const candidate = (dep: Dep) => {
  if (dep.kind === "skills") {
    const skill = found.skills.find(s => s.name === dep.name)

    return skill && (() => toggleSkill(skill))
  }

  if (dep.kind === "mcp") {
    const tool = found.tools.find(t => t.name === dep.name)

    return tool && (() => toggleTool(tool))
  }

  return undefined
}

const ICONS: Record<Dep["kind"], string> = {
  skills: "lucide:sparkles",
  tools: "lucide:wrench",
  mcp: "lucide:plug",
}
</script>

{#snippet row(
  icon: string,
  name: string,
  source: string,
  owned: boolean,
  edit: (() => void) | null,
  remove: (() => void) | null,
)}
  <div class="flex min-h-8 min-w-0 items-center gap-2 px-1 text-sm">
    <Icon {icon} class="size-4 shrink-0 opacity-70" />
    {#if edit}
      <button
        type="button"
        class={[
          "min-w-0 flex-1 cursor-pointer truncate text-start",
          "transition-colors duration-140 hover:text-primary",
        ]}
        title={m.agent_item_edit({ name })}
        onclick={edit}
      >
        {name}
      </button>
    {:else}
      <span class="min-w-0 flex-1 truncate" title={name}>{name}</span>
    {/if}
    <span
      class={[
        "badge badge-sm w-32 shrink-0 justify-start gap-1",
        owned ? "badge-soft badge-primary" : "badge-ghost",
      ]}
      {@attach hoverTip(() => (owned ? m.agent_source_atrix_tip() : m.agent_source_global_tip()), "bottom-end")}
    >
      {#if !owned}
        <Icon icon="lucide:lock" class="size-3 shrink-0" />
      {/if}
      <span class="min-w-0 truncate">{source}</span>
    </span>
    {#if remove}
      <IconButton icon="lucide:x" label={m.dep_remove({ name })} size="xs" onclick={remove} />
    {:else}
      <span class="size-6 shrink-0"></span>
    {/if}
  </div>
{/snippet}

{#snippet header(icon: string, title: string, tip: string)}
  <span
    class="flex min-w-0 flex-1 items-center gap-1.5 px-1 text-xs text-base-content/60"
    {@attach hoverTip(() => tip, "bottom-start")}
  >
    <Icon {icon} class="size-3.5 shrink-0" />
    <span class="truncate">{title}</span>
  </span>
{/snippet}

<div class="flex flex-col gap-2">
  {#if !harness}
    <p class="px-1 text-xs text-base-content/60">{m.agent_deps_harness_only()}</p>
  {:else}
    <div class="flex flex-col gap-1 rounded-box border border-base-300 bg-base-100 p-2">
      <div class="flex items-center gap-1">
        {@render header("lucide:sparkles", m.dep_skills(), m.agent_skills_tip())}
        {#if !takesSkills}
          <span class="badge badge-ghost badge-sm shrink-0">{m.dep_unsupported()}</span>
        {/if}
        <Popover label={m.harness_add_skill()} placement="bottom-end" bind:open={skillMenu}>
          {#snippet trigger(p)}
            <IconButton {...p} icon="lucide:plus" label={m.harness_add_skill()} size="xs" disabled={!takesSkills} />
          {/snippet}
          <div class="flex w-72 flex-col" role="menu" aria-label={m.harness_add_skill()}>
            <MenuLabel text={m.agent_source_atrix()} />
            <MenuItem icon="lucide:plus" label={m.agent_skill_new()} onclick={() => openSkill(null)} />
            {#each skillGroups as group (group.label)}
              <MenuLabel text={group.label} />
              {#each group.entries as skill (skill.dir)}
                {@const picked = skills.some(r => sameSkill(r, skill))}
                <MenuItem
                  icon="lucide:sparkles"
                  label={skill.name}
                  checked={picked}
                  disabled={!picked && skillNames.includes(skill.name)}
                  onclick={() => toggleSkill(skill)}
                />
              {/each}
            {:else}
              <p class="px-2 py-1.5 text-xs text-base-content/50">{m.agent_global_none()}</p>
            {/each}
          </div>
        </Popover>
      </div>
      {#each skills as skill, i (skill.source === "atrix" ? `atrix:${skill.name}` : skill.dir)}
        {@render row(
          "lucide:sparkles",
          skill.name,
          sourceLabel(skill, ownerName),
          skill.source === "atrix",
          skill.source === "atrix" ? () => openSkill(i) : null,
          () => (skills = removeAt(skills, i)),
        )}
      {/each}
    </div>

    <div class="flex flex-col gap-1 rounded-box border border-base-300 bg-base-100 p-2">
      <div class="flex items-center gap-1">
        {@render header("lucide:plug", m.dep_mcp(), m.agent_servers_tip())}
        <Popover label={m.agent_server_add()} placement="bottom-end" bind:open={toolMenu}>
          {#snippet trigger(p)}
            <IconButton {...p} icon="lucide:plus" label={m.agent_server_add()} size="xs" />
          {/snippet}
          <div class="flex w-72 flex-col" role="menu" aria-label={m.agent_server_add()}>
            <MenuLabel text={m.agent_source_atrix()} />
            <MenuItem icon="lucide:plus" label={m.agent_server_new()} onclick={() => openServer(null)} />
            {#each toolGroups as group (group.label)}
              <MenuLabel text={group.label} />
              {#each group.entries as tool (`${tool.path}#${tool.name}`)}
                {@const picked = tools.some(r => sameTool(r, tool))}
                <MenuItem
                  icon="lucide:plug"
                  label={tool.name}
                  checked={picked}
                  disabled={!picked && toolNames.includes(tool.name)}
                  onclick={() => toggleTool(tool)}
                />
              {/each}
            {:else}
              <p class="px-2 py-1.5 text-xs text-base-content/50">{m.agent_global_none()}</p>
            {/each}
          </div>
        </Popover>
      </div>
      {@render row("lucide:plug", BRIDGE_NAME, m.agent_source_atrix(), true, null, null)}
      {#each tools as tool, i (tool.source === "atrix" ? `atrix:${tool.server.name}` : `${tool.path}#${tool.name}`)}
        {@render row(
          "lucide:plug",
          toolName(tool),
          sourceLabel(tool, ownerName),
          tool.source === "atrix",
          tool.source === "atrix" ? () => openServer(i) : null,
          () => (tools = removeAt(tools, i)),
        )}
      {/each}
    </div>
  {/if}

  {#if missing.length}
    <div class="flex flex-col gap-1 rounded-box border border-base-300 bg-base-100 p-2">
      {@render header("lucide:list-checks", m.dependencies(), m.agent_deps_tip())}
      {#each missing as dep (`${dep.kind}:${dep.name}`)}
        {@const add = harness ? candidate(dep) : undefined}
        <div class="flex min-h-8 min-w-0 items-center gap-2 px-1 text-sm">
          <Icon icon={ICONS[dep.kind]} class="size-4 shrink-0 opacity-70" />
          <span class="min-w-0 truncate">{dep.name}</span>
          <span class="min-w-0 flex-1 truncate text-xs text-base-content/50">
            {dep.from.length ? m.dep_from({ names: dep.from.join(", ") }) : ""}
          </span>
          {#if add}
            <button type="button" class="btn btn-xs shrink-0" onclick={add}>
              <Icon icon="lucide:download" class="size-3.5" />
              {m.agent_import()}
            </button>
          {:else}
            <span
              class={["badge badge-soft badge-sm shrink-0", dep.kind === "tools" ? "badge-neutral" : "badge-error"]}
            >
              {dep.kind === "tools" ? m.dep_unverified() : m.dep_missing()}
            </span>
          {/if}
        </div>
      {/each}
    </div>
  {/if}
</div>

<SkillDialog
  bind:open={skillOpen}
  skill={editedSkill}
  taken={others(skillNames, editedSkill?.name)}
  onsave={saveSkill}
  onremove={() => (skills = removeAt(skills, editing))}
/>

<ServerDialog
  bind:open={serverOpen}
  server={editedServer}
  taken={others(toolNames, editedServer?.name)}
  onsave={saveServer}
  onremove={() => (tools = removeAt(tools, editing))}
/>
