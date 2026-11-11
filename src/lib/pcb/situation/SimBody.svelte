<script lang="ts">
import type { RigidBody as RapierBody } from "@dimforge/rapier3d-compat"
import { T } from "@threlte/core"
import { Collider, RigidBody } from "@threlte/rapier"
import type { Kit } from "./assets.ts"
import { boxCollider, partKey, type SimBody, toThree } from "./types.ts"

let {
  body,
  kit,
  time,
  rigidBody = $bindable(),
}: {
  body: SimBody
  kit: Kit
  time: number
  rigidBody?: RapierBody
} = $props()

const released = $derived(time >= (body.release ?? 0))

const type = $derived(
  body.type === "fixed" ? "fixed" : released || body.slide ? "dynamic" : "kinematicPosition",
)

const objects = $derived(
  body.parts.flatMap(p => {
    const object = kit.objects.get(partKey(p))

    return object ? [object.clone()] : []
  }),
)

const solid = $derived(body.type === "dynamic" || body.collide !== false)

const boxes = $derived(
  solid
    ? body.parts.flatMap(p => {
        const shapes =
          "board" in p ? kit.colliders.boards[p.board] : kit.colliders.cases[p.case]?.[p.part]

        return Array.isArray(shapes) ? shapes.map(boxCollider) : []
      })
    : [],
)

const meshes = $derived(
  solid && body.type === "fixed"
    ? body.parts.flatMap(p => {
        const mesh = kit.meshes.get(partKey(p))

        return mesh ? [mesh] : []
      })
    : [],
)
</script>

<T.Group position={toThree(body.from ?? [0, 0, 0])}>
  <RigidBody {type} bind:rigidBody canSleep={false} ccd={body.type === "dynamic"}>
    {#each boxes as box, i (i)}
      <T.Group position={box.center}>
        <Collider shape="cuboid" args={box.half} friction={0.4} />
      </T.Group>
    {/each}
    {#each meshes as mesh, i (i)}
      <Collider shape="trimesh" args={[mesh.vertices, mesh.indices]} friction={0.4} />
    {/each}
    {#each objects as object (object.uuid)}
      <T is={object} />
    {/each}
  </RigidBody>
</T.Group>
