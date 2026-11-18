<script lang="ts">
import Icon from "@iconify/svelte"
import { tick } from "svelte"
import { chats } from "#lib/chat/chats.svelte.ts"
import { groups } from "#lib/chat/groups.svelte.ts"
import { MAX_MEMBERS } from "#lib/chat/groupTimeline.ts"
import { peopleMatching } from "#lib/chat/mentions.ts"
import Composer from "#lib/components/chat/Composer.svelte"
import ModelEffort from "#lib/components/chat/ModelEffort.svelte"
import ModelInput from "#lib/components/chat/ModelInput.svelte"
import {
  efforts,
  matchChoice,
  OPTION_ICONS,
  PRIMARY,
  terminalChoices,
} from "#lib/components/chat/models.ts"
import { Attempt } from "#lib/components/ui/attempt.svelte.ts"
import ErrorAlert from "#lib/components/ui/ErrorAlert.svelte"
import IconSelect from "#lib/components/ui/IconSelect.svelte"
import MenuItem from "#lib/components/ui/MenuItem.svelte"
import { menuKeys } from "#lib/components/ui/menu.ts"
import Popover from "#lib/components/ui/Popover.svelte"
import Wheel from "#lib/components/ui/Wheel.svelte"
import { hostById, hostList } from "#lib/p2p/hosts.svelte.ts"
import type { ConfigChoice } from "#lib/p2p/protocol.ts"
import { m } from "#lib/paraglide/messages.js"
import { findGateway } from "#lib/store/gatewayCatalog.ts"
import { type Current, nav, openConversation, type Target } from "#lib/store/nav.svelte.ts"
import { panes, usePane } from "#lib/store/panes.svelte.ts"
import { CHAT_HOST } from "#lib/voice/chatCall.ts"
import { conversation } from "#lib/voice/conversation.svelte.ts"
import FolderPicker from "./FolderPicker.svelte"
import { GATEWAY, gatewayKey, harnessKey, targetsOf } from "./targets.ts"

const attempt = new Attempt()

const hosts = $derived(hostList())

const options = $derived(targetsOf(hosts))

const targetKey = $derived(
  nav.target.kind === "model"
    ? gatewayKey(nav.target.gateway)
    : harnessKey(nav.target.host, nav.target.harness),
)

const choose = (key: string) => {
  const [first, second] = key.split("\n")

  if (first === GATEWAY) {
    nav.target = {
      kind: "model",
      gateway: second,
      model:
        chats.list.find(c => c.gateway === second)?.model ??
        findGateway(second)?.model ??
        "",
    }

    return
  }

  nav.target = {
    kind: "harness",
    host: first,
    harness: second,
    cwd: hostById(first)?.state?.home ?? "",
  }
}

$effect(() => {
  if (options.length > 0 && !options.some(o => o.key === targetKey)) {
    choose(options[0].key)
  }
})

const chosen = $derived(options.find(o => o.key === targetKey))

let extras = $state<string[]>([])

let adding = $state(false)

const members = $derived(
  extras.flatMap(key => options.filter(o => o.key === key && key !== targetKey)),
)

const addable = $derived(
  members.length + 1 >= MAX_MEMBERS
    ? []
    : options.filter(o => o.key !== targetKey && !extras.includes(o.key)),
)

const room = $derived(members.length > 0)

const roomPeople = (query: string) =>
  peopleMatching(
    [chosen, ...members].flatMap(o =>
      o ? [{ id: o.key, name: o.label, detail: o.badge ?? "", icon: o.icon }] : [],
    ),
    query,
  )

const presets = $derived.by(() => {
  const target = nav.target

  if (target.kind !== "harness") {
    return []
  }

  const sample = Object.values(hostById(target.host)?.views ?? {}).find(
    v => v.harness === target.harness && v.config.length > 0,
  )

  return (sample?.config ?? []).filter(o => PRIMARY.includes(o.category ?? ""))
})

const picks = $state<Record<string, string>>({})

const targetHarness = $derived(
  nav.target.kind === "harness"
    ? hostById(nav.target.host)?.state?.harnesses.find(
        h => nav.target.kind === "harness" && h.id === nav.target.harness,
      )
    : undefined,
)

const base = $derived(targetHarness?.base)

const pinned = $derived(targetHarness?.providerActive ?? false)

const pinnedModel = $derived(
  pinned ? targetHarness?.provider?.model : undefined,
)

