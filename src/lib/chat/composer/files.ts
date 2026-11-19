import { get, set } from "idb-keyval"
import { SvelteMap } from "svelte/reactivity"
import { isImage } from "../attachments.ts"

const ATTACHED = "attached:"

const restored = new Set<string>()

const attached = new SvelteMap<string, File[]>()

export const previewsOf = new SvelteMap<File, string>()

const preview = (file: File) => {
  if (isImage(file)) {
    previewsOf.set(file, URL.createObjectURL(file))
  }
}

export const release = (file: File) => {
  const url = previewsOf.get(file)

  if (url) {
    URL.revokeObjectURL(url)
    previewsOf.delete(file)
  }
}

const restore = (draft: string) => {
  if (restored.has(draft)) {
    return
  }

  restored.add(draft)
  get<File[]>(ATTACHED + draft)
    .then(files => {
      if (!files?.length || attached.has(draft)) {
        return
      }

      files.forEach(preview)
      attached.set(draft, files)
    })
    .catch(() => {})
}

export const filesOf = (draft: string) => {
  restore(draft)

  return attached.get(draft) ?? []
}

export const setFiles = (draft: string, value: File[]) => {
  attached.set(draft, value)
  set(ATTACHED + draft, value).catch(() => {})
}

export const addFiles = (draft: string, list: Iterable<File>) => {
  const added = [...list]

  added.forEach(preview)
  setFiles(draft, [...filesOf(draft), ...added])
}

export const replaceFile = (draft: string, file: File, next: File) => {
  release(file)
  preview(next)
  setFiles(
    draft,
    filesOf(draft).map(f => (f === file ? next : f)),
  )
}

export const removeFile = (draft: string, file: File) => {
  release(file)
  setFiles(
    draft,
    filesOf(draft).filter(f => f !== file),
  )
}
