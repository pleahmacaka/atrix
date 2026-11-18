import {
  agentInstructions,
  agents,
  openAgent,
} from "#lib/agents/agents.svelte.ts"
import { matchChoice } from "#lib/components/chat/models.ts"
import { logFailure } from "#lib/logging.ts"
import { hostById } from "#lib/p2p/hosts.svelte.ts"
import type { HostView } from "#lib/p2p/hostView.svelte.ts"
import type { Attachment } from "#lib/p2p/protocol.ts"
import { m } from "#lib/paraglide/messages.js"
import {
  type GroupMember,
  type GroupMessage,
  local,
  type StoredAgent,
  type StoredGroup,
} from "#lib/store/local.svelte.ts"
import { CHAT_HOST, chatViewOf } from "#lib/voice/chatCall.ts"
import { chats } from "./chats.svelte.ts"
import {
  addressed,
  keptText,
  MAX_MEMBERS,
  mentionsIn,
  RELAY_BUDGET,
  RELAY_HOPS,
  type Relay,
  relayOf,
  relayPromptFor,
  relaysFrom,
  repliesFor,
  replyText,
  rootOf,
} from "./groupTimeline.ts"
import { chatFor } from "./live.svelte.ts"
import { enqueue } from "./queue.svelte.ts"

export type Choices = {
  options?: Record<string, string>
  model?: string
  effort?: string
}

const userCount = (host: string, id: string) =>
  (host === CHAT_HOST
    ? chatViewOf(id)
    : hostById(host)?.views[id]
  )?.items.filter(i => i.type === "user").length ?? 0

export const isChat = (member: GroupMember) => member.host === CHAT_HOST

export const viewOf = (member: GroupMember) =>
  isChat(member)
    ? chatViewOf(member.id)
    : hostById(member.host)?.views[member.id]

export const nameOf = (member: GroupMember) =>
  member.label || viewOf(member)?.title || member.id

export const agentOf = (member: GroupMember) => {
  const agent = member.agent ? agents.find(member.agent) : undefined

  return agent ? agentInstructions(agent, viewOf(member)?.cwd ?? "") : ""
}

const runningOf = (member: GroupMember) => {
  const stored = isChat(member) ? chats.find(member.id) : undefined

  if (stored) {
    const { status } = chatFor(stored)

    return status === "submitted" || status === "streaming"
  }

  return !!hostById(member.host)?.views[member.id]?.running
}

const memberKey = (member: GroupMember) => `${member.host}:${member.id}`

export const applyChoices = async (
  view: HostView,
  id: string,
  choices: Choices,
) => {
  const config = () => view.views[id]?.config ?? []
  const options = choices.options ?? {}
  const covered = new Set<string>()

  for (const [configId, value] of Object.entries(options)) {
    const option = config().find(o => o.id === configId)

    if (option?.category) {
      covered.add(option.category)
    }

    if (option && value !== option.current) {
      await view.configure(id, configId, value)
    }
  }

  const wants: [string, string | undefined][] = [
    ["model", choices.model],
    ["thought_level", choices.effort],
  ]

  for (const [category, wanted] of wants) {
    const option = covered.has(category)
      ? undefined
      : config().find(o => o.category === category)
    const value =
      option && wanted ? matchChoice(option.values, wanted) : undefined

    if (option && value && value !== option.current) {
      await view.configure(id, option.id, value)
    }
  }
}

const chains = new Map<string, Promise<unknown>>()

const sendInOrder = (id: string, send: () => Promise<void>) => {
  const next = (chains.get(id) ?? Promise.resolve()).then(send)

  chains.set(
    id,
    next.catch(() => null),
  )

  return next
}

