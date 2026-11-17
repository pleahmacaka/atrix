import { openAgent, primers } from "#lib/agents/agents.svelte.ts"
import { hostById } from "#lib/p2p/hosts.svelte.ts"
import { m } from "#lib/paraglide/messages.js"
import {
  local,
  type StoredAgent,
  type StoredGroup,
} from "#lib/store/local.svelte.ts"
import { CHAT_HOST, chatViewOf } from "#lib/voice/chatCall.ts"

const userCount = (host: string, id: string) =>
  (host === CHAT_HOST
    ? chatViewOf(id)
    : hostById(host)?.views[id]
  )?.items.filter(i => i.type === "user").length ?? 0

class Groups {
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

    const opened = await openAgent(agent, group.cwd)
    const same = group.members.filter(p => p.agent === agent.id).length
    const label = same ? `${agent.name} ${same + 1}` : agent.name

    if (opened.kind === "chat") {
      await this.join(groupId, CHAT_HOST, opened.id, label, agent.id)

      return
    }

    primers.set(opened.id, "")
    await this.join(groupId, opened.host, opened.id, label, agent.id)
  }

  invite = async (
    groupId: string,
    host: string,
    harness: { id: string; name: string },
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

    if (group) {
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

    group.messages.push({
      id: crypto.randomUUID(),
      text,
      at: Date.now(),
      ...(targets?.length && { targets }),
    })
    group.at = Date.now()

    if (group.messages.length === 1) {
      group.title = text.slice(0, 60)
    }

    await local.save()
  }

  remove = async (id: string) => {
    local.data.groups = local.data.groups.filter(g => g.id !== id)
    await local.save()
  }
}

export const groups = new Groups()
