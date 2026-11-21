<script lang="ts">
import type { Bot } from "#lib/channels/store.svelte.ts"
import FolderPicker from "#lib/components/shell/FolderPicker.svelte"
import IconInput from "#lib/components/ui/IconInput.svelte"
import IconSelect from "#lib/components/ui/IconSelect.svelte"
import Modal from "#lib/components/ui/Modal.svelte"
import SettingRow from "#lib/components/ui/SettingRow.svelte"
import type { HostView } from "#lib/p2p/hostView.svelte.ts"
import { m } from "#lib/paraglide/messages.js"

let {
  host,
  bot = $bindable(),
  onsave,
}: { host: HostView | undefined; bot: Bot | null; onsave: (bot: Bot) => void } = $props()

const harnesses = $derived((host?.state?.harnesses ?? []).filter(h => h.enabled))

const sample = $derived(
  Object.values(host?.views ?? {}).find(v => v.harness === bot?.harness && v.config.length > 0),
)

const modelOption = $derived(sample?.config.find(o => o.category === "model"))

const modeOption = $derived(sample?.config.find(o => o.category === "mode"))

const DEFAULT = ""

const choicesOf = (values: { value: string; name: string }[]) => [
  { value: DEFAULT, name: m.bot_default() },
  ...values.map(v => ({ value: v.value, name: v.name })),
]

const ids = (text: string) =>
  text
    .split(/[\s,]+/)
    .map(s => s.trim())
    .filter(Boolean)

let channelText = $state("")

let memberText = $state("")

$effect(() => {
  if (bot) {
    channelText = bot.channels.join(", ")
    memberText = bot.members.join(", ")
  }
})

const ready = $derived(!!bot && !!bot.name.trim() && !!bot.harness && !!bot.cwd)

const save = () => {
  if (!bot || !ready) {
    return
  }

  onsave({ ...bot, name: bot.name.trim(), channels: ids(channelText), members: ids(memberText) })
  bot = null
}
</script>

<Modal
  bind:open={
    () => bot !== null,
    open => {
      if (!open) {
        bot = null
      }
    }
  }
  label={m.bot_edit()}
  class="flex max-h-dvh max-w-xl flex-col"
>
  {#if bot}
    <form
      class="flex min-h-0 flex-col"
      onsubmit={e => {
        e.preventDefault()
        save()
      }}
    >
      <h2 class="px-5 pt-4 pb-1 font-semibold">{m.bot_edit()}</h2>
      <div class="flex min-h-0 flex-col overflow-y-auto px-5">
        <SettingRow title={m.bot_name()}>
          <IconInput
            icon="lucide:bot"
            label={m.bot_name()}
            ghost={false}
            class="w-56 max-sm:w-auto max-sm:flex-1"
            bind:value={bot.name}
          />
        </SettingRow>
        <SettingRow title={m.channels_harness()}>
          <IconSelect
            icon="lucide:boxes"
            label={m.channels_harness()}
            ghost={false}
            value={bot.harness}
            choices={harnesses.map(h => ({ value: h.id, name: h.name }))}
            onchange={value => {
              if (bot) {
                bot.harness = value
                bot.model = DEFAULT
                bot.mode = DEFAULT
              }
            }}
          />
        </SettingRow>
        {#if modelOption}
          <SettingRow title={m.bot_model()}>
            <IconSelect
              icon="lucide:cpu"
              label={m.bot_model()}
              ghost={false}
              value={bot.model}
              choices={choicesOf(modelOption.values)}
              onchange={value => {
                if (bot) {
                  bot.model = value
                }
              }}
            />
          </SettingRow>
        {/if}
        {#if modeOption}
          <SettingRow title={m.bot_mode()}>
            <IconSelect
              icon="lucide:shield"
              label={m.bot_mode()}
              ghost={false}
              value={bot.mode}
              choices={choicesOf(modeOption.values)}
              onchange={value => {
                if (bot) {
                  bot.mode = value
                }
              }}
            />
          </SettingRow>
        {/if}
        <SettingRow title={m.bot_home()}>
          <FolderPicker {host} bind:value={bot.cwd} />
        </SettingRow>
        <SettingRow title={m.bot_channels()}>
          <IconInput
            icon="lucide:hash"
            label={m.bot_channels()}
            inputmode="numeric"
            ghost={false}
            class="w-56 tabular-nums max-sm:w-auto max-sm:flex-1"
            bind:value={channelText}
          />
        </SettingRow>
        <SettingRow title={m.bot_direct()}>
          <input type="checkbox" class="toggle toggle-primary" bind:checked={bot.direct} />
        </SettingRow>
        <SettingRow title={m.bot_members()}>
          <IconInput
            icon="lucide:users"
            label={m.bot_members()}
            inputmode="numeric"
            ghost={false}
            class="w-56 tabular-nums max-sm:w-auto max-sm:flex-1"
            bind:value={memberText}
          />
        </SettingRow>
      </div>
      <div class="flex justify-end gap-2 px-5 pt-2 pb-4">
        <button type="button" class="btn btn-ghost btn-sm" onclick={() => (bot = null)}>
          {m.common_cancel()}
        </button>
        <button type="submit" class="btn btn-primary btn-sm" disabled={!ready}>
          {m.common_save()}
        </button>
      </div>
    </form>
  {/if}
</Modal>
