<script lang="ts">
import Icon from "@iconify/svelte"
import { agents, providerOf } from "#lib/agents/agents.svelte.ts"
import { toAttachment } from "#lib/chat/attachments.ts"
import { chats } from "#lib/chat/chats.svelte.ts"
import {
  agentOf,
  deliver,
  groups,
  isChat,
  nameOf,
  viewOf,
} from "#lib/chat/groups.svelte.ts"
import {
  handleOf,
  mentionsIn,
  promptFor,
  relayOf,
  repliesFor,
} from "#lib/chat/groupTimeline.ts"
import { chatFor } from "#lib/chat/live.svelte.ts"
import type { Suggestion } from "#lib/chat/mentions.ts"
import { pinToggles, stickBottom } from "#lib/chat/scroll.ts"
import { segmentsOf } from "#lib/chat/session.ts"
import FolderPicker from "#lib/components/shell/FolderPicker.svelte"
import { Attempt } from "#lib/components/ui/attempt.svelte.ts"
import EmptyState from "#lib/components/ui/EmptyState.svelte"
import ErrorAlert from "#lib/components/ui/ErrorAlert.svelte"
import IconButton from "#lib/components/ui/IconButton.svelte"
import MenuItem from "#lib/components/ui/MenuItem.svelte"
import { menuKeys } from "#lib/components/ui/menu.ts"
import Popover from "#lib/components/ui/Popover.svelte"
import { hostById, hostList, LOCAL } from "#lib/p2p/hosts.svelte.ts"
import { m } from "#lib/paraglide/messages.js"
import type { GroupMember } from "#lib/store/local.svelte.ts"
import { describe } from "#lib/store/recent.ts"
import AgentReply from "./AgentReply.svelte"
import Composer from "./Composer.svelte"
import { BUBBLE } from "./labels.ts"
import PlanCard from "./PlanCard.svelte"
import RunningStatus from "./RunningStatus.svelte"
import ThoughtNote from "./ThoughtNote.svelte"
import ToolGroup from "./ToolGroup.svelte"
import UiBlocks from "./UiBlocks.svelte"

let { id }: { id: string } = $props()

const attempt = new Attempt()

const group = $derived(groups.find(id))

let picking = $state(false)

const infoOf = (member: GroupMember) =>
  describe(
    isChat(member)
      ? { kind: "chat", id: member.id }
      : { kind: "session", host: member.host, id: member.id },
  )

groups.watch()

const nameById = (id: string) => {
  const member = group?.members.find(p => p.id === id)

  return member ? nameOf(member) : id
}

$effect(() => {
  for (const member of group?.members ?? []) {
    const host = isChat(member) ? undefined : hostById(member.host)

    if (host && !host.views[member.id]) {
      host.open(member.id).catch(() => {})
    }
  }
})

const members = (query: string): Suggestion[] =>
  (group?.members ?? [])
    .map(member => {
      const name = nameOf(member)

      return {
        token: `@${handleOf(name)}`,
        label: name,
        detail: infoOf(member)?.source ?? "",
        icon: infoOf(member)?.icon ?? "lucide:bot",
        mention: { kind: "member" as const, id: member.id, title: name },
      }
    })
    .filter(s => s.label.toLowerCase().includes(query))

const invitable = $derived(
  agents.list.map(agent => ({ agent, provider: providerOf(agent) })),
)

const folderHost = $derived(hostById(group?.members[0]?.host ?? LOCAL) ?? hostList()[0]?.view)

const send = (text: string, files: File[]) =>
  attempt.run(async () => {
    if (!group) {
      return
    }

    const attachments = await Promise.all(files.map(toAttachment))
    const targets = mentionsIn(text, group.members, nameOf)
    const prompts = group.members
      .filter(member => !targets.length || targets.includes(member.id))
      .map(member => ({
        member,
        text: promptFor(
          group,
          member,
          text,
          viewOf,
          nameOf,
          agentOf(member),
        ),
      }))

    await groups.post(group.id, text, targets)

    await Promise.all(
      prompts.map(({ member, text: prompt }) => deliver(member, prompt, attachments)),
    )
  })

$effect(() => {
  const first = group && groups.opening.get(group.id)

  if (group && first) {
    groups.opening.delete(group.id)
    send(first.text, first.files)
  }
})

const running = $derived(group?.members.some(p => viewOf(p)?.running) ?? false)

const sharedFolder = $derived.by(() => {
  const seen = new Map<string, number>()

  for (const member of group?.members ?? []) {
    const cwd = viewOf(member)?.cwd

    if (cwd) {
      seen.set(cwd.toLowerCase(), (seen.get(cwd.toLowerCase()) ?? 0) + 1)
    }
  }

  return [...seen.values()].some(count => count > 1)
})

const stop = () => {
  if (group) {
    groups.halt(group)
  }

  for (const member of group?.members ?? []) {
    const stored = isChat(member) ? chats.find(member.id) : undefined

    if (stored) {
      chatFor(stored).stop()
    } else if (viewOf(member)?.running) {
      hostById(member.host)?.cancel(member.id).catch(() => {})
    }
  }
}
</script>

