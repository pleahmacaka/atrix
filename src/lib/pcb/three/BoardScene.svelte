<script lang="ts">
import { T, useThrelte } from "@threlte/core"
import {
  CameraControls,
  type CameraControlsRef,
  Edges,
  Gizmo,
  GLTF,
  HTML,
  useMeshopt,
} from "@threlte/extras"
import { untrack } from "svelte"
import { sineOut } from "svelte/easing"
import { prefersReducedMotion } from "svelte/motion"
import {
  Box3 as Bounds,
  DoubleSide,
  type Group,
  type Material,
  Mesh,
  MeshBasicMaterial,
  type Object3D,
  Plane,
  PlaneGeometry,
  Raycaster,
  Vector2,
  Vector3,
} from "three"
import { m } from "#lib/paraglide/messages.js"
import { fade, pop, trace } from "../motion.ts"
import {
  type Artwork,
  type Copper,
  LAYERS,
  type Layer,
  type Pcb,
  type Polygon,
  type Side,
} from "../types.ts"
import { rem } from "../units.ts"
import {
  capGeometry,
  focusPolygons,
  geometryOf,
  indexCopper,
  netAt,
  pinSpots,
  sectionAt,
} from "./copper.ts"
import type { Inspect } from "./inspect.svelte.ts"
import MeasureMarks from "./MeasureMarks.svelte"
import type { Measure } from "./measure.svelte.ts"
import { palette } from "./palette.svelte.ts"
import { partBoxes, pickPart } from "./picker.ts"
import { createStudio, restyle } from "./studio.ts"
import { boxInWorld, centerOf, look, spanOf } from "./view.ts"

let {
  pcb,
  copper,
  artwork = null,
  urls,
  layers,
  wireframe,
  explode,
  section,
  measure,
  inspect,
  overview = true,
  controls = $bindable(),
  onerror,
}: {
  pcb: Pcb
  copper: Copper | null
  artwork?: Artwork | null
  urls: Record<Layer, string>
  layers: Record<Layer, boolean>
  wireframe: boolean
  explode: number
  section: number | null
  measure: Measure
  inspect: Inspect
  overview?: boolean
  controls?: CameraControlsRef
  onerror: () => void
} = $props()

const FADE = 0.12

const SLIVER = 0.002

const LIFT = 0.01

const SLOP = { mouse: 4, touch: 10 }

const HOLD_MS = 600

const { renderer, scene, camera, invalidate } = useThrelte()

const meshopt = useMeshopt()

const studio = createStudio(renderer)

scene.environment = studio.environment
scene.background = studio.background

const center = $derived(centerOf(pcb))

const span = $derived(spanOf(pcb))

const boxes = $derived(partBoxes(pcb, explode))

const index = $derived(copper ? indexCopper(copper) : null)

let hovered = $state<string | null>(null)

let probed = $state<{ net: string; at: [number, number, number] } | null>(
  null,
)

const previewRef = $derived(
  inspect.preview?.kind === "part" ? inspect.preview.ref : null,
)

const part = $derived(
  pcb.footprints.find(f => f.ref === (hovered ?? previewRef)) ?? null,
)

const partTint = $derived(part ? palette.part(part.ref) : "#3b82f6")

const highlight = $derived(part?.box3d ? boxInWorld(pcb, part.box3d) : null)

const lift = $derived((part?.side === "bottom" ? -1 : 1) * explode)

const anchor = $derived<[number, number, number] | null>(
  highlight
    ? [
        highlight.center[0],
        highlight.center[1] + lift + highlight.size[1] / 2,
        highlight.center[2],
      ]
    : null,
)

const GAP = 20

const ARM = 16

const TIP = { width: 224, height: 44 }

const MARGIN = 8

type Away = { right: boolean; up: boolean; x: number; y: number }

type Box = { left: number; top: number; right: number; bottom: number }

let away = $state<Away>({ right: true, up: true, x: GAP, y: GAP })

const overlapOf = (a: Box, b: Box) =>
  Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) *
  Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top))

