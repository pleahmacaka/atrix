export type Vec3 = [number, number, number]

export type Box = [Vec3, Vec3]

export type AssemblyBoard = {
  id: string
  board: string | null
  position: Vec3
  rotation: number
  tilt?: number
}

export type Assembly = {
  boards: AssemblyBoard[]
}

export type CasePart = {
  name: string
  title: string
  translucent: boolean
  variants?: string[]
}

export type CaseVariant = { id: string; title: string }

export type CaseInfo = {
  id: string
  title: string
  boards: string[]
  size: Vec3
  variants?: CaseVariant[]
  parts: CasePart[]
}

export type Colliders = {
  boards: Record<string, Box[]>
  cases: Record<string, Record<string, Box[] | "mesh">>
}

export type BodyPart = { board: string } | { case: string; part: string }

export type SimBody = {
  id: string
  parts: BodyPart[]
  type: "fixed" | "dynamic"
  collide?: boolean
  from?: Vec3
  release?: number
  slide?: number
}

export type SimScene = {
  id: string
  title: string
  duration: number
  slowmo?: number
  gravity?: boolean
  bodies: SimBody[]
  captions?: { t: number; text: string }[]
}

export type Situation = { scenes: SimScene[] }

export const GRAVITY_MM = 9810

export const casePath = (caseId: string, part: string) =>
  `cases/${caseId}/${part}.glb`

export const partFile = (part: CasePart, variant: string | undefined) =>
  variant && part.variants?.includes(variant)
    ? `${part.name}.${variant}`
    : part.name

export const toThree = ([x, y, z]: Vec3): Vec3 => [x, z, -y]

export const boxCollider = ([lo, hi]: Box) => ({
  center: toThree([
    (lo[0] + hi[0]) / 2,
    (lo[1] + hi[1]) / 2,
    (lo[2] + hi[2]) / 2,
  ]),
  half: [(hi[0] - lo[0]) / 2, (hi[2] - lo[2]) / 2, (hi[1] - lo[1]) / 2] as Vec3,
})

export const captionAt = (scene: SimScene, t: number) =>
  (scene.captions ?? []).filter(c => c.t <= t).at(-1)?.text ?? ""

export const partKey = (part: BodyPart) =>
  "board" in part ? `board:${part.board}` : `case:${part.case}/${part.part}`