{#if group}
  <div class="flex min-h-0 flex-1 flex-col">
    <section
      class="flex shrink-0 flex-wrap items-center gap-1.5 px-4 py-2"
      aria-label={m.group_members()}
    >
      {#each group.members as member (member.id)}
        {@const info = infoOf(member)}
        <span class="badge badge-soft h-7 max-w-56 min-w-0 gap-1.5 ps-2 pe-1">
          <Icon icon={info?.icon ?? "lucide:bot"} class="size-3.5 shrink-0" />
          <span class="min-w-0 truncate">{nameOf(member)}</span>
          <button
            type="button"
            class={[
              "badge badge-xs cursor-pointer",
              member.role === "reviewer" ? "badge-warning" : "badge-ghost",
            ]}
            title={m.group_role_toggle()}
            onclick={() =>
              groups.setRole(
                group.id,
                member.id,
                member.role === "reviewer" ? "worker" : "reviewer",
              )}
          >
            {member.role === "reviewer" ? m.group_role_reviewer() : m.group_role_worker()}
          </button>
          {#if viewOf(member)?.running}
            <span class="loading loading-spinner loading-xs text-primary"></span>
          {/if}
          <IconButton
            icon="lucide:x"
            label={m.group_remove_member({ name: nameOf(member) })}
            size="xs"
            shape="circle"
            iconClass="size-3"
            onclick={() => groups.leave(group.id, member.id)}
          />
        </span>
      {/each}
      {#if running}
        <button type="button" class="btn btn-ghost btn-sm font-normal text-error" onclick={stop}>
          <Icon icon="lucide:square" class="size-3.5" />
          {m.group_stop_all()}
        </button>
      {/if}
      {#if folderHost}
        <FolderPicker
          host={folderHost}
          value={group.cwd ?? folderHost.state?.home ?? ""}
          onpick={cwd => groups.setFolder(group.id, cwd)}
        />
      {/if}
      <Popover label={m.group_add_member()} placement="bottom-start" width="w-72" bind:open={picking}>
        {#snippet trigger(p)}
          <button {...p} type="button" class="btn btn-ghost btn-sm font-normal">
            <Icon icon="lucide:user-plus" class="size-4" />
            {m.group_add_member()}
          </button>
        {/snippet}
        <div role="menu" tabindex="-1" class="flex max-h-80 flex-col overflow-y-auto" {@attach menuKeys}>
          {#each invitable as { agent, provider } (agent.id)}
            <MenuItem
              icon={provider?.icon ?? "lucide:bot"}
              label={agent.name}
              hint={provider?.label}
              disabled={!provider}
              onclick={() => {
                picking = false
                attempt.run(() => groups.inviteAgent(group.id, agent))
              }}
            />
          {:else}
            <MenuItem label={m.group_no_candidates()} disabled />
          {/each}
        </div>
      </Popover>
    </section>
    {#if sharedFolder}
      <p class="mx-4 mb-1 flex items-center gap-2 text-xs text-warning">
        <Icon icon="lucide:triangle-alert" class="size-3.5 shrink-0" />
        {m.group_shared_folder()}
      </p>
    {/if}
    {#if group.messages.length === 0}
      <EmptyState
        centered
        icon="lucide:users"
        title={m.group_empty_title()}
        text={group.members.length ? m.group_empty_text() : m.group_empty_members()}
      />
    {:else}
      <div
        class="scroll-centered flex min-h-0 flex-1 flex-col-reverse overflow-y-auto"
        {@attach pinToggles}
        {@attach stickBottom}
      >
        <div class="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 py-6">
          {#each group.messages as message, index (message.id)}
            {@const relay = relayOf(message)}
            {#if relay}
              <p class="flex min-w-0 items-center gap-1.5 self-center text-xs text-base-content/55">
                <Icon icon="lucide:forward" class="size-3.5 shrink-0 text-primary" />
                <span class="min-w-0 truncate">
                  {m.relay_marker({
                    from: nameById(relay.from),
                    to: (message.targets ?? []).map(nameById).join(", "),
                  })}
                </span>
              </p>
            {:else}
              <div class={[BUBBLE, "self-end"]}>{message.text}</div>
            {/if}
            {#each repliesFor(group, index, viewOf) as reply (reply.member.id)}
              {@const view = viewOf(reply.member)}
              {@const info = infoOf(reply.member)}
              {@const last = index === group.messages.length - 1}
              <section class="flex min-w-0 flex-col gap-2" aria-label={nameOf(reply.member)}>
                <p class="flex min-w-0 items-center gap-1.5 text-xs font-medium text-base-content/60">
                  <Icon icon={info?.icon ?? "lucide:bot"} class="size-3.5 shrink-0" />
                  <span class="min-w-0 truncate">{nameOf(reply.member)}</span>
                </p>
                {#if reply.waiting}
                  <p class="text-xs text-base-content/50">{m.group_waiting()}</p>
                {:else}
                  {#each segmentsOf(reply.items) as segment, i (segment.key)}
                    {#if segment.kind === "activity"}
                      <ToolGroup items={segment.items} latest={last && i === segmentsOf(reply.items).length - 1} />
                    {:else if segment.item.type === "agent"}
                      <AgentReply text={segment.item.text} pace={segment.item.pace} onAction={text => send(text, [])} onSave={async () => {}} />
                    {:else if segment.item.type === "thought"}
                      <ThoughtNote text={segment.item.text} />
                    {:else if segment.item.type === "plan"}
                      <PlanCard entries={segment.item.entries} />
                    {:else if segment.item.type === "ui"}
                      <UiBlocks blocks={segment.item.blocks} onAction={text => send(text, [])} onSave={async () => {}} />
                    {/if}
                  {/each}
                {/if}
                {#if last && view?.running}
                  <RunningStatus since={view.since} tokens={view.tokens} agents={view.agents} />
                {/if}
              </section>
            {/each}
          {/each}
          <ErrorAlert message={attempt.failure} />
        </div>
      </div>
    {/if}
    <Composer
      busy={false}
      draft={`group:${group.id}`}
      people={members}
      disabled={group.members.length === 0}
      placeholder={group.members.length ? m.group_placeholder_mention() : m.group_empty_members()}
      onSend={send}
      onStop={stop}
    />
  </div>
{/if}
