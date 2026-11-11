import {
  Group,
  Mesh,
  MeshStandardMaterial,
  type Object3D,
  Vector3,
} from "three"
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js"
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js"
import { derivedHrefs, loadDerived, type Outputs } from "../derived.ts"
import { restyle } from "../three/studio.ts"
import { DERIVED, LAYERS, type Pcb } from "../types.ts"
import {
  type Assembly,
  type AssemblyBoard,
  type CaseInfo,
  type Colliders,
  casePath,
  type Situation,
} from "./types.ts"

export type Trimesh = { vertices: Float32Array; indices: Uint32Array }

export type Kit = {
  assembly: Assembly
  situation: Situation | null
  cases: CaseInfo[]
  colliders: Colliders
  objects: Map<string, Object3D>
  meshes: Map<string, Trimesh>
}

const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder)

const load = async (url: string) => (await loader.loadAsync(url)).scene

const CASE_LOOK = {
  opaque: () => new MeshStandardMaterial({ color: "#2b2d31", roughness: 0.6 }),
  translucent: () =>
    new MeshStandardMaterial({
      color: "#f4f6ff",
      roughness: 0.2,
      transparent: true,
      opacity: 0.55,
      emissive: "#9fb4ff",
      emissiveIntensity: 0.25,
    }),
  plunger: () =>
    new MeshStandardMaterial({ color: "#d4d4d8", roughness: 0.45 }),
}

const dress = (root: Object3D, make: () => MeshStandardMaterial) => {
  const material = make()

  root.traverse(o => {
    if (o instanceof Mesh) {
      o.material = material
    }
  })
}

const boardObject = async (outputs: Outputs, place: AssemblyBoard) => {
  const [pcb, urls] = await Promise.all([
    loadDerived<Pcb>(outputs, DERIVED.pcb),
    derivedHrefs(outputs, LAYERS.map(DERIVED.glb)),
  ])

  if (!pcb) {
    return null
  }

  const box = pcb.dims.board
  const inner = new Group()
  inner.position.set(
    -(box.min[0] + box.max[0]) / 2,
    0,
    -(box.min[1] + box.max[1]) / 2,
  )
  inner.scale.setScalar(1000)

  const layers = await Promise.all(
    LAYERS.map(async (layer, i) => {
      const url = urls[i]

      if (!url) {
        return null
      }

      const scene = await load(url)
      restyle(layer, scene)

      return scene
    }),
  )

  for (const scene of layers) {
    if (scene) {
      inner.add(scene)
    }
  }

  const outer = new Group()
  outer.position.set(place.position[0], place.position[2], -place.position[1])
  outer.rotation.set(
    ((place.tilt ?? 0) * Math.PI) / 180,
    (place.rotation * Math.PI) / 180,
    0,
    "YXZ",
  )
  outer.add(inner)

  return outer
}

const caseObject = async (url: string, part: string, translucent: boolean) => {
  const scene = await load(url)
  dress(
    scene,
    translucent
      ? CASE_LOOK.translucent
      : part === "plunger"
        ? CASE_LOOK.plunger
        : CASE_LOOK.opaque,
  )

  const root = new Group()
  root.scale.setScalar(1000)
  root.add(scene)

  return root
}

export const trimeshOf = (root: Object3D): Trimesh => {
  root.updateMatrixWorld(true)

  const vertices: number[] = []
  const indices: number[] = []
  const point = new Vector3()

  root.traverse(o => {
    if (!(o instanceof Mesh)) {
      return
    }

    const position = o.geometry.attributes.position
    const index = o.geometry.index
    const base = vertices.length / 3

    for (let i = 0; i < position.count; i++) {
      point.fromBufferAttribute(position, i).applyMatrix4(o.matrixWorld)
      vertices.push(point.x, point.y, point.z)
    }

    for (let i = 0; i < (index?.count ?? position.count); i++) {
      indices.push(base + (index ? index.getX(i) : i))
    }
  })

  return {
    vertices: new Float32Array(vertices),
    indices: new Uint32Array(indices),
  }
}

export const loadKit = async (
  assembly: Outputs,
  boards: { key: string; outputs: Outputs }[],
): Promise<Kit | null> => {
  const [plan, situation, cases, colliders] = await Promise.all([
    loadDerived<Assembly>(assembly, "assembly.json"),
    loadDerived<Situation>(assembly, "situation.json"),
    loadDerived<CaseInfo[]>(assembly, "cases.json"),
    loadDerived<Colliders>(assembly, "colliders.json"),
  ])

  if (!plan || !cases || !colliders) {
    return null
  }

  const objects = new Map<string, Object3D>()
  const meshes = new Map<string, Trimesh>()
  const caseParts = cases.flatMap(c =>
    c.parts.flatMap(p =>
      [p.name, ...(p.variants ?? []).map(v => `${p.name}.${v}`)].map(file => ({
        caseId: c.id,
        ...p,
        file,
      })),
    ),
  )
  const hrefs = await derivedHrefs(
    assembly,
    caseParts.map(p => casePath(p.caseId, p.file)),
  )

  await Promise.all([
    ...plan.boards.map(async place => {
      const outputs = boards.find(b => b.key === (place.board ?? ""))?.outputs

      const object = outputs ? await boardObject(outputs, place) : null

      if (object) {
        objects.set(`board:${place.id}`, object)
      }
    }),
    ...caseParts.map(async (part, i) => {
      const url = hrefs[i]

      if (!url) {
        return
      }

      const object = await caseObject(url, part.name, part.translucent)
      const key = `case:${part.caseId}/${part.file}`
      objects.set(key, object)

      if (colliders.cases[part.caseId]?.[part.name] === "mesh") {
        meshes.set(key, trimeshOf(object))
      }
    }),
  ])

  return { assembly: plan, situation, cases, colliders, objects, meshes }
}