const modelOption = $derived(presets.find(o => o.category === "model"))

const effortOption = $derived(presets.find(o => o.category === "thought_level"))

const otherPresets = $derived(
  presets.filter(o => o !== modelOption && o !== effortOption),
)

const claude = $derived(base === "claude-acp")

const fallback = $derived(claude || base === "codex-acp")

let alias = $state("")

let level = $state("")

const presetKey = (option: ConfigChoice) => `${targetKey}:${option.id}`

const pickOf = (option: ConfigChoice) =>
  picks[presetKey(option)] ?? option.current

const pane = usePane()

const glide = (current: Current) => {
  const go = async () => {
    if (pane) {
      panes.open(current, pane())
    } else {
      openConversation(current)
    }

    await tick()
  }

  if (document.startViewTransition) {
    document.startViewTransition(go)
  } else {
    go()
  }
}

const startSession = async (target: Extract<Target, { kind: "harness" }>) => {
  const view = hostById(target.host)

  if (!view) {
    throw new Error(m.chat_no_device())
  }

  const id = await view.create(target.harness, target.cwd.trim())

  for (const option of presets) {
    const value = pickOf(option)

    if (value !== option.current) {
      await view.configure(id, option.id, value)
    }
  }

  const config = view.views[id]?.config ?? []
  const wants: [string | null, string][] = [
    [modelOption ? null : "model", alias],
    [effortOption ? null : "thought_level", level],
  ]

  for (const [category, wanted] of wants) {
    const option = category ? config.find(o => o.category === category) : undefined
    const value = option && wanted ? matchChoice(option.values, wanted) : undefined

    if (option && value && value !== option.current) {
      await view.configure(id, option.id, value)
    }
  }

  glide({ kind: "session", host: target.host, id })

  return { view, id }
}

const addMember = async (groupId: string, key: string) => {
  const option = options.find(o => o.key === key)
  const [first, second] = key.split("\n")

  if (!option) {
    return
  }

  if (first !== GATEWAY) {
    await groups.invite(
      groupId,
      first,
      { id: second, name: option.label },
      key === targetKey
        ? {
            options: Object.fromEntries(
              presets.filter(o => pickOf(o) !== o.current).map(o => [o.id, pickOf(o)]),
            ),
            model: modelOption ? undefined : alias,
            effort: effortOption ? undefined : level,
          }
        : {},
    )

    return
  }

  const model =
    nav.target.kind === "model" && key === targetKey
      ? nav.target.model
      : (findGateway(second)?.model ?? "")

  await groups.join(groupId, CHAT_HOST, chats.create(second, model), option.label)
}

const startRoom = async (text: string, files: File[]) => {
  const id = await groups.create()
  const cwd = nav.target.kind === "harness" ? nav.target.cwd.trim() : ""

  if (cwd) {
    await groups.setFolder(id, cwd)
  }

  for (const key of [targetKey, ...members.map(o => o.key)]) {
    await addMember(id, key)
  }

  if (text || files.length) {
    groups.opening.set(id, { text, files })
  }

  extras = []
  glide({ kind: "group", id })
}

const call = () =>
  attempt.run(async () => {
    if (room) {
      await startRoom("", [])

      return
    }

    const target = nav.target

    if (target.kind === "model") {
      const id = chats.create(target.gateway, target.model)

      glide({ kind: "chat", id })
      conversation.start(id, CHAT_HOST)

      return
    }

    const { id } = await startSession(target)

    conversation.start(id, target.host)
  })

const send = (text: string, files: File[]) =>
  attempt.run(async () => {
    if (room) {
      await startRoom(text, files)

      return
    }

    const target = nav.target

    if (target.kind === "model") {
      const id = chats.create(target.gateway, target.model)
      const stored = chats.find(id)
      const { chatFor } = await import("#lib/chat/live.svelte.ts")

      if (stored) {
        const { toFilePart } = await import("#lib/chat/attachments.ts")

        chatFor(stored).sendMessage({
          text,
          files: await Promise.all(files.map(toFilePart)),
        })
      }

      glide({ kind: "chat", id })

      return
    }

    const { view, id } = await startSession(target)
    const { toAttachment } = await import("#lib/chat/attachments.ts")

    await view.prompt(id, text, await Promise.all(files.map(toAttachment)))
  })

const ready = $derived(
  nav.target.kind === "model" ? !!findGateway(nav.target.gateway) : true,
)
</script>

