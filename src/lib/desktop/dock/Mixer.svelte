<script lang="ts">
  import Icon from "@iconify/svelte"
  import IconButton from "#lib/components/ui/IconButton.svelte"
  import * as native from "#lib/desktop/native/index.js"
  import { m } from "#lib/paraglide/messages.js"
  import { latest, volumeIcon } from "./sound"

  type Props = {
    volume: native.Volume
    device: string
    onmaster: (level: number) => void
    onsync: (volume: native.Volume) => void
    ontogglemute: () => void
    onback: () => void
  }

  type Channel = {
    id: string
    name: string
    level: number
    muted: boolean
    image: string | null
    glyph: string
    onlevel: (level: number) => void
    onmute: () => void
  }

  let { volume, device, onmaster, onsync, ontogglemute, onback }: Props = $props()

  const POLL = 1_000

  const MASTER = "master"

  let sessions = $state<native.AudioSession[]>([])
  let loaded = $state(false)
  let icons = $state<Record<string, string | null>>({})
  let held: string | null = null

  const loadIcon = (path: string) => {
    if (!path || path in icons) {
      return
    }

    icons[path] = null
    native
      .appIcon(path)
      .then(url => {
        icons[path] = url
      })
      .catch(() => undefined)
  }

  const refresh = async () => {
    const mixer = await native.audioMixer().catch(() => null)

    if (!mixer) {
      return
    }

    if (mixer.master && held !== MASTER) {
      onsync(mixer.master)
    }

    const local = new Map(sessions.map(s => [s.id, s.level]))

    sessions = mixer.sessions.map(s =>
      s.id === held ? { ...s, level: local.get(s.id) ?? s.level } : s,
    )
    loaded = true

    for (const session of mixer.sessions) {
      loadIcon(session.path)
    }
  }

  $effect(() => {
    refresh()

    const timer = setInterval(refresh, POLL)

    return () => clearInterval(timer)
  })

  const senders = new Map<string, (level: number) => void>()

  const setLevel = (session: native.AudioSession, level: number) => {
    const { id } = session
    let send = senders.get(id)

    if (!send) {
      send = latest(next => native.setSessionVolume(id, next))
      senders.set(id, send)
    }

    session.level = level
    send(level)
  }

  const toggleMute = (session: native.AudioSession) => {
    session.muted = !session.muted
    native.setSessionMute(session.id, session.muted).catch(() => undefined)
  }

  const nameOf = (session: native.AudioSession) => {
    if (session.system) {
      return m.dock_mixer_system()
    }

    return session.name || m.dock_mixer_unknown()
  }

  const master = $derived<Channel>({
    id: MASTER,
    name: device || m.dock_volume(),
    level: volume.level,
    muted: volume.muted,
    image: null,
    glyph: "lucide:speaker",
    onlevel: onmaster,
    onmute: ontogglemute,
  })

  const channels = $derived(
    sessions.map(
      (session): Channel => ({
        id: session.id,
        name: nameOf(session),
        level: session.level,
        muted: session.muted,
        image: icons[session.path] ?? null,
        glyph: session.system ? "lucide:monitor-speaker" : "lucide:app-window",
        onlevel: level => setLevel(session, level),
        onmute: () => toggleMute(session),
      }),
    ),
  )
</script>

{#snippet channel(c: Channel)}
  {@const percent = Math.round(c.level * 100)}

  <div class="flex items-center gap-2">
    <span class="grid size-8 shrink-0 place-items-center">
      {#if c.image}
        <img src={c.image} alt="" draggable="false" class="size-6 object-contain" />
      {:else}
        <Icon icon={c.glyph} class="size-5 text-base-content/70" />
      {/if}
    </span>

    <div class="flex min-w-0 flex-1 flex-col gap-1">
      <div class="flex items-center gap-2 text-xs">
        <span class="min-w-0 flex-1 truncate" title={c.name}>{c.name}</span>

        <span class="w-9 shrink-0 text-right tabular-nums text-base-content/60">
          {percent}%
        </span>
      </div>

      <input
        type="range"
        class={["range range-primary range-xs w-full", c.muted && "opacity-50"]}
        min="0"
        max="100"
        value={percent}
        aria-label={m.dock_mixer_app_volume({ name: c.name })}
        oninput={e => c.onlevel(Number(e.currentTarget.value) / 100)}
        onpointerdown={() => (held = c.id)}
        onpointerup={() => (held = null)}
        onpointercancel={() => (held = null)}
      />
    </div>

    <IconButton
      icon={volumeIcon(c.level, c.muted)}
      label={c.muted ? m.dock_unmute() : m.dock_mute()}
      size="xs"
      class={c.muted ? "text-base-content/50" : undefined}
      onclick={c.onmute}
    />
  </div>
{/snippet}

<section class="flex flex-col gap-3 p-3 text-sm">
  <header class="flex items-center gap-1">
    <IconButton icon="lucide:chevron-left" label={m.common_back()} size="xs" onclick={onback} />

    <h3 class="min-w-0 flex-1 truncate font-medium">{m.dock_mixer()}</h3>
  </header>

  {@render channel(master)}

  <div class="flex max-h-72 flex-col gap-3 overflow-y-auto">
    {#each channels as c (c.id)}
      {@render channel(c)}
    {/each}
  </div>

  {#if loaded && channels.length === 0}
    <p class="py-1 text-xs text-base-content/50">{m.dock_mixer_empty()}</p>
  {/if}
</section>