const avoidBoxes = (canvas: HTMLCanvasElement) => {
  const bounds = canvas.getBoundingClientRect()
  const root = canvas.closest("[data-tip-root]")

  return [...(root?.querySelectorAll("[data-tip-avoid]") ?? [])].map(el => {
    const r = el.getBoundingClientRect()

    return {
      left: r.left - bounds.left - MARGIN,
      top: r.top - bounds.top - MARGIN,
      right: r.right - bounds.left + MARGIN,
      bottom: r.bottom - bounds.top + MARGIN,
    }
  })
}

const aimLeader = (point: [number, number, number]) => {
  const canvas = renderer.domElement
  const toPixels = (v: Vector3) => {
    v.project(camera.current)

    return [
      (v.x * canvas.clientWidth) / 2,
      (v.y * canvas.clientHeight) / 2,
    ] as const
  }
  const [px, py] = toPixels(new Vector3(...point))
  let reach = { right: 0, left: 0, up: 0, down: 0 }

  if (highlight) {
    const [cx, cy, cz] = highlight.center
    const [sx, sy, sz] = highlight.size

    for (const corner of [0, 1, 2, 3, 4, 5, 6, 7]) {
      const [qx, qy] = toPixels(
        new Vector3(
          cx + ((corner & 1 ? 1 : -1) * sx) / 2,
          cy + lift + ((corner & 2 ? 1 : -1) * sy) / 2,
          cz + ((corner & 4 ? 1 : -1) * sz) / 2,
        ),
      )

      reach = {
        right: Math.max(reach.right, qx - px),
        left: Math.max(reach.left, px - qx),
        up: Math.max(reach.up, qy - py),
        down: Math.max(reach.down, py - qy),
      }
    }
  }

  const ax = px + canvas.clientWidth / 2
  const ay = canvas.clientHeight / 2 - py
  const avoid = avoidBoxes(canvas)
  const view = {
    left: 0,
    top: 0,
    right: canvas.clientWidth,
    bottom: canvas.clientHeight,
  }
  const candidates = [true, false].flatMap(right =>
    [true, false].map(up => {
      const x = (right ? reach.right : reach.left) + GAP
      const y = (up ? reach.up : reach.down) + GAP
      const elbowX = ax + (right ? x : -x)
      const elbowY = ay + (up ? -y : y)
      const left = right ? elbowX + ARM : elbowX - ARM - TIP.width
      const box = {
        left,
        top: elbowY - TIP.height / 2,
        right: left + TIP.width,
        bottom: elbowY + TIP.height / 2,
      }
      const blocked = avoid.reduce((sum, a) => sum + overlapOf(box, a), 0)
      const clipped = TIP.width * TIP.height - overlapOf(box, view)
      const natural = (right === px >= 0 ? 0 : 1) + (up === py >= 0 ? 0 : 1)

      return {
        away: { right, up, x, y },
        cost: blocked * 4 + clipped * 2 + natural,
      }
    }),
  )

  away = candidates.toSorted((a, b) => a.cost - b.cost)[0]?.away ?? away
}

type Tip = {
  key: string
  at: [number, number, number]
  away: Away
  title: string
  kind: string
  detail: string
  color: string | null
}

const tip = $derived.by((): Tip | null => {
  if (measure.active) {
    return null
  }

  if (part && anchor) {
    return {
      key: `part:${part.ref}`,
      at: anchor,
      away,
      title: part.ref,
      kind: part.category ?? "",
      detail: part.purpose ?? "",
      color: null,
    }
  }

  return probed
    ? {
        key: `net:${probed.net}`,
        at: probed.at,
        away,
        title: probed.net,
        kind: m.pcb_3d_net(),
        detail: "",
        color: palette.net(probed.net),
      }
    : null
})

const elbow = (a: Away) => [a.right ? a.x : -a.x, a.up ? -a.y : a.y] as const

const leaderPoints = (a: Away) => {
  const [x, y] = elbow(a)

  return `0,0 ${x},${y} ${a.right ? x + ARM : x - ARM},${y}`
}

const chosen = $derived(
  inspect.part?.box3d ? boxInWorld(pcb, inspect.part.box3d) : null,
)

const chosenLift = $derived(
  (inspect.part?.side === "bottom" ? -1 : 1) * explode,
)

let scenes = $state<Partial<Record<Layer, Object3D>>>({})

let sides = $state.raw<Partial<Record<Side, Object3D>>>({})

const owners = new Map<Mesh, string>()

