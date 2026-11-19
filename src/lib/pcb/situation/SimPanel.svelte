<script lang="ts">
import { Canvas } from "@threlte/core"
import { World } from "@threlte/rapier"
import { NeutralToneMapping } from "three"
import EmptyState from "#lib/components/ui/EmptyState.svelte"
import IconButton from "#lib/components/ui/IconButton.svelte"
import { m } from "#lib/paraglide/messages.js"
import ToolChip, { SEGMENTS, TOOLBAR } from "../ToolChip.svelte"
import type { Kit } from "./assets.ts"
import SimScene from "./SimScene.svelte"
import { captionAt, GRAVITY_MM } from "./types.ts"

let { kit }: { kit: Kit } = $props()

const scenes = $derived(kit.situation?.scenes ?? [])

let picked = $state<string>()

const scene = $derived(scenes.find(s => s.id === picked) ?? scenes[0])

let run = $state(0)

let playing = $state(false)

let time = $state(0)

const slowmo = $derived(scene?.slowmo ?? 0.25)

const choose = (id: string) => {
  picked = id
  restart()
}

const restart = () => {
  time = 0
  run += 1
  playing = true
}

const toggle = () => {
  if (scene && time >= scene.duration) {
    restart()
  } else {
    playing = !playing
  }
}

const tick = (t: number) => {
  time = t

  if (scene && t >= scene.duration) {
    playing = false
  }
}
</script>

<div class="relative flex size-full flex-col">
  {#if scene}
    <div role="toolbar" aria-label={m.pcb_sim_toolbar()} class={TOOLBAR}>
      <fieldset aria-label={m.pcb_sim_scene()} class={SEGMENTS}>
        {#each scenes as s, i (s.id)}
          <ToolChip label={s.title} pressed={s.id === scene.id} onclick={() => choose(s.id)}>
            <span class="tabular-nums opacity-60">{i + 1}</span>
            {s.title}
          </ToolChip>
        {/each}
      </fieldset>
    </div>

    <div class="relative min-h-0 flex-1 touch-none select-none">
      {#key `${scene.id}:${run}`}
        <Canvas toneMapping={NeutralToneMapping} renderMode="always">
          <World gravity={[0, scene.gravity === false ? 0 : -GRAVITY_MM * slowmo * slowmo, 0]} autoStart={false}>
            <SimScene scene={scene} {kit} {playing} {slowmo} ontime={tick} />
          </World>
        </Canvas>
      {/key}

      {#if captionAt(scene, time)}
        <p
          class={[
            "absolute inset-x-2 top-2 mx-auto w-fit max-w-md rounded-box border border-base-300 bg-raised",
            "px-4 py-2 text-center text-sm shadow-lg",
          ]}
        >
          {captionAt(scene, time)}
        </p>
      {/if}

      <div
        class={[
          "absolute inset-x-2 bottom-2 flex items-center gap-2 rounded-box border border-base-300 bg-raised",
          "p-2 shadow-lg",
        ]}
      >
        <IconButton
          icon={playing ? "lucide:pause" : "lucide:play"}
          label={playing ? m.pcb_sim_pause() : m.pcb_sim_play()}
          onclick={toggle}
        />
        <IconButton
          icon="lucide:rotate-ccw"
          label={m.pcb_sim_replay()}
          onclick={restart}
        />
        <progress class="progress min-w-0 flex-1" value={Math.min(time, scene.duration)} max={scene.duration}></progress>
        <span class="shrink-0 text-xs text-base-content/70 tabular-nums">
          {m.pcb_sim_time({ time: Math.min(time, scene.duration).toFixed(1), duration: scene.duration })}
        </span>
        <span class="badge badge-ghost badge-sm hidden shrink-0 @2xl:inline-flex">
          {m.pcb_sim_slowmo({ factor: Math.round(1 / slowmo) })}
        </span>
      </div>
    </div>
  {:else}
    <EmptyState icon="lucide:clapperboard" text={m.pcb_sim_empty()} class="size-full justify-center" />
  {/if}
</div>
