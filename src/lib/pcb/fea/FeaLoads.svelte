<script lang="ts">
import { T } from "@threlte/core"
import { Edges, HTML } from "@threlte/extras"
import { Box3, DoubleSide, type Object3D, Quaternion, Vector3 } from "three"
import type { FeaLoad, Vec3 } from "./types.ts"

let { model, loads, span }: { model: Object3D; loads: FeaLoad[]; span: number } = $props()

const COLOR = "#f97316"

const UP = new Vector3(0, 1, 0)

const FORWARD = new Vector3(0, 0, 1)

const toWorld = ([x, y, z]: Vec3) => new Vector3(x, z, -y)

const turn = (from: Vector3, to: Vector3) => new Quaternion().setFromUnitVectors(from, to).toArray()

const magnitude = (l: FeaLoad) =>
  l.magnitudeN !== undefined
    ? `${l.magnitudeN} N`
    : l.magnitudeNm !== undefined
      ? `${l.magnitudeNm} N·m`
      : null

const body = $derived.by(() => {
  model.updateMatrixWorld(true)

  const box = new Box3().setFromObject(model.getObjectByName("main-case") ?? model)

  return { center: box.getCenter(new Vector3()), size: box.getSize(new Vector3()) }
})

const reach = (dir: Vector3) =>
  (Math.abs(dir.x) * body.size.x + Math.abs(dir.y) * body.size.y + Math.abs(dir.z) * body.size.z) / 2

const length = $derived(span * 0.25)

const head = $derived(length * 0.25)

const radius = $derived(span * 0.18)

const arrows = $derived(
  loads.flatMap(l => {
    if (!l.direction) {
      return []
    }

    const dir = toWorld(l.direction).normalize()
    const point = l.point && toWorld(l.point)
    const anchor = point ?? body.center.clone().addScaledVector(dir, reach(dir))
    const outward = dir.dot(anchor.clone().sub(body.center)) >= 0
    const tail = outward ? anchor : anchor.clone().addScaledVector(dir, -length)
    const tag = tail.clone().addScaledVector(dir, outward ? length * 1.2 : -length * 0.2)

    return [
      {
        tail: tail.toArray(),
        quaternion: turn(UP, dir),
        tag: tag.toArray(),
        text: magnitude(l),
        point: point?.toArray(),
      },
    ]
  }),
)

const twists = $derived(
  loads.flatMap(l => {
    if (!l.axis) {
      return []
    }

    const axis = toWorld(l.axis).normalize()

    return [
      {
        position: body.center.clone().addScaledVector(axis, reach(axis)).toArray(),
        quaternion: turn(FORWARD, axis),
        text: magnitude(l),
      },
    ]
  }),
)

const whole = $derived(loads.some(l => !l.point))
</script>

{#snippet tag(text: string | null)}
  {#if text}
    <span class="badge badge-sm border-0 bg-orange-500 whitespace-nowrap text-white tabular-nums">
      {text}
    </span>
  {/if}
{/snippet}

{#if whole}
  <T.Mesh position={body.center.toArray()} scale={body.size.toArray()}>
    <T.BoxGeometry />
    <T.MeshBasicMaterial color={COLOR} transparent opacity={0.06} depthWrite={false} />
    <Edges color={COLOR} />
  </T.Mesh>
{/if}

{#each arrows as a, i (i)}
  {#if a.point}
    <T.Mesh position={a.point} scale={span * 0.05} renderOrder={1}>
      <T.BoxGeometry />
      <T.MeshBasicMaterial color={COLOR} transparent opacity={0.35} depthTest={false} />
      <Edges color={COLOR} />
    </T.Mesh>
  {/if}

  <T.Group position={a.tail} quaternion={a.quaternion}>
    <T.Mesh position.y={(length - head) / 2} renderOrder={1}>
      <T.CylinderGeometry args={[length * 0.025, length * 0.025, length - head, 12]} />
      <T.MeshBasicMaterial color={COLOR} depthTest={false} transparent />
    </T.Mesh>
    <T.Mesh position.y={length - head / 2} renderOrder={1}>
      <T.ConeGeometry args={[length * 0.08, head, 20]} />
      <T.MeshBasicMaterial color={COLOR} depthTest={false} transparent />
    </T.Mesh>
  </T.Group>

  <HTML position={a.tag} center pointerEvents="none">
    {@render tag(a.text)}
  </HTML>
{/each}

{#each twists as t, i (i)}
  <T.Group position={t.position} quaternion={t.quaternion}>
    <T.Mesh renderOrder={1}>
      <T.TorusGeometry args={[radius, length * 0.025, 8, 64, Math.PI * 1.5]} />
      <T.MeshBasicMaterial color={COLOR} depthTest={false} transparent side={DoubleSide} />
    </T.Mesh>
    <T.Mesh position={[0, -radius, 0]} rotation.z={-Math.PI / 2} renderOrder={1}>
      <T.ConeGeometry args={[length * 0.08, head, 20]} />
      <T.MeshBasicMaterial color={COLOR} depthTest={false} transparent />
    </T.Mesh>

    <HTML position={[radius * 0.75, -radius * 0.75, 0]} center pointerEvents="none">
      {@render tag(t.text)}
    </HTML>
  </T.Group>
{/each}
