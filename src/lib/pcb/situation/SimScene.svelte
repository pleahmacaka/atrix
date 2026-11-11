<script lang="ts">
import type { RigidBody as RapierBody } from "@dimforge/rapier3d-compat"
import { T, useTask, useThrelte } from "@threlte/core"
import { CameraControls } from "@threlte/extras"
import { useRapier } from "@threlte/rapier"
import { Box3, Sphere, Vector3 } from "three"
import { createStudio } from "../three/studio.ts"
import type { Kit } from "./assets.ts"
import SimBody from "./SimBody.svelte"
import SimSlide from "./SimSlide.svelte"
import { partKey, type SimScene, toThree } from "./types.ts"

let {
  scene: plan,
  kit,
  playing,
  slowmo,
  ontime,
}: {
  scene: SimScene
  kit: Kit
  playing: boolean
  slowmo: number
  ontime: (t: number) => void
} = $props()

const { renderer, scene } = useThrelte()

const rapier = useRapier()

const studio = createStudio(renderer)

scene.environment = studio.environment
scene.background = studio.background

rapier.world.lengthUnit = 1000

let time = $state(0)

const bodies: Record<string, RapierBody | undefined> = $state({})

$effect(() => () => studio.dispose())

$effect(() => {
  if (playing) {
    rapier.resume()
  } else {
    rapier.pause()
  }
})

useTask(delta => {
  if (playing) {
    time += delta
    ontime(time)
  }
})

const frame = $derived.by(() => {
  const bounds = new Box3()

  for (const body of plan.bodies) {
    const shift = new Vector3(...toThree(body.from ?? [0, 0, 0]))

    for (const part of body.parts) {
      const object = kit.objects.get(partKey(part))

      if (object) {
        const box = new Box3().setFromObject(object)
        bounds.union(box).union(box.clone().translate(shift))
      }
    }
  }

  return {
    span: Math.max(bounds.max.x - bounds.min.x, bounds.max.z - bounds.min.z, 60),
    center: bounds.getCenter(new Vector3()),
    sphere: bounds.getBoundingSphere(new Sphere()),
  }
})

const span = $derived(frame.span)

const center = $derived(frame.center)

const anchor = $derived(plan.bodies.find(b => b.type === "fixed"))
</script>

<T.PerspectiveCamera
  makeDefault
  position={[center.x + span * 0.9, center.y + span * 0.8, center.z + span * 1.1]}
  fov={35}
  near={1}
  far={span * 30}
>
  <CameraControls oncreate={c => {
      c.setLookAt(center.x + span * 0.9, center.y + span * 0.8, center.z + span * 1.1, center.x, center.y, center.z, false)
      c.fitToSphere(frame.sphere, false)
    }} />
</T.PerspectiveCamera>

<T.AmbientLight intensity={0.4} />
<T.DirectionalLight position={[span, span * 2, span]} intensity={1.1} />
<T.DirectionalLight position={[-span, span, -span]} intensity={0.4} />

{#each plan.bodies as body (body.id)}
  <SimBody {body} {kit} {time} bind:rigidBody={bodies[body.id]} />
{/each}

{#each plan.bodies.filter(b => b.slide && b.from) as body (body.id)}
  {@const fixed = anchor ? bodies[anchor.id] : undefined}
  {@const mover = bodies[body.id]}
  {#if fixed && mover && body.from}
    <SimSlide
      anchor={fixed}
      {mover}
      from={body.from}
      speed={(body.slide ?? 0) * slowmo}
      active={time >= (body.release ?? 0)}
    />
  {/if}
{/each}