export const deliver = (
  member: GroupMember,
  prompt: string,
  attachments: Attachment[] = [],
) => {
  const stored = isChat(member) ? chats.find(member.id) : undefined

  if (stored) {
    const chat = chatFor(stored)

    return sendInOrder(member.id, () => chat.sendMessage({ text: prompt }))
  }

  const host = hostById(member.host)

  if (attachments.length > 0 && host) {
    return host.prompt(member.id, prompt, attachments)
  }

  enqueue(member.id, prompt)

  return null
}

class Groups {
  opening = new Map<string, { text: string; files: File[] }>()

  #watching = false

  #running = new Map<string, boolean>()

  #pending = new Set<string>()

  get list() {
    return local.data.groups.toSorted((a, b) => b.at - a.at)
  }

  find = (id: string) => local.data.groups.find(g => g.id === id)

  create = async () => {
    const group: StoredGroup = {
      id: crypto.randomUUID(),
      title: m.group_new_title(),
      members: [],
      messages: [],
      at: Date.now(),
    }

    local.data.groups.push(group)
    await local.save()

    return group.id
  }

  setFolder = async (groupId: string, cwd: string) => {
    const group = this.find(groupId)

    if (group) {
      group.cwd = cwd
      await local.save()
    }
  }

  inviteAgent = async (groupId: string, agent: StoredAgent) => {
    const group = this.find(groupId)

    if (!group) {
      return
    }

    if (group.members.length >= MAX_MEMBERS) {
      throw new Error(m.group_full({ count: MAX_MEMBERS }))
    }

    const opened = await openAgent(agent, group.cwd, { primed: false })
    const same = group.members.filter(p => p.agent === agent.id).length
    const label = same ? `${agent.name} ${same + 1}` : agent.name
    const host = opened.kind === "chat" ? CHAT_HOST : opened.host

    try {
      await this.join(groupId, host, opened.id, label, agent.id)
    } catch (e) {
      await (opened.kind === "chat"
        ? chats.remove(opened.id)
        : hostById(opened.host)?.close(opened.id))
      throw e
    }
  }

  invite = async (
    groupId: string,
    host: string,
    harness: { id: string; name: string },
    choices: Choices = {},
  ) => {
    const group = this.find(groupId)
    const view = hostById(host)

    if (!group || !view) {
      return
    }

    const id = await view.create(
      harness.id,
      group.cwd ?? view.state?.home ?? "",
    )

    if (!view.views[id]) {
      await view.open(id)
    }

    await applyChoices(view, id, choices)

    const same = group.members.filter(p =>
      p.label?.startsWith(harness.name),
    ).length

    await this.join(
      groupId,
      host,
      id,
      same ? `${harness.name} ${same + 1}` : harness.name,
    )
  }

  join = async (
    groupId: string,
    host: string,
    id: string,
    label?: string,
    agent?: string,
  ) => {
    const group = this.find(groupId)

    if (!group || group.members.some(p => p.host === host && p.id === id)) {
      return
    }

    if (group.members.length >= MAX_MEMBERS) {
      throw new Error(m.group_full({ count: MAX_MEMBERS }))
    }

    const view = host === CHAT_HOST ? undefined : hostById(host)

    if (view && !view.views[id]) {
      await view.open(id)
    }

    group.members.push({
      host,
      id,
      from: group.messages.length,
      offset: userCount(host, id),
      ...(label && { label }),
      ...(agent && { agent }),
    })
    await local.save()
  }

  leave = async (groupId: string, id: string) => {
    const group = this.find(groupId)
    const member = group?.members.find(p => p.id === id)

    if (group && member) {
      this.#keep(group, member)
      group.members = group.members.filter(p => p.id !== id)
      await local.save()
    }
  }

  setRole = async (
    groupId: string,
    id: string,
    role: "worker" | "reviewer",
  ) => {
    const member = this.find(groupId)?.members.find(p => p.id === id)

    if (member) {
      member.role = role
      await local.save()
    }
  }

