<script lang="ts">
import Icon from "@iconify/svelte"
import { slide } from "svelte/transition"
import { Attempt } from "#lib/components/ui/attempt.svelte.ts"
import IconButton from "#lib/components/ui/IconButton.svelte"
import IconInput from "#lib/components/ui/IconInput.svelte"
import IconSelect from "#lib/components/ui/IconSelect.svelte"
import { motion } from "#lib/components/ui/motion.ts"
import Section from "#lib/components/ui/Section.svelte"
import { m } from "#lib/paraglide/messages.js"
import { CUSTOM_TEMPLATE, OPENROUTER_URL } from "#lib/store/gatewayCatalog.ts"
import { modelIcon, probeGateway, saveGateway } from "#lib/store/gateways.svelte.ts"
import { login } from "#lib/store/openrouter.ts"
import GatewayCheck from "./GatewayCheck.svelte"
import { CHOICES, type Draft, pick, urlOf } from "./gatewayDraft.ts"
import { ProbeState } from "./probeState.svelte.ts"

let { draft = $bindable(), close }: { draft: Draft; close: () => void } = $props()

const attempt = new Attempt()

const probe = new ProbeState(() => `${urlOf(draft)}\n${draft.key.trim()}`)

let armed = $state(false)

let revealed = $state(false)

const template = $derived(CHOICES.find(t => t.id === draft.template))

const editableURL = $derived(draft.id !== null || draft.template === CUSTOM_TEMPLATE)

const verified = $derived(probe.current.state === "ok")

const warned = $derived(armed && !verified)

const verify = () =>
  urlOf(draft) ? probe.verify(() => probeGateway(urlOf(draft), draft.key.trim() || null)) : undefined

const signIn = () =>
  attempt.run(async () => {
    const key = await login()

    if (key) {
      draft.key = key
      await verify()
    }
  })

const save = () =>
  attempt.run(async () => {
    const baseURL = urlOf(draft)

    await saveGateway({
      id: draft.id ?? crypto.randomUUID(),
      name: draft.name.trim(),
      kind: baseURL === OPENROUTER_URL ? "openrouter" : "openai",
      baseURL,
      key: draft.key.trim() || null,
      model: draft.model.trim(),
    })
    close()
  })

const submit = () => {
  if (verified || armed) {
    save()
  } else {
    armed = true
  }
}
</script>

<div transition:slide={{ duration: motion(140) }} class="mt-1 mb-3 rounded-box bg-base-200 p-4">
  <Section
    icon={draft.id ? "lucide:pencil" : "lucide:plus"}
    title={draft.id ? m.gateway_editing({ name: draft.name }) : m.gateway_add()}
  >
    {#snippet actions()}
      <IconButton icon="lucide:x" label={m.common_cancel()} onclick={close} />
    {/snippet}
    <form
      class="flex flex-col gap-2 py-2"
      onsubmit={e => {
        e.preventDefault()
        submit()
      }}
    >
      <div class="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <IconSelect
          icon={template?.icon ?? "lucide:server"}
          label={m.gateway_provider()}
          ghost={false}
          class="w-full"
          value={draft.template}
          choices={CHOICES.map(t => ({ value: t.id, name: t.name }))}
          onchange={id => {
            pick(draft, id)
            armed = false
          }}
        />
        <IconInput
          icon="lucide:tag"
          label={m.gateway_name()}
          placeholder={m.gateway_name()}
          ghost={false}
          bind:value={draft.name}
        />
      </div>
      {#if editableURL}
        <IconInput
          icon="lucide:link"
          label={m.gateway_url()}
          placeholder={m.gateway_url()}
          ghost={false}
          bind:value={draft.baseURL}
          onblur={verify}
        />
      {:else}
        <p class="truncate px-1 text-xs text-base-content/55" title={draft.baseURL}>{draft.baseURL}</p>
      {/if}
      <div class="flex min-w-0 items-center gap-2">
        <IconInput
          icon="lucide:key-round"
          label={m.gateway_key()}
          placeholder={m.gateway_key()}
          type={revealed ? "text" : "password"}
          autocomplete="off"
          ghost={false}
          class="w-full min-w-0 flex-1"
          bind:value={draft.key}
          onblur={verify}
        />
        <IconButton
          icon={revealed ? "lucide:eye-off" : "lucide:eye"}
          label={revealed ? m.gateway_key_hide() : m.gateway_key_show()}
          aria-pressed={revealed}
          class="shrink-0"
          onclick={() => (revealed = !revealed)}
        />
        {#if template?.oauth}
          <button type="button" class="btn btn-ghost btn-sm shrink-0" disabled={attempt.busy} onclick={signIn}>
            <Icon icon="lucide:log-in" class="size-4" />
            {m.gateway_sign_in()}
          </button>
        {/if}
      </div>
      {#if probe.current.state === "ok"}
        {#if probe.current.models.length > 0}
          <IconSelect
            icon="lucide:cpu"
            label={m.gateway_model()}
            ghost={false}
            value={draft.model}
            choices={probe.current.models.map(id => ({ value: id, name: id, icon: modelIcon(id) }))}
            onchange={id => (draft.model = id)}
          />
        {:else}
          <IconInput
            icon="lucide:cpu"
            label={m.gateway_model()}
            placeholder={m.gateway_model()}
            ghost={false}
            bind:value={draft.model}
          />
        {/if}
        <GatewayCheck check={probe.current} done={m.gateway_verified({ count: probe.current.models.length })} />
      {:else}
        <IconInput
          icon="lucide:cpu"
          label={m.gateway_model()}
          placeholder={m.gateway_model()}
          ghost={false}
          bind:value={draft.model}
        />
        <GatewayCheck check={probe.current} done="" />
      {/if}
      <div class="flex justify-end gap-2">
        <button
          type="button"
          class="btn btn-sm"
          disabled={probe.current.state === "busy" || !draft.baseURL.trim()}
          onclick={verify}
        >
          <Icon icon="lucide:plug-zap" class="size-4" />
          {m.gateway_probe()}
        </button>
        <button
          type="submit"
          class={["btn btn-sm", warned ? "btn-warning" : "btn-primary"]}
          title={warned ? m.gateway_unverified() : undefined}
          disabled={attempt.busy || !draft.name.trim() || !draft.baseURL.trim()}
        >
          <Icon icon={warned ? "lucide:triangle-alert" : "lucide:check"} class="size-4" />
          {warned ? m.gateway_save_anyway() : draft.id ? m.gateway_save() : m.gateway_add()}
        </button>
      </div>
    </form>
  </Section>
</div>