const originals = new WeakMap<Mesh, Mesh["material"]>()

const faded = new Map<Material, Material>()

const reveal = {
  uCenter: { value: new Vector2() },
  uRadius: { value: 1e4 },
}

const withReveal: MeshBasicMaterial["onBeforeCompile"] = shader => {
  shader.uniforms.uCenter = reveal.uCenter
  shader.uniforms.uRadius = reveal.uRadius
  shader.vertexShader = `varying vec2 vLocal;\n${shader.vertexShader}`.replace(
    "#include <begin_vertex>",
    "#include <begin_vertex>\nvLocal = position.xy;",
  )
  shader.fragmentShader = `uniform vec2 uCenter;\nuniform float uRadius;\nvarying vec2 vLocal;\n${shader.fragmentShader}`
    .replace(
      "void main() {",
      "void main() {\nfloat revealed = uRadius - distance(vLocal, uCenter);\nif (revealed < 0.0) discard;",
    )
    .replace(
      "#include <dithering_fragment>",
      "#include <dithering_fragment>\ngl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(1.0), 0.7 * (1.0 - smoothstep(0.0, 1.2, revealed)));",
    )
}

const netMaterials = new Map<string, MeshBasicMaterial>()

const netMaterial = (net: string) => {
  const color = palette.net(net)
  const known = netMaterials.get(color)

  if (known) {
    return known
  }

  const made = new MeshBasicMaterial({
    color,
    side: DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  })

  made.onBeforeCompile = withReveal
  netMaterials.set(color, made)

  return made
}

const lit = new MeshBasicMaterial({
  color: "#fbbf24",
  side: DoubleSide,
  polygonOffset: true,
  polygonOffsetFactor: -2,
  polygonOffsetUnits: -2,
})

const capCopper = new MeshBasicMaterial({
  color: "#b9873a",
  side: DoubleSide,
  polygonOffset: true,
  polygonOffsetFactor: -1,
  polygonOffsetUnits: -1,
})

const capBody = new MeshBasicMaterial({ color: "#6f6136", side: DoubleSide })

const fadeOf = (material: Material) => {
  const known = faded.get(material)

  if (known) {
    return known
  }

  const made = material.clone()

  made.transparent = true
  made.opacity = material.opacity * FADE
  made.depthWrite = false
  faded.set(material, made)

  return made
}

const meshes = (root: Object3D) => {
  const found: Mesh[] = []

  root.traverse(o => {
    if (o instanceof Mesh) {
      found.push(o)
    }
  })

  return found
}

$effect(() => {
  const focus = inspect.focus

  for (const [layer, root] of Object.entries(scenes)) {
    for (const mesh of meshes(root)) {
      const base = originals.get(mesh) ?? mesh.material
      const kept =
        !focus ||
        (layer === "parts"
          ? focus.parts.has(owners.get(mesh) ?? "")
          : !overview)

      originals.set(mesh, base)
      mesh.material = kept
        ? base
        : Array.isArray(base)
          ? base.map(fadeOf)
          : fadeOf(base)

      for (const material of [base, mesh.material].flat()) {
        if ("wireframe" in material) {
          material.wireframe = wireframe
        }
      }
    }
  }

  invalidate()
})

const geometries = new Map<string, ReturnType<typeof geometryOf>>()

const cachedGeometry = (key: string, shapes: Polygon[]) => {
  const known = geometries.get(key)

  if (known) {
    return known
  }

  const made = geometryOf(shapes)

  made.computeBoundingBox()
  geometries.set(key, made)

  return made
}

$effect(() => {
  const source = copper

  if (!source) {
    return
  }

  const queue = Object.entries(source.nets).flatMap(([net, layers]) =>
    Object.entries(layers).map(([layer, shapes]) => ({
      key: `${layer}:${net}`,
      shapes,
    })),
  )
  let handle = 0

  const idle: (callback: IdleRequestCallback) => number =
    "requestIdleCallback" in window
      ? callback => requestIdleCallback(callback)
      : callback =>
          window.setTimeout(
            () => callback({ didTimeout: false, timeRemaining: () => 8 }),
            16,
          )

  const cancel =
    "cancelIdleCallback" in window
      ? (id: number) => cancelIdleCallback(id)
      : (id: number) => window.clearTimeout(id)

  const warm = (deadline: IdleDeadline) => {
    while (queue.length > 0 && deadline.timeRemaining() > 4) {
      const next = queue.shift()

      if (next) {
        cachedGeometry(next.key, next.shapes)
      }
    }

    if (queue.length > 0) {
      handle = idle(warm)
    }
  }

  handle = idle(warm)

  return () => cancel(handle)
})

