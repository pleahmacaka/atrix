<script lang="ts">
import type { RigidBody as RapierBody } from "@dimforge/rapier3d-compat"
import { usePrismaticJoint } from "@threlte/rapier"
import { untrack } from "svelte"
import { Vector3 } from "three"
import { toThree, type Vec3 } from "./types.ts"

let {
  anchor,
  mover,
  from,
  speed,
  active,
}: {
  anchor: RapierBody
  mover: RapierBody
  from: Vec3
  speed: number
  active: boolean
} = $props()

const start = new Vector3(...toThree(untrack(() => from)))

const { joint, rigidBodyA, rigidBodyB } = usePrismaticJoint(
  [0, 0, 0],
  [0, 0, 0],
  start.clone().normalize(),
  [0, start.length()],
)

$effect(() => {
  rigidBodyA.set(anchor)
  rigidBodyB.set(mover)
})

$effect(() => {
  if (active) {
    $joint?.configureMotorVelocity(-speed, 2)
  }
})
</script>
