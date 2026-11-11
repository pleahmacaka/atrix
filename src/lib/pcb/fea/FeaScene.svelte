<script lang="ts">
import { T, useThrelte } from "@threlte/core"
import { CameraControls } from "@threlte/extras"
import { Box3, DoubleSide, type Object3D, Sphere, Vector3 } from "three"
import { createStudio } from "../three/studio.ts"
import FeaLoads from "./FeaLoads.svelte"
import type { FeaLoad, Vec3 } from "./types.ts"

let { model, marker, loads }: { model: Object3D; marker: Vec3; loads: FeaLoad[] } = $props()

const { renderer, scene } = useThrelte()

const studio = createStudio(renderer)

scene.background = studio.background

$effect(() => () => studio.dispose())

const frame = $derived.by(() => {
  model.updateMatrixWorld(true)

  const bounds = new Box3().setFromObject(model)
  const sphere = bounds.getBoundingSphere(new Sphere())
  const span = Math.max(sphere.radius * 2, 40)
  const fit = new Sphere(sphere.center, sphere.radius + span * 0.35)

  return { center: bounds.getCenter(new Vector3()), span, sphere: fit }
})

const point = $derived<[number, number, number]>([marker[0], marker[2], -marker[1]])

const eye = $derived<[number, number, number]>([
  frame.center.x + frame.span * 0.9,
  frame.center.y + frame.span * 0.9,
  frame.center.z + frame.span * 1.1,
])
</script>

<T.PerspectiveCamera makeDefault position={eye} fov={35} near={1} far={frame.span * 30}>
  <CameraControls
    oncreate={c => {
      c.setLookAt(...eye, frame.center.x, frame.center.y, frame.center.z, false)
      c.fitToSphere(frame.sphere, false)
    }}
  />
</T.PerspectiveCamera>

<T.AmbientLight intensity={1.6} />
<T.DirectionalLight position={[frame.span, frame.span * 2, frame.span]} intensity={1.4} />
<T.DirectionalLight position={[-frame.span, frame.span, -frame.span]} intensity={0.6} />

<T is={model} />

<FeaLoads {model} {loads} span={frame.span} />

<T.Mesh position={point} renderOrder={1}>
  <T.SphereGeometry args={[1.2, 24, 16]} />
  <T.MeshBasicMaterial color="#ffffff" depthTest={false} transparent opacity={0.95} />
</T.Mesh>
<T.Mesh position={point} renderOrder={1}>
  <T.RingGeometry args={[2, 2.6, 32]} />
  <T.MeshBasicMaterial color="#ef4444" depthTest={false} transparent side={DoubleSide} />
</T.Mesh>