const traces = $derived.by(() => {
  const focus = inspect.focus

  if (!copper || !index || !focus) {
    return []
  }

  const polygons = focusPolygons(
    index,
    copper,
    focus.nets,
    focus.planes,
    focus.near,
  )
  const last = copper.layers.length - 1

  return copper.layers.flatMap(({ name, z }, i) => {
    const found = polygons.get(name) ?? []
    const height =
      i === 0 ? z[1] + LIFT : i === last ? z[0] - LIFT : (z[0] + z[1]) / 2
    const nets = [...new Set(found.map(f => f.net))]

    return nets.map(net => {
      const shapes = found.filter(f => f.net === net).map(f => f.polygon)
      const whole = shapes.length === (copper.nets[net]?.[name]?.length ?? 0)

      return {
        key: `${name}:${net}`,
        height,
        material: netMaterial(net),
        geometry: cachedGeometry(
          whole ? `${name}:${net}` : `${name}:${net}:${shapes.length}:${focus.near?.join(",")}`,
          shapes,
        ),
      }
    })
  })
})

const REVEAL = { speed: 70, min: 500, max: 900, lead: 16 }

const origin = $derived.by((): [number, number] | null => {
  const selected = inspect.selection

  if (!selected) {
    return null
  }

  const ref =
    selected.kind === "part"
      ? selected.ref
      : [...(inspect.focus?.parts ?? [])][0]

  return pcb.footprints.find(f => f.ref === ref)?.at ?? [center.x, center.y]
})

const reachOf = (from: [number, number]) =>
  traces.reduce((far, t) => {
    t.geometry.boundingBox ?? t.geometry.computeBoundingBox()

    const box = t.geometry.boundingBox

    if (!box) {
      return far
    }

    const dx = Math.max(Math.abs(box.min.x - from[0]), Math.abs(box.max.x - from[0]))
    const dy = Math.max(Math.abs(box.min.y - from[1]), Math.abs(box.max.y - from[1]))

    return Math.max(far, Math.hypot(dx, dy))
  }, 0)

$effect(() => {
  const from = origin

  if (!from || traces.length === 0) {
    return
  }

  const reach = untrack(() => reachOf(from)) + 1
  const duration = prefersReducedMotion.current
    ? 0
    : Math.min(REVEAL.max, Math.max(REVEAL.min, (reach / REVEAL.speed) * 1000))
  const start = performance.now() - REVEAL.lead
  let frame = 0

  const step = (now: number) => {
    const t = duration === 0 ? 1 : Math.min(1, (now - start) / duration)

    reveal.uRadius.value = sineOut(t) * reach
    invalidate()

    if (t < 1) {
      frame = requestAnimationFrame(step)
    }
  }

  reveal.uCenter.value.set(from[0], from[1])
  step(performance.now())

  return () => cancelAnimationFrame(frame)
})

const PIN_LIMIT = 64

const LABEL = { char: 7, pad: 18, height: 18 }

let spaced = $state<Set<string>>(new Set())

type PinSide = "left" | "right" | "top" | "bottom"

const LABEL_GAP = 0.8