<div class="flex flex-1 flex-col items-center justify-center gap-6 px-4 pb-24">
  <p class="text-2xl font-medium text-base-content/80">{m.chat_prompt()}</p>
  <div class="w-full">
    <Composer
      busy={attempt.busy}
      draft="start"
      disabled={!ready}
      placeholder={!ready
        ? m.chat_connect_gateway()
        : room
          ? m.group_placeholder()
          : m.chat_placeholder()}
      people={room ? roomPeople : undefined}
      onSend={send}
      onStop={() => {}}
      onCall={call}
    >
      {#snippet side()}
        <Wheel
          items={options}
          value={targetKey}
          label={m.target_title()}
          onpick={choose}
        />
      {/snippet}
      {#snippet tools()}
        {#if chosen}
          <span class="flex shrink-0 items-center gap-1.5 px-2 text-sm font-medium">
            {chosen.label}
            {#if chosen.badge}
              <span class="badge badge-soft badge-xs">{chosen.badge}</span>
            {/if}
          </span>
        {/if}
        {#each members as option (option.key)}
          <span class="badge badge-soft badge-primary shrink-0 gap-1 pe-0.5">
            <Icon icon={option.icon} class="size-3" />
            {option.label}
            <button
              type="button"
              class="btn btn-ghost btn-circle btn-xs size-4"
              aria-label={m.room_remove({ name: option.label })}
              title={m.room_remove({ name: option.label })}
              onclick={() => {
                extras = extras.filter(k => k !== option.key)
              }}
            >
              <Icon icon="lucide:x" class="size-3" />
            </button>
          </span>
        {/each}
        {#if addable.length}
          <Popover label={m.room_add()} placement="top-start" width="w-64" bind:open={adding}>
            {#snippet trigger(p)}
              <button
                {...p}
                type="button"
                class="btn btn-ghost btn-xs btn-square shrink-0"
                aria-label={m.room_add()}
                title={m.room_add()}
              >
                <Icon icon="lucide:user-plus" class="size-3.5" />
              </button>
            {/snippet}
            <div
              role="menu"
              tabindex="-1"
              class="flex max-h-80 flex-col overflow-y-auto"
              {@attach menuKeys}
            >
              {#each addable as option (option.key)}
                <MenuItem
                  icon={option.icon}
                  label={option.label}
                  onclick={() => {
                    adding = false
                    extras = [...extras, option.key]
                  }}
                />
              {/each}
            </div>
          </Popover>
        {/if}
        {#if room}
          {#if nav.target.kind === "harness"}
            <FolderPicker
              host={hostById(nav.target.host)}
              bind:value={nav.target.cwd}
            />
          {/if}
        {:else if nav.target.kind === "model"}
          <ModelInput
            gateway={nav.target.gateway}
            bind:value={nav.target.model}
          />
        {:else}
          <FolderPicker
            host={hostById(nav.target.host)}
            bind:value={nav.target.cwd}
          />
          {#if modelOption}
            <ModelEffort
              models={modelOption.values.map(v => ({ value: v.value, name: v.name }))}
              model={pinnedModel ?? pickOf(modelOption)}
              locked={pinned}
              efforts={effortOption
                ? effortOption.values.map(v => ({ value: v.value, name: v.name }))
                : []}
              effort={effortOption ? pickOf(effortOption) : ""}
              onmodel={value => {
                picks[presetKey(modelOption)] = value
              }}
              oneffort={value => {
                if (effortOption) {
                  picks[presetKey(effortOption)] = value
                }
              }}
            />
          {:else if fallback}
            <ModelEffort
              models={claude ? terminalChoices(undefined, []) : []}
              model={pinnedModel ?? alias}
              locked={pinned}
              efforts={efforts()}
              effort={level}
              onmodel={value => {
                alias = value
              }}
              oneffort={value => {
                level = value
              }}
            />
          {/if}
          {#each otherPresets as option (option.id)}
            <IconSelect
              icon={OPTION_ICONS[option.category ?? ""] ?? "lucide:settings-2"}
              label={option.name}
              value={pickOf(option)}
              choices={option.values.map(v => ({ value: v.value, name: v.name }))}
              onchange={value => {
                picks[presetKey(option)] = value
              }}
            />
          {/each}
        {/if}
      {/snippet}
    </Composer>
    <ErrorAlert message={attempt.failure} />
  </div>
</div>
