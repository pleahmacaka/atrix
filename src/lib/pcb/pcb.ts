import { native } from "#lib/native.ts"

export type Board = {
  name: string
  title: string | null
  circuit: string | null
  pcb: string
  schematic: string | null
  bom: string | null
}

export type Project = {
  root: string
  name: string
  title: string | null
  assembly: string | null
  boards: Board[]
}

export type Derived = {
  boards: [name: string, dir: string][]
  assembly: string | null
}

export const findProject = (cwd: string) =>
  native<Project | null>("pcb_project", { cwd })

export const readFile = (root: string, path: string) =>
  native<ArrayBuffer>("pcb_read", { root, path })

export const listFiles = (root: string, dir: string) =>
  native<string[]>("pcb_files", { root, dir })

export const derive = (root: string, assembly: boolean) =>
  native<Derived>("pcb_derive", { root, assembly })