const pins = $derived.by(() => {
  const chosenPart = inspect.part
  const box = chosenPart?.box3d

  if (!copper || !index || !chosenPart || !box) {
    return []
  }

  const bottom = chosenPart.side === "bottom"
  const layer = bottom ? copper.layers.at(-1) : copper.layers[0]

  if (!layer) {
    return []
  }

  const [x0, y0, x1, y1] = [box.min[0], box.min[1], box.max[0], box.max[1]]
  const height = bottom ? layer.z[0] - LIFT * 2 : layer.z[1] + LIFT * 2
  const seen = new Set<string>()
  const world = (x: number, y: number) =>
    [x - center.x, height, y - center.y] as [number, number, number]

  const exact = (artwork?.pads ?? [])
    .filter(p => p.ref === chosenPart.ref && p.net)
    .map(p => ({ net: p.net, x: p.at[0], y: p.at[1] }))
  const spots =
    exact.length > 0
      ? exact
      : pinSpots(index, layer.name, chosenPart.nets ?? [], [x0, y0, x1, y1])

  return spots
    .filter(p => {
      const key = `${p.net}:${p.x.toFixed(1)}:${p.y.toFixed(1)}`
      const fresh = !seen.has(key)

      seen.add(key)

      return fresh
    })
    .slice(0, PIN_LIMIT)
    .map((p, i, all) => {
      const gaps: [PinSide, number][] = [
        ["left", p.x - x0],
        ["right", x1 - p.x],
        ["top", p.y - y0],
        ["bottom", y1 - p.y],
      ]
      const side = gaps.toSorted((a, b) => a[1] - b[1])[0]?.[0] ?? "right"
      const label =
        side === "left"
          ? world(x0 - LABEL_GAP, p.y)
          : side === "right"
            ? world(x1 + LABEL_GAP, p.y)
            : side === "top"
              ? world(p.x, y0 - LABEL_GAP)
              : world(p.x, y1 + LABEL_GAP)

      return {
        labeled: all.findIndex(q => q.net === p.net) === i,
        key: `${chosenPart.ref}:${p.net}:${p.x}:${p.y}`,
        net: p.net,
        side,
        at: world(p.x, p.y),
        label,
        color: palette.net(p.net),
      }
    })
})

const cap = $derived.by(() => {
  if (section === null || !copper) {
    return null
  }

  const plane = section - SLIVER
  const cut = sectionAt(
    copper,
    section + center.x,
    new Set(inspect.focus?.nets ?? []),
  )

  return {
    body: capGeometry(cut.dielectric, plane, center.y),
    copper: capGeometry(cut.plain, plane, center.y),
    lit: capGeometry(cut.lit, plane, center.y),
  }
})

$effect(() => {
  traces
  invalidate()
})

$effect(() => {
  const made = cap

  invalidate()

  return () => {
    made?.body.dispose()
    made?.copper.dispose()
    made?.lit.dispose()
  }
})

$effect(() => {
  if (sides.top) {
    sides.top.position.y = explode / 1000
  }

  if (sides.bottom) {
    sides.bottom.position.y = -explode / 1000
  }

  invalidate()
})

$effect(() => {
  renderer.localClippingEnabled = section !== null
  renderer.clippingPlanes =
    section === null ? [] : [new Plane(new Vector3(-1, 0, 0), section)]
  invalidate()
})

const raycaster = new Raycaster()

const pointer = new Vector2()

const aim = (e: PointerEvent) => {
  const rect = renderer.domElement.getBoundingClientRect()

  pointer.set(
    ((e.clientX - rect.left) / rect.width) * 2 - 1,
    -((e.clientY - rect.top) / rect.height) * 2 + 1,
  )
  raycaster.setFromCamera(pointer, camera.current)
}

const copperHit = () => {
  if (!copper || !index || !layers.copper) {
    return null
  }

  const { origin, direction } = raycaster.ray
  const down = direction.y < 0
  const order = down ? copper.layers : copper.layers.toReversed()
  const faces = layers.body ? order.slice(0, 1) : [order[0], order.at(-1)]

  for (const layer of faces) {
    if (!layer) {
      continue
    }

    const height = down ? layer.z[1] : layer.z[0]
    const distance = (height - origin.y) / direction.y
    const x = origin.x + direction.x * distance
    const z = origin.z + direction.z * distance

    if (distance <= 0 || (section !== null && x > section)) {
      continue
    }

    const net = netAt(index, layer.name, x + center.x, z + center.y)

    if (net) {
      return { net, distance, at: [x, height, z] as [number, number, number] }
    }
  }

  return null
}

const pick = () => {
  const facing = raycaster.ray.direction.y < 0 ? "top" : "bottom"
  const reachable = layers.body ? boxes.filter(b => b.side === facing) : boxes
  const found = layers.parts ? pickPart(reachable, raycaster.ray) : null
  const trace = copperHit()

  if (found && (!trace || found.distance <= trace.distance)) {
    return { ref: found.ref, trace: null }
  }

  return { ref: null, trace }
}