  post = async (groupId: string, text: string, targets?: string[]) => {
    const group = this.find(groupId)

    if (!group) {
      return
    }

    const message: GroupMessage = {
      id: crypto.randomUUID(),
      text,
      at: Date.now(),
      ...(targets?.length && { targets }),
    }

    group.messages.push(message)
    group.at = Date.now()
    this.#expect(group, message)

    if (group.messages.length === 1) {
      group.title = text.slice(0, 60)
    }

    await local.save()
  }

  remove = async (id: string) => {
    local.data.groups = local.data.groups.filter(g => g.id !== id)
    await local.save()
  }

  halt = (group: StoredGroup) => {
    for (const message of group.messages) {
      for (const member of group.members) {
        this.#pending.delete(`${message.id}:${member.id}`)
      }
    }
  }

  #expect = (group: StoredGroup, message: GroupMessage) => {
    for (const member of group.members) {
      if (addressed(message, member)) {
        this.#pending.add(`${message.id}:${member.id}`)
      }
    }
  }

  watch = () => {
    if (this.#watching) {
      return
    }

    this.#watching = true

    $effect.root(() => {
      $effect(() => {
        for (const group of local.data.groups) {
          for (const member of group.members) {
            this.#observe(group, member)
          }
        }
      })
    })
  }

  #observe = (group: StoredGroup, member: GroupMember) => {
    const key = `${group.id}:${memberKey(member)}`
    const running = runningOf(member)
    const was = this.#running.get(key)

    this.#running.set(key, running)

    if (!was || running) {
      return
    }

    queueMicrotask(() => {
      this.#relay(group.id, member.id).catch((e: unknown) =>
        logFailure("room relay", e),
      )
    })
  }

  #keep = (group: StoredGroup, member: GroupMember) => {
    const name = nameOf(member)

    group.messages.forEach((message, index) => {
      const reply = repliesFor(group, index, viewOf).find(
        r => r.member.id === member.id && !r.waiting,
      )
      const text = reply && keptText(reply.items)

      if (text) {
        message.replies = [
          ...(message.replies ?? []).filter(r => r.member !== member.id),
          { member: member.id, name, text },
        ]
      }
    })
  }

  #answered = (group: StoredGroup, member: GroupMember) => {
    for (let i = group.messages.length - 1; i >= member.from; i--) {
      if (!addressed(group.messages[i], member)) {
        continue
      }

      const reply = repliesFor(group, i, viewOf).find(
        r => r.member.id === member.id,
      )

      if (reply && !reply.waiting) {
        return { index: i, reply }
      }
    }

    return null
  }

  #relay = async (groupId: string, memberId: string) => {
    const group = this.find(groupId)
    const member = group?.members.find(p => p.id === memberId)

    if (!group || !member) {
      return
    }

    const answered = this.#answered(group, member)

    if (!answered) {
      return
    }

    const source = group.messages[answered.index]
    const hop = (relayOf(source)?.hop ?? 0) + 1

    if (
      !this.#pending.delete(`${source.id}:${member.id}`) ||
      hop > RELAY_HOPS ||
      relaysFrom(group, rootOf(group, source)) >= RELAY_BUDGET
    ) {
      return
    }

    const text = replyText(answered.reply.items)
    const others = group.members.filter(p => p.id !== member.id)
    const targets = mentionsIn(text, others, nameOf, true)

    if (!text || targets.length === 0) {
      return
    }

    const message: GroupMessage & Relay = {
      id: crypto.randomUUID(),
      text,
      at: Date.now(),
      targets,
      from: member.id,
      source: source.id,
      hop,
    }

    group.messages.push(message)
    group.at = Date.now()
    this.#expect(group, message)
    await local.save()

    const from = nameOf(member)

    await Promise.all(
      others
        .filter(p => targets.includes(p.id))
        .map(p =>
          deliver(
            p,
            relayPromptFor(
              group,
              p,
              from,
              text,
              { viewOf, nameOf },
              agentOf(p),
            ),
          ),
        ),
    )
  }
}

export const groups = new Groups()
