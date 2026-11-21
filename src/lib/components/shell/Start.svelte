<script lang="ts">
import Icon from "@iconify/svelte"
import { tick } from "svelte"
import { chats } from "#lib/chat/chats.svelte.ts"
import { matchChoice } from "#lib/chat/choices.ts"
import Composer from "#lib/components/chat/Composer.svelte"
import ModelEffort from "#lib/components/chat/ModelEffort.svelte"
import ModelInput from "#lib/components/chat/ModelInput.svelte"
import {
  efforts,
  OPTION_ICONS,
  PRIMARY,
  terminalChoices,
} from "#lib/components/chat/models.ts"
import UsageGraph from "#lib/components/shell/UsageGraph.svelte"
import { Attempt } from "#lib/components/ui/attempt.svelte.ts"
import ErrorAlert from "#lib/components/ui/ErrorAlert.svelte"
import IconButton from "#lib/components/ui/IconButton.svelte"
import IconSelect from "#lib/components/ui/IconSelect.svelte"
import Select from "#lib/components/ui/Select.svelte"
import Wheel from "#lib/components/ui/Wheel.svelte"
import { logFailure } from "#lib/logging.ts"
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

const pinnedModel = $derived(targetHarness?.providerModel ?? undefined)

const pinned = $derived(pinnedModel !== undefined)

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
  const space = nav.space

  nav.space = null

  if (space?.host === target.host) {
    await view
      .place(id, space.id, null)
      .catch((e: unknown) => logFailure("space place", e))
  }

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

const call = () =>
  attempt.run(async () => {
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

const spaceName = $derived(
  nav.space
    ? hostById(nav.space.host)?.state?.spaces?.find(s => s.id === nav.space?.id)?.name
    : undefined,
)

const ready = $derived(
  nav.target.kind === "model" ? !!findGateway(nav.target.gateway) : true,
)
</script>

<div class="flex flex-1 flex-col items-center justify-center gap-6 px-4 pb-24">
  <p class="text-2xl font-medium text-base-content/80">{m.chat_prompt()}</p>
  <div class="relative w-full">
    {#if spaceName && nav.target.kind === "harness" && nav.target.host === nav.space?.host}
      <div class="mx-auto mb-2 flex max-w-2xl items-center gap-2 px-4 text-sm text-base-content/70 sm:px-8">
        <Icon icon="lucide:layers" class="size-4 shrink-0" />
        <span class="min-w-0 flex-1 truncate">{m.space_target({ name: spaceName })}</span>
        <IconButton icon="lucide:x" label={m.common_cancel()} size="xs" onclick={() => (nav.space = null)} />
      </div>
    {/if}
    <div class="mx-auto max-w-2xl px-4 sm:px-8">
      <ErrorAlert message={attempt.failure} />
    </div>
    <Composer
      busy={attempt.busy}
      draft="start"
      disabled={!ready}
      placeholder={!ready ? m.chat_connect_gateway() : m.chat_placeholder()}
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
          <Select
            chip
            search
            class="shrink-0 text-sm font-medium"
            label={m.target_title()}
            options={options.map(o => ({
              value: o.key,
              label: o.label,
              icon: o.icon,
              group: o.group,
              detail: o.badge,
            }))}
            value={targetKey}
            onchange={choose}
          >
            {#snippet display()}
              <span class="flex min-w-0 items-center gap-1.5">
                <span class="truncate">{chosen.label}</span>
                {#if chosen.badge}
                  <span class="badge badge-soft badge-xs">{chosen.badge}</span>
                {/if}
              </span>
            {/snippet}
          </Select>
        {/if}
        {#if nav.target.kind === "model"}
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
    <div class="absolute inset-x-0 top-full pt-14">
      <UsageGraph />
    </div>
  </div>
</div>
