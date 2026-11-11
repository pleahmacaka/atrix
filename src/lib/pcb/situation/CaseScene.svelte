<script lang="ts">
import { T, useThrelte } from "@threlte/core"
import { CameraControls } from "@threlte/extras"
import { Box3, Sphere, Vector3 } from "three"
import { createStudio } from "../three/studio.ts"
import type { Kit } from "./assets.ts"
import { type CaseInfo, partFile } from "./types.ts"

let {
  kit,
  info,
  explode,
  shown,
  variant,
}: { kit: Kit; info: CaseInfo; explode: number; shown: Record<string, boolean>; variant: string | undefined } = $props()

const { renderer, scene, invalidate } = useThrelte()

const studio = createStudio(renderer)

scene.environment = studio.environment
scene.background = studio.background

$effect(() => () => studio.dispose())

const LIFT: Record<string, number> = { lid: 1, plunger: 1.6, windows: 1.3 }

const boards = $derived(
  info.boards.flatMap(id => {
    const object = kit.objects.get(`board:${id}`)

    return object ? [object.clone()] : []
  }),
)

const parts = $derived(
  info.parts.flatMap(p => {
    const object = kit.objects.get(`case:${info.id}/${partFile(p, variant)}`)

    return object ? [{ name: p.name, object: object.clone() }] : []
  }),
)

const frame = $derived.by(() => {
  const bounds = new Box3()

  for (const p of info.parts) {
    const object = kit.objects.get(`case:${info.id}/${p.name}`)

    if (object) {
      bounds.expandByObject(object)
    }
  }

  return {
    span: Math.max(bounds.max.x - bounds.min.x, bounds.max.z - bounds.min.z, 40),
    center: bounds.getCenter(new Vector3()),
    sphere: bounds.getBoundingSphere(new Sphere()),
  }
})

const span = $derived(frame.span)

const center = $derived(frame.center)

$effect(() => {
  for (const p of parts) {
    p.object.position.y = (LIFT[p.name] ?? 0) * explode
    p.object.visible = shown[p.name] !== false
  }

  invalidate()
})
</script>

<T.PerspectiveCamera
  makeDefault
  position={[center.x + span * 0.9, center.y + span * 0.9, center.z + span * 1.1]}
  fov={35}
  near={1}
  far={span * 30}
>
  <CameraControls oncreate={c => {
      c.setLookAt(center.x + span * 0.9, center.y + span * 0.9, center.z + span * 1.1, center.x, center.y + 10, center.z, false)
      c.fitToSphere(frame.sphere, false)
    }} />
</T.PerspectiveCamera>

<T.AmbientLight intensity={0.4} />
<T.DirectionalLight position={[span, span * 2, span]} intensity={1.1} />
<T.DirectionalLight position={[-span, span, -span]} intensity={0.4} />

{#each boards as object (object.uuid)}
  <T is={object} visible={shown.board !== false} />
{/each}

{#each parts as part (part.name)}
  <T is={part.object} />
{/each}