const surface = () => {
  const roots = LAYERS.filter(l => layers[l]).flatMap(l => scenes[l] ?? [])

  return raycaster.intersectObjects(roots, true)[0]?.point ?? null
}

$effect(() => {
  const canvas = renderer.domElement
  const active = new Set<number>()
  let frame = 0
  let last: PointerEvent | null = null
  let down: {
    id: number
    x: number
    y: number
    at: number
    travel: number
  } | null = null

  const settle = () => {
    frame = 0

    if (!last) {
      return
    }

    aim(last)

    const next = measure.active ? null : pick()

    hovered = next?.ref ?? null
    probed = next?.trace ?? null

    const point = anchor ?? probed?.at

    if (point) {
      aimLeader(point)
    }

    invalidate()
  }

  const move = (e: PointerEvent) => {
    if (down?.id === e.pointerId) {
      down.travel = Math.max(
        down.travel,
        Math.hypot(e.clientX - down.x, e.clientY - down.y),
      )
    }

    if (e.pointerType !== "mouse" || e.buttons !== 0) {
      return
    }

    last = e
    frame ||= requestAnimationFrame(settle)
  }

  const leave = () => {
    last = null
    hovered = null
    probed = null
    invalidate()
  }

  const press = (e: PointerEvent) => {
    active.add(e.pointerId)
    down =
      active.size === 1 && e.button === 0
        ? {
            id: e.pointerId,
            x: e.clientX,
            y: e.clientY,
            at: e.timeStamp,
            travel: 0,
          }
        : null
  }

  const click = (e: PointerEvent) => {
    aim(e)

    if (measure.active) {
      const hit = surface()

      if (hit) {
        measure.add([hit.x, hit.y, hit.z])
      }

      return
    }

    const { ref, trace } = pick()

    inspect.select(
      ref
        ? { kind: "part", ref }
        : trace
          ? { kind: "net", name: trace.net }
          : null,
    )
  }

  const release = (e: PointerEvent) => {
    const pressed = down
    const slop = e.pointerType === "mouse" ? SLOP.mouse : SLOP.touch

    active.delete(e.pointerId)
    down = null

    if (
      pressed?.id === e.pointerId &&
      pressed.travel <= slop &&
      e.timeStamp - pressed.at <= HOLD_MS
    ) {
      click(e)
    }
  }

  const cancel = (e: PointerEvent) => {
    active.delete(e.pointerId)
    down = null
  }

  canvas.addEventListener("pointermove", move)
  canvas.addEventListener("pointerleave", leave)
  canvas.addEventListener("pointerdown", press)
  canvas.addEventListener("pointerup", release)
  canvas.addEventListener("pointercancel", cancel)

  return () => {
    cancelAnimationFrame(frame)
    canvas.removeEventListener("pointermove", move)
    canvas.removeEventListener("pointerleave", leave)
    canvas.removeEventListener("pointerdown", press)
    canvas.removeEventListener("pointerup", release)
    canvas.removeEventListener("pointercancel", cancel)
  }
})

$effect(() => () => {
  scene.environment = null
  scene.background = null
  studio.dispose()

  for (const material of [
    lit,
    capCopper,
    capBody,
    ...faded.values(),
    ...netMaterials.values(),
  ]) {
    material.dispose()
  }

  for (const geometry of geometries.values()) {
    geometry.dispose()
  }

  renderer.forceContextLoss()
})

$effect(() => {
  const labeled = pins.filter(p => p.labeled)
  const current = controls
  let frame = 0

  const declutter = () => {
    frame = 0

    const canvas = renderer.domElement
    const taken: Box[] = []
    const kept = new Set<string>()

    for (const p of labeled) {
      const v = new Vector3(...p.label).project(camera.current)
      const x = ((v.x + 1) / 2) * canvas.clientWidth
      const y = ((1 - v.y) / 2) * canvas.clientHeight
      const width = p.net.length * LABEL.char + LABEL.pad
      const left =
        p.side === "left" ? x - width : p.side === "right" ? x : x - width / 2
      const top =
        p.side === "top"
          ? y - LABEL.height
          : p.side === "bottom"
            ? y
            : y - LABEL.height / 2
      const box = { left, top, right: left + width, bottom: top + LABEL.height }

      if (taken.every(t => overlapOf(box, t) === 0)) {
        taken.push(box)
        kept.add(p.key)
      }
    }

    spaced = kept
  }

  const schedule = () => {
    frame ||= requestAnimationFrame(declutter)
  }

  declutter()
  current?.addEventListener("update", schedule)

  return () => {
    cancelAnimationFrame(frame)
    current?.removeEventListener("update", schedule)
  }
})

$effect(() => {
  if (previewRef && anchor) {
    untrack(() => aimLeader(anchor))
    invalidate()
  }
})

$effect(() => {
  const flight = inspect.flight

  if (!flight || !controls) {
    return
  }

  const bounds = new Bounds()

  for (const ref of flight.refs) {
    const box = pcb.footprints.find(f => f.ref === ref)?.box3d

    if (box) {
      const { center: c, size } = boxInWorld(pcb, box)

      bounds.expandByPoint(new Vector3(c[0] - size[0] / 2, c[1] - size[1] / 2, c[2] - size[2] / 2))
      bounds.expandByPoint(new Vector3(c[0] + size[0] / 2, c[1] + size[1] / 2, c[2] + size[2] / 2))
    }
  }

  if (!bounds.isEmpty()) {
    const pad = Math.max(2, span * 0.05)
    const least = span * 0.35
    const mid = bounds.getCenter(new Vector3())
    const size = bounds.getSize(new Vector3())

    bounds.expandByVector(
      new Vector3(
        Math.max(0, least - size.x) / 2,
        0,
        Math.max(0, least - size.z) / 2,
      ),
    )
    bounds.expandByPoint(mid)

    untrack(() =>
      controls?.fitToBox(bounds, !prefersReducedMotion.current, {
        paddingTop: pad,
        paddingBottom: pad,
        paddingLeft: pad,
        paddingRight: pad,
      }),
    )
  }
})

let framed = false

$effect(() => {
  if (controls && !framed) {
    framed = true
    look(controls, overview ? "iso" : "top", span, false)
  }
})

let warmed = false

$effect(() => {
  if (warmed || LAYERS.some(l => !scenes[l])) {
    return
  }

  warmed = true

  untrack(() => {
    const swapped: [Mesh, Mesh["material"]][] = []

    for (const root of Object.values(scenes)) {
      for (const mesh of meshes(root)) {
        const base = mesh.material

        swapped.push([mesh, base])
        mesh.material = Array.isArray(base) ? base.map(fadeOf) : fadeOf(base)
      }
    }

    const probe = new Mesh(new PlaneGeometry(0.001, 0.001), netMaterial("GND"))

    scene.add(probe)

    const done = renderer.compileAsync(scene, camera.current)

    for (const [mesh, base] of swapped) {
      mesh.material = base
    }

    scene.remove(probe)
    done.finally(() => probe.geometry.dispose())
  })
})

const loaded = (layer: Layer) => (gltf: { scene: Group }) => {
  restyle(layer, gltf.scene)

  if (layer === "parts") {
    sides = {
      top: gltf.scene.getObjectByName("top"),
      bottom: gltf.scene.getObjectByName("bottom"),
    }

    for (const side of Object.values(sides)) {
      for (const group of side?.children ?? []) {
        for (const mesh of meshes(group)) {
          owners.set(mesh, group.name)
        }
      }
    }
  }

  scenes[layer] = gltf.scene
  invalidate()
}
</script>

<T.PerspectiveCamera
  makeDefault
  position={[span * 0.9, span * 1.1, span * 1.2]}
  fov={35}
  near={0.5}
  far={span * 40}
>
  <CameraControls bind:ref={controls} />
</T.PerspectiveCamera>

{#if overview}
  <Gizmo placement="bottom-right" size={88} />
{/if}

<T.AmbientLight intensity={0.35} />
<T.DirectionalLight position={[span, span * 2, span]} intensity={1.1} />
<T.DirectionalLight position={[-span, -span * 2, -span]} intensity={0.5} />

<T.Group position={[-center.x, 0, -center.y]} scale={1000}>
  {#each LAYERS as layer (layer)}
    <GLTF
      url={urls[layer]}
      meshoptDecoder={meshopt}
      visible={layers[layer]}
      onload={loaded(layer)}
      {onerror}
    />
  {/each}
</T.Group>

{#each traces as t (t.key)}
  <T.Mesh
    geometry={t.geometry}
    material={t.material}
    position={[-center.x, t.height, -center.y]}
    rotation.x={Math.PI / 2}
  />
{/each}

{#if cap}
  <T.Mesh geometry={cap.body} material={capBody} />
  <T.Mesh geometry={cap.copper} material={capCopper} />
  <T.Mesh geometry={cap.lit} material={lit} />
{/if}

{#if chosen && !overview}
  <HTML position={chosen.center} center pointerEvents="none">
    <span class="ring-warning block size-6 rounded-full ring-2"></span>
  </HTML>
{/if}

{#if chosen && !measure.active}
  <T.Mesh
    position={[chosen.center[0], chosen.center[1] + chosenLift, chosen.center[2]]}
    scale={chosen.size}
  >
    <T.BoxGeometry />
    <T.MeshBasicMaterial visible={false} />
    <Edges color="#fbbf24" />
  </T.Mesh>
{/if}

<T.Mesh
  visible={!!highlight && !measure.active}
  position={highlight
    ? [highlight.center[0], highlight.center[1] + lift, highlight.center[2]]
    : [0, 0, 0]}
  scale={highlight?.size ?? [1, 1, 1]}
>
  <T.BoxGeometry />
  <T.MeshBasicMaterial color={partTint} transparent opacity={0.16} depthWrite={false} />
  <Edges color={partTint} />
</T.Mesh>

{#each pins as p (p.key)}
  <HTML position={p.at} center pointerEvents="none">
    <span
      class="ring-base-100 block size-2 rounded-full ring-2"
      style:background={p.color}
      transition:pop|global
    ></span>
  </HTML>
  {#if p.labeled && spaced.has(p.key)}
    <HTML position={p.label} pointerEvents="none">
      <span
        class={[
          "bg-base-100 text-base-content border-base-300 rounded-field absolute flex items-center gap-1",
          "border px-2 text-xs font-medium whitespace-nowrap shadow-sm",
          p.side === "left" && "right-0 -translate-y-1/2",
          p.side === "right" && "left-0 -translate-y-1/2",
          p.side === "top" && "bottom-0 -translate-x-1/2",
          p.side === "bottom" && "top-0 -translate-x-1/2",
        ]}
        transition:pop|global
      >
        <span class="size-2 shrink-0 rounded-full" style:background={p.color}></span>
        {p.net}
      </span>
    </HTML>
  {/if}
{/each}

{#each tip ? [tip] : [] as t (t.key)}
  <HTML position={t.at} center pointerEvents="none">
    <div class="relative size-0">
      <span
        class="bg-warning ring-neutral absolute -top-1 -left-1 size-2 rounded-full ring-2"
        transition:fade|global
      ></span>
      <svg aria-hidden="true" class="text-neutral absolute top-0 left-0 size-1 overflow-visible">
        <polyline
          points={leaderPoints(t.away)}
          fill="none"
          stroke="currentColor"
          stroke-width="1.5"
          stroke-linejoin="round"
          in:trace|global
          out:trace|global={{ delay: 100 }}
        />
      </svg>
      <div
        class={[
          "bg-neutral text-neutral-content rounded-field absolute flex max-w-56 -translate-y-1/2",
          "flex-col px-2 py-1 text-xs whitespace-nowrap shadow-sm",
        ]}
        style:left={t.away.right ? rem(t.away.x + ARM) : undefined}
        style:right={t.away.right ? undefined : rem(t.away.x + ARM)}
        style:top={rem(elbow(t.away)[1])}
        in:pop|global={{ delay: 120 }}
        out:pop|global
      >
        <span class="flex items-center gap-1 truncate">
          {#if t.color}
            <span class="size-2 shrink-0 rounded-full" style:background={t.color}></span>
          {/if}
          <span class="font-semibold">{t.title}</span>
          <span class="opacity-70">{t.kind}</span>
        </span>
        {#if t.detail}
          <span class="truncate opacity-80">{t.detail}</span>
        {/if}
      </div>
    </div>
  </HTML>
{/each}

<MeasureMarks {measure} />